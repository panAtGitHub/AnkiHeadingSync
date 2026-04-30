import { ButtonComponent, PluginSettingTab, Setting } from "obsidian";

import {
  DEFAULT_OBSIDIAN_BACKLINK_LABEL,
  isRunScopeConfigured,
  normalizePluginSettings,
  type CardAnswerCutoffMode,
  type CardTypeConfigId,
  type FileDeckInsertLocation,
  type FolderDeckMode,
  type ObsidianBacklinkPlacement,
  type ScopeMode,
  validatePluginSettings,
} from "@/application/config/PluginSettings";
import {
  createNoteFieldMappingKey,
  isQaGroupFieldMapping,
  type NoteModelFieldMapping,
  type NoteModelFieldMappingCardType,
  type QaGroupFieldMapping,
} from "@/application/config/NoteModelFieldMapping";
import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import { renderUserFacingMessage, toUserFacingMessage, type UserFacingMessage } from "@/application/errors/PluginUserError";
import { NoteFieldMappingService } from "@/application/services/NoteFieldMappingService";
import {
  areQaGroupWarningsAccepted,
  parseQaGroupFieldWarning,
  QaGroupFieldMappingService,
} from "@/application/services/QaGroupFieldMappingService";
import { t } from "@/presentation/i18n";
import type AnkiHeadingSyncPlugin from "@/presentation/AnkiHeadingSyncPlugin";

import { buildFolderTreeSelection, toggleFolderTreeSelection, type FolderTreeSelectionNode } from "./FolderScopeTree";

const FOLDER_TREE_STATUS_LOADING: UserFacingMessage = { key: "settings.scope.loading" };
const TEXT_SAVE_DEBOUNCE_MS = 500;
const SETTINGS_CARD_ORDER = ["card-types", "sync-content", "deck", "scope", "commands"] as const;
const VISIBLE_CARD_TYPE_CONFIG_IDS = ["basic", "qa-group", "cloze", "cloze-all"] as const;
const SETTINGS_STICKY_CARD_GAP_PX = 8;
const SETTINGS_PAGE_HEADER_FALLBACK_HEIGHT_PX = 64;
const SETTINGS_PAGE_HEADER_HEIGHT_VARIABLE = "--ahs-settings-page-header-height";
const SETTINGS_STICKY_CARD_GAP_VARIABLE = "--ahs-settings-sticky-card-gap";
const SETTINGS_PAGE_HEADER_HEIGHT_FALLBACK = `${SETTINGS_PAGE_HEADER_FALLBACK_HEIGHT_PX}px`;
const SETTINGS_STICKY_CARD_GAP = `${SETTINGS_STICKY_CARD_GAP_PX}px`;
const SETTINGS_ROOT_CLASS = "anki-heading-sync-settings";
const SETTINGS_CARD_BODY_HIDDEN_CLASS = "ahs-is-hidden";

type SettingsCardId = (typeof SETTINGS_CARD_ORDER)[number];
type NoteTypeCacheCheckStatus = "idle" | "checking" | "same" | "changed" | "failed";

interface SettingsCardShell {
  cardEl: HTMLElement;
  headerEl: HTMLButtonElement;
  bodyEl: HTMLElement;
}

interface PendingTextSave {
  timer: ReturnType<Window["setTimeout"]>;
  saveAction: (draftValue: string) => Promise<void>;
}

function addClasses(element: HTMLElement, ...classNames: string[]): void {
  element.classList.add(...classNames);
}

function setClassEnabled(element: HTMLElement, className: string, enabled: boolean): void {
  if (enabled) {
    element.classList.add(className);
    return;
  }

  element.classList.remove(className);
}

export class AnkiHeadingSyncSettingTab extends PluginSettingTab {
  private readonly noteFieldMappingService = new NoteFieldMappingService();
  private readonly qaGroupFieldMappingService = new QaGroupFieldMappingService();
  private readonly availableNoteModels: string[] = [];
  private readonly draftMappings: Record<string, NoteModelFieldMapping> = {};
  private readonly loadedModelDetails: Record<string, NoteModelDetails> = {};
  private readonly debouncedTextSaves = new Map<string, PendingTextSave>();
  private readonly textDraftValues = new Map<string, string>();
  private readonly cardShells = new Map<SettingsCardId, SettingsCardShell>();
  private readonly expandedCardIds = new Set<SettingsCardId>();
  private readonly expandedFolderPaths = new Set<string>();

  private folderTree: FolderTreeNode[] = [];
  private folderTreeStatus: UserFacingMessage = FOLDER_TREE_STATUS_LOADING;
  private folderTreeLoadPromise: Promise<void> | null = null;
  private hasLoadedFolderTree = false;
  private displayInitialized = false;
  private ankiConfigLoading = false;
  private cardTypeStatusOverride: UserFacingMessage | null = null;
  private noteTypeCacheCheckStatus: NoteTypeCacheCheckStatus = "idle";
  private noteTypeCacheCheckPromise: Promise<void> | null = null;
  private detectedAnkiNoteTypeCache: string[] | null = null;
  private noteTypeCacheCheckToken = 0;
  private pageHeaderResizeObserver: ResizeObserver | null = null;
  private scopeNeedsSelectedAncestorExpansion = true;

  constructor(plugin: AnkiHeadingSyncPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  declare plugin: AnkiHeadingSyncPlugin;

  hide(): void {
    this.disconnectPageHeaderResizeObserver();
    super.hide();
    this.displayInitialized = false;
    this.cardShells.clear();
    void this.flushDebouncedTextSaves();
    this.cardTypeStatusOverride = null;
    this.noteTypeCacheCheckStatus = "idle";
    this.noteTypeCacheCheckPromise = null;
    this.detectedAnkiNoteTypeCache = null;
    this.noteTypeCacheCheckToken += 1;
    this.scopeNeedsSelectedAncestorExpansion = true;
  }

  display(): void {
    const { containerEl } = this;
    const previousScrollTop = containerEl.scrollTop;

    containerEl.classList.add(SETTINGS_ROOT_CLASS);

    if (!this.displayInitialized) {
      containerEl.style.setProperty(SETTINGS_PAGE_HEADER_HEIGHT_VARIABLE, SETTINGS_PAGE_HEADER_HEIGHT_FALLBACK);
      containerEl.style.setProperty(SETTINGS_STICKY_CARD_GAP_VARIABLE, SETTINGS_STICKY_CARD_GAP);
      containerEl.empty();

      const pageHeaderEl = containerEl.createDiv();
      pageHeaderEl.dataset.settingsPageHeader = "true";
      addClasses(pageHeaderEl, "ahs-settings-page-header");

      const pageHeaderMaskEl = pageHeaderEl.createDiv();
      pageHeaderMaskEl.dataset.settingsPageHeaderMask = "true";
      addClasses(pageHeaderMaskEl, "ahs-settings-page-header-mask");

      const titleSetting = new Setting(pageHeaderEl).setName(t("settings.pluginTitle")).setHeading();
      addClasses(titleSetting.settingEl, "ahs-settings-page-title-setting");
      addClasses(titleSetting.nameEl, "ahs-settings-page-title");

      this.observePageHeaderHeight(pageHeaderEl);

      const cardsContainerEl = containerEl.createDiv();
      cardsContainerEl.dataset.settingsCardsContainer = "true";
      this.initializeCards(cardsContainerEl);
      this.displayInitialized = true;
    }

    for (const cardId of SETTINGS_CARD_ORDER) {
      this.renderCard(cardId);
    }

    containerEl.scrollTop = previousScrollTop;
  }

  private markActionButton(button: ButtonComponent): void {
    button.setCta();
  }

  private initializeCards(containerEl: HTMLElement): void {
    this.cardShells.clear();

    for (const cardId of SETTINGS_CARD_ORDER) {
      const cardEl = containerEl.createDiv();
      cardEl.dataset.settingsCard = cardId;

      const headerEl = cardEl.createEl("button");
      headerEl.type = "button";
      headerEl.dataset.settingsCardToggle = cardId;
      addClasses(headerEl, "ahs-settings-card-toggle");
      headerEl.addEventListener("click", () => {
        this.toggleCard(cardId);
      });

      const bodyEl = cardEl.createDiv();
      bodyEl.dataset.settingsCardBody = cardId;
      addClasses(bodyEl, "ahs-settings-card-body", SETTINGS_CARD_BODY_HIDDEN_CLASS);

      this.cardShells.set(cardId, {
        cardEl,
        headerEl,
        bodyEl,
      });
    }
  }

  private toggleCard(cardId: SettingsCardId): void {
    if (this.expandedCardIds.has(cardId)) {
      this.expandedCardIds.delete(cardId);
    } else {
      this.expandedCardIds.add(cardId);
    }

    this.renderCard(cardId);
  }

  private renderCard(cardId: SettingsCardId): void {
    const shell = this.cardShells.get(cardId);
    if (!shell) {
      return;
    }

    const expanded = this.expandedCardIds.has(cardId);
    shell.headerEl.textContent = `${expanded ? "▾" : "▸"} ${this.getCardTitle(cardId)}`;
    shell.headerEl.setAttr("aria-expanded", String(expanded));
    setClassEnabled(shell.bodyEl, SETTINGS_CARD_BODY_HIDDEN_CLASS, !expanded);
    shell.bodyEl.empty();

    if (!expanded) {
      return;
    }

    if (cardId === "card-types") {
      this.renderCardTypesCard(shell.bodyEl);
      return;
    }

    if (cardId === "sync-content") {
      this.renderSyncContentCard(shell.bodyEl);
      return;
    }

    if (cardId === "scope") {
      this.renderScopeCard(shell.bodyEl);
      return;
    }

    if (cardId === "deck") {
      this.renderDeckCard(shell.bodyEl);
      return;
    }

    this.renderCommandsCard(shell.bodyEl);
  }

  private observePageHeaderHeight(pageHeaderEl: HTMLElement): void {
    this.disconnectPageHeaderResizeObserver();
    this.updatePageHeaderHeight(pageHeaderEl);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    this.pageHeaderResizeObserver = new ResizeObserver(() => {
      this.updatePageHeaderHeight(pageHeaderEl);
    });
    this.pageHeaderResizeObserver.observe(pageHeaderEl);
  }

  private updatePageHeaderHeight(pageHeaderEl: HTMLElement): void {
    const measuredHeight = pageHeaderEl.getBoundingClientRect().height;
    if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) {
      return;
    }

    this.containerEl.style.setProperty(SETTINGS_PAGE_HEADER_HEIGHT_VARIABLE, `${Math.round(measuredHeight)}px`);
  }

  private disconnectPageHeaderResizeObserver(): void {
    this.pageHeaderResizeObserver?.disconnect();
    this.pageHeaderResizeObserver = null;
  }

  private renderCardTypesCard(containerEl: HTMLElement): void {
    this.hydrateVisibleCardTypeCaches();
    this.maybeStartNoteTypeCacheCheck();

    const actionRow = containerEl.createDiv();
    addClasses(actionRow, "ahs-settings-action-row");
    const loadButton = new ButtonComponent(actionRow)
      .setButtonText(this.ankiConfigLoading
        ? t("settings.cards.cardTypes.loadAnki.loading")
        : t("settings.cards.cardTypes.loadAnki.button"))
      .setCta()
      .setDisabled(this.ankiConfigLoading)
      .onClick(() => this.loadAnkiCardTypeConfig());
    loadButton.buttonEl.dataset.cardTypesRefresh = "true";
    actionRow.createSpan({
      text: `${t("settings.cards.cardTypes.statusLabel")}${renderUserFacingMessage(this.getCardTypeStatusMessage())}`,
    });

    const cardTypeList = containerEl.createDiv();
    cardTypeList.dataset.cardTypeList = "true";
    addClasses(cardTypeList, "ahs-settings-card-list");

    for (const configId of VISIBLE_CARD_TYPE_CONFIG_IDS) {
      this.renderCardTypeBlock(cardTypeList, configId);
    }
  }

  private renderCardTypeBlock(containerEl: HTMLElement, configId: CardTypeConfigId): void {
    const config = this.plugin.settings.cardTypeConfigs[configId];
    const blockEl = containerEl.createDiv();
    blockEl.dataset.cardTypeConfig = configId;
    addClasses(blockEl, "ahs-settings-card-type-block");

    const headerRow = blockEl.createDiv();
    addClasses(headerRow, "ahs-settings-card-type-header");

    const enabledCheckbox = headerRow.createEl("input");
    enabledCheckbox.type = "checkbox";
    enabledCheckbox.checked = config.enabled;
    enabledCheckbox.dataset.cardTypeEnabled = configId;
    enabledCheckbox.addEventListener("change", () => {
      void this.saveCardTypeConfig(configId, { enabled: enabledCheckbox.checked });
    });

    const titleEl = headerRow.createEl("strong", { text: this.getCardTypeLabel(configId) });
    addClasses(titleEl, "ahs-settings-card-type-title");

    const recognitionRow = blockEl.createDiv();
    addClasses(recognitionRow, "ahs-settings-recognition-row");

    const headingGroup = this.createInlineControlGroup(recognitionRow, t("settings.cards.cardTypes.labels.headingLevel"));
    const headingSelect = this.createSelect(headingGroup, `card-type-heading:${configId}`);
    headingSelect.dataset.cardTypeHeading = configId;
    addClasses(headingSelect, "ahs-settings-heading-select");
    for (let level = 1; level <= 6; level += 1) {
      this.appendOption(headingSelect, String(level), `H${level}`);
    }
    headingSelect.value = String(config.headingLevel);
    headingSelect.addEventListener("change", () => {
      void this.saveCardTypeConfig(configId, { headingLevel: Number(headingSelect.value) });
    });

    const markerGroup = this.createInlineControlGroup(recognitionRow, t("settings.cards.cardTypes.labels.extraMarker"));
    const markerInput = markerGroup.createEl("input");
    markerInput.type = "text";
    markerInput.dataset.cardTypeMarker = configId;
    markerInput.placeholder = t("settings.cards.cardTypes.markerPlaceholder");
    addClasses(markerInput, "ahs-settings-marker-input");
    markerInput.value = this.getDraftValue(`card-type-marker:${configId}`, config.extraMarker);
    markerInput.addEventListener("input", () => {
      this.scheduleDebouncedTextSave(`card-type-marker:${configId}`, markerInput.value, async (draftValue) => {
        const persisted = await this.saveCardTypeConfig(configId, { extraMarker: draftValue });
        if (persisted) {
          this.textDraftValues.delete(`card-type-marker:${configId}`);
        }
      });
    });

    if (configId === "cloze-all") {
      const sharedHintEl = blockEl.createEl("p", {
        text: t("settings.cards.cardTypes.sharedClozeMappingHint"),
      });
      sharedHintEl.dataset.cardTypeSharedHint = configId;
      addClasses(sharedHintEl, "ahs-settings-muted-text");
      return;
    }

    const ankiRow = blockEl.createDiv();
    addClasses(ankiRow, "ahs-settings-grid-row");

    const noteTypeGroup = this.createGridControlSlot(ankiRow, t("settings.cards.cardTypes.labels.noteType"));
    const noteTypeSelect = this.createSelect(noteTypeGroup, `card-type-note-type:${configId}`);
    noteTypeSelect.dataset.cardTypeNoteType = configId;
    this.applyFluidEllipsis(noteTypeSelect);
    for (const noteModel of this.getSelectableNoteModels(config.noteType)) {
      this.appendOption(noteTypeSelect, noteModel, noteModel);
    }
    noteTypeSelect.value = config.noteType;
    noteTypeSelect.disabled = this.ankiConfigLoading;
    noteTypeSelect.addEventListener("change", () => {
      void this.saveCardTypeConfig(configId, { noteType: noteTypeSelect.value });
    });

    this.renderCardTypeFieldControls(ankiRow, configId);
  }

  private renderCardTypeFieldControls(containerEl: HTMLElement, configId: CardTypeConfigId): void {
    if (configId === "qa-group") {
      this.renderQaGroupFieldControls(containerEl, configId);
      return;
    }

    const mapping = this.getCurrentMappingForConfig(configId);
    if (configId === "cloze") {
      const mainFieldGroup = this.createGridControlSlot(containerEl, t("settings.cards.cardTypes.labels.mainField"));
      const mainFieldSelect = this.createFieldSelect(mainFieldGroup, `card-type-question-field:${configId}`);
      const clozeMapping = mapping && "mainField" in mapping ? mapping : undefined;
      mainFieldSelect.dataset.cardTypeQuestionField = configId;
      this.applyFluidEllipsis(mainFieldSelect);
      this.populateFieldSelect(mainFieldSelect, clozeMapping?.loadedFieldNames ?? [], clozeMapping?.mainField);
      mainFieldSelect.addEventListener("change", () => {
        void this.saveFieldMapping(configId, { mainField: mainFieldSelect.value || undefined });
      });
      return;
    }

    const titleFieldGroup = this.createGridControlSlot(containerEl, t("settings.cards.cardTypes.labels.questionField"));
    const titleFieldSelect = this.createFieldSelect(titleFieldGroup, `card-type-question-field:${configId}`);
    const basicLikeMapping = mapping && "bodyField" in mapping ? mapping : undefined;
    titleFieldSelect.dataset.cardTypeQuestionField = configId;
    this.applyFluidEllipsis(titleFieldSelect);
    this.populateFieldSelect(titleFieldSelect, basicLikeMapping?.loadedFieldNames ?? [], basicLikeMapping?.titleField);
    titleFieldSelect.addEventListener("change", () => {
      void this.saveFieldMapping(configId, { titleField: titleFieldSelect.value || undefined });
    });

    const bodyFieldGroup = this.createGridControlSlot(containerEl, t("settings.cards.cardTypes.labels.answerField"));
    const bodyFieldSelect = this.createFieldSelect(bodyFieldGroup, `card-type-answer-field:${configId}`);
    bodyFieldSelect.dataset.cardTypeAnswerField = configId;
    this.applyFluidEllipsis(bodyFieldSelect);
    this.populateFieldSelect(bodyFieldSelect, basicLikeMapping?.loadedFieldNames ?? [], basicLikeMapping?.bodyField);
    bodyFieldSelect.addEventListener("change", () => {
      void this.saveFieldMapping(configId, { bodyField: bodyFieldSelect.value || undefined });
    });
  }

  private renderQaGroupFieldControls(containerEl: HTMLElement, configId: Extract<CardTypeConfigId, "qa-group">): void {
    const selectedModelName = this.plugin.settings.cardTypeConfigs[configId].noteType.trim();
    const qaGroupState = this.getQaGroupFieldState(configId);
    const selectedFields = qaGroupState.mapping ? this.getQaGroupSelectedFields(qaGroupState.mapping) : undefined;

    const titleFieldGroup = this.createGridControlSlot(containerEl, t("settings.cards.cardTypes.labels.qaGroupTitleField"));
    if (qaGroupState.mapping) {
      const titleFieldSelect = this.createFieldSelect(titleFieldGroup, `card-type-qa-group-title-field:${configId}`);
      titleFieldSelect.dataset.qaGroupTitleField = configId;
      this.applyFluidEllipsis(titleFieldSelect);
      this.populateFieldSelect(titleFieldSelect, qaGroupState.mapping.loadedFieldNames, qaGroupState.mapping.titleField);
      const qaGroupPairRow = containerEl.createDiv();
      qaGroupPairRow.dataset.qaGroupPairRow = configId;
      addClasses(qaGroupPairRow, "ahs-settings-qa-group-pair-row");

      const firstQuestionFieldGroup = this.createGridControlSlot(qaGroupPairRow, t("settings.cards.cardTypes.labels.qaGroupFirstQuestionField"));
      const firstQuestionFieldSelect = this.createFieldSelect(firstQuestionFieldGroup, `card-type-qa-group-first-question-field:${configId}`);
      firstQuestionFieldSelect.dataset.qaGroupFirstQuestionField = configId;
      this.applyFluidEllipsis(firstQuestionFieldSelect);
      this.populateFieldSelect(firstQuestionFieldSelect, qaGroupState.mapping.loadedFieldNames, selectedFields?.firstQuestionField);

      const firstAnswerFieldGroup = this.createGridControlSlot(qaGroupPairRow, t("settings.cards.cardTypes.labels.qaGroupFirstAnswerField"));
      const firstAnswerFieldSelect = this.createFieldSelect(firstAnswerFieldGroup, `card-type-qa-group-first-answer-field:${configId}`);
      firstAnswerFieldSelect.dataset.qaGroupFirstAnswerField = configId;
      this.applyFluidEllipsis(firstAnswerFieldSelect);
      this.populateFieldSelect(firstAnswerFieldSelect, qaGroupState.mapping.loadedFieldNames, selectedFields?.firstAnswerField);

      const saveSelection = () => {
        void this.saveQaGroupFieldSelection(configId, {
          titleField: titleFieldSelect.value || undefined,
          firstQuestionField: firstQuestionFieldSelect.value || undefined,
          firstAnswerField: firstAnswerFieldSelect.value || undefined,
        });
      };

      titleFieldSelect.addEventListener("change", saveSelection);
      firstQuestionFieldSelect.addEventListener("change", saveSelection);
      firstAnswerFieldSelect.addEventListener("change", saveSelection);

      const slotSummaryEl = qaGroupPairRow.createSpan({
        text: t("settings.cards.cardTypes.qaGroup.configuredSlots", {
          count: qaGroupState.mapping.slots.length,
        }),
      });
      slotSummaryEl.dataset.qaGroupSlotSummary = configId;
      addClasses(slotSummaryEl, "ahs-settings-nowrap-start");
      this.applyFluidEllipsis(slotSummaryEl);
    } else {
      titleFieldGroup.createSpan({
        text: selectedModelName.length > 0 ? t("settings.cards.cardTypes.qaGroup.unavailable") : t("settings.cards.cardTypes.qaGroup.noModel"),
      }).dataset.qaGroupTitleField = configId;

      const qaGroupPairRow = containerEl.createDiv();
      qaGroupPairRow.dataset.qaGroupPairRow = configId;
      addClasses(qaGroupPairRow, "ahs-settings-qa-group-pair-row");

      const firstQuestionFieldGroup = this.createGridControlSlot(qaGroupPairRow, t("settings.cards.cardTypes.labels.qaGroupFirstQuestionField"));
      firstQuestionFieldGroup.createSpan({
        text: selectedModelName.length > 0 ? t("settings.cards.cardTypes.qaGroup.unavailable") : t("settings.cards.cardTypes.qaGroup.noModel"),
      }).dataset.qaGroupFirstQuestionField = configId;

      const firstAnswerFieldGroup = this.createGridControlSlot(qaGroupPairRow, t("settings.cards.cardTypes.labels.qaGroupFirstAnswerField"));
      firstAnswerFieldGroup.createSpan({
        text: selectedModelName.length > 0 ? t("settings.cards.cardTypes.qaGroup.unavailable") : t("settings.cards.cardTypes.qaGroup.noModel"),
      }).dataset.qaGroupFirstAnswerField = configId;

      const slotSummaryEl = qaGroupPairRow.createSpan({
        text: selectedModelName.length > 0 ? t("settings.cards.cardTypes.qaGroup.unavailable") : t("settings.cards.cardTypes.qaGroup.noModel"),
      });
      slotSummaryEl.dataset.qaGroupSlotSummary = configId;
      addClasses(slotSummaryEl, "ahs-settings-nowrap-start");
      this.applyFluidEllipsis(slotSummaryEl);
    }

    if (qaGroupState.error) {
      const errorEl = containerEl.createDiv({
        text: renderUserFacingMessage(qaGroupState.error),
      });
      errorEl.dataset.qaGroupError = configId;
      addClasses(errorEl, "ahs-settings-grid-full");
      return;
    }

    if (!qaGroupState.mapping || qaGroupState.mapping.warnings.length === 0) {
      return;
    }

    const warningsContainer = containerEl.createDiv();
    warningsContainer.dataset.qaGroupWarnings = configId;
    addClasses(warningsContainer, "ahs-settings-grid-full", "ahs-settings-warnings");
    warningsContainer.createEl("strong", { text: t("settings.cards.cardTypes.labels.qaGroupWarnings") });

    for (const warning of qaGroupState.mapping.warnings) {
      warningsContainer.createDiv({
        text: this.renderQaGroupWarning(warning),
      }).dataset.qaGroupWarning = configId;
    }

    const acceptLabel = warningsContainer.createEl("label");
    addClasses(acceptLabel, "ahs-settings-inline-check");
    const acceptCheckbox = acceptLabel.createEl("input");
    acceptCheckbox.type = "checkbox";
    acceptCheckbox.checked = areQaGroupWarningsAccepted(qaGroupState.mapping.warnings, qaGroupState.mapping.acceptedWarnings);
    acceptCheckbox.dataset.qaGroupWarningAccept = configId;
    acceptCheckbox.addEventListener("change", () => {
      void this.saveQaGroupWarningAcceptance(configId, acceptCheckbox.checked);
    });
    acceptLabel.createSpan({ text: t("settings.cards.cardTypes.qaGroup.acceptWarnings") });
  }

  private renderSyncContentCard(containerEl: HTMLElement): void {
    const bodyRangeSection = this.createSyncContentSection(containerEl, "body-range", t("settings.cards.syncContent.sections.bodyRange"));
    new Setting(bodyRangeSection)
      .setName(t("settings.cardAnswerCutoffMode.name"))
      .setDesc(t("settings.cardAnswerCutoffMode.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("heading-block", t("settings.cardAnswerCutoffMode.options.headingBlock"));
        dropdown.addOption("double-blank-lines", t("settings.cardAnswerCutoffMode.options.doubleBlankLines"));
        dropdown.setValue(this.plugin.settings.cardAnswerCutoffMode).onChange((value) => {
          void this.plugin.updateSettings({ cardAnswerCutoffMode: value as CardAnswerCutoffMode });
        });
      });

    const backlinkSection = this.createSyncContentSection(containerEl, "backlink", t("settings.cards.syncContent.sections.backlink"));
    new Setting(backlinkSection)
      .setName(t("settings.syncOptions.addObsidianBacklink.name"))
      .setDesc(t("settings.syncOptions.addObsidianBacklink.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.addObsidianBacklink).onChange((value) => {
          void this.plugin.updateSettings({ addObsidianBacklink: value });
        });
      });

    new Setting(backlinkSection)
      .setName(t("settings.syncOptions.obsidianBacklinkLabel.name"))
      .setDesc(t("settings.syncOptions.obsidianBacklinkLabel.desc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.syncOptions.obsidianBacklinkLabel.placeholder"))
          .setValue(this.getDraftValue("obsidian-backlink-label", this.plugin.settings.obsidianBacklinkLabel))
          .onChange((value) => {
            this.scheduleDebouncedTextSave("obsidian-backlink-label", value, async (draftValue) => {
              const nextValue = draftValue.trim();
              await this.plugin.updateSettings({
                obsidianBacklinkLabel: nextValue || DEFAULT_OBSIDIAN_BACKLINK_LABEL,
              });
              this.textDraftValues.delete("obsidian-backlink-label");
            });
          });
      });

    new Setting(backlinkSection)
      .setName(t("settings.syncOptions.obsidianBacklinkPlacement.name"))
      .setDesc(t("settings.syncOptions.obsidianBacklinkPlacement.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("question-last-line", t("settings.syncOptions.obsidianBacklinkPlacement.options.questionLastLine"));
        dropdown.addOption("answer-first-line", t("settings.syncOptions.obsidianBacklinkPlacement.options.answerFirstLine"));
        dropdown.addOption("answer-last-line", t("settings.syncOptions.obsidianBacklinkPlacement.options.answerLastLine"));
        dropdown.setValue(this.plugin.settings.obsidianBacklinkPlacement).onChange((value) => {
          void this.plugin.updateSettings({ obsidianBacklinkPlacement: value as ObsidianBacklinkPlacement });
        });
      });

    const tagsSection = this.createSyncContentSection(containerEl, "tags", t("settings.cards.syncContent.sections.tags"));
    new Setting(tagsSection)
      .setName(t("settings.syncOptions.syncObsidianTagsToAnki.name"))
      .setDesc(t("settings.syncOptions.syncObsidianTagsToAnki.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.syncObsidianTagsToAnki).onChange((value) => {
          void this.plugin.updateSettings({ syncObsidianTagsToAnki: value });
        });
      });

    new Setting(tagsSection)
      .setName(t("settings.syncOptions.keepPureTagLinesInCardBody.name"))
      .setDesc(t("settings.syncOptions.keepPureTagLinesInCardBody.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.keepPureTagLinesInCardBody).onChange((value) => {
          void this.plugin.updateSettings({ keepPureTagLinesInCardBody: value });
        });
      });

    const clozeSection = this.createSyncContentSection(containerEl, "cloze-special", t("settings.cards.syncContent.sections.clozeSpecial"));
    new Setting(clozeSection)
      .setName(t("settings.syncOptions.highlightsToCloze.name"))
      .setDesc(t("settings.syncOptions.highlightsToCloze.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.convertHighlightsToCloze).onChange((value) => {
          void this.plugin.updateSettings({ convertHighlightsToCloze: value });
        });
      });
  }

  private createSyncContentSection(containerEl: HTMLElement, sectionId: string, title: string): HTMLElement {
    const sectionEl = containerEl.createDiv();
    sectionEl.dataset.syncContentSection = sectionId;
    addClasses(sectionEl, "ahs-settings-section");
    this.createSectionHeading(sectionEl, "syncContentSectionTitle", sectionId, title);

    return sectionEl;
  }

  private renderScopeCard(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t("settings.scope.name"))
      .setDesc(getScopeModeSummary(this.plugin.settings.scopeMode))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", t("settings.scope.option.all"))
          .addOption("include", t("settings.scope.option.include"))
          .addOption("exclude", t("settings.scope.option.exclude"))
          .setValue(this.plugin.settings.scopeMode)
          .onChange((value) => {
            if (value !== "all" && value !== "include" && value !== "exclude") {
              return;
            }

            void this.updateScopeMode(value);
          });
      });

    if (!isRunScopeConfigured(this.plugin.settings.scopeMode, this.plugin.settings.includeFolders)) {
      const warningEl = containerEl.createEl("p", { text: t("settings.scope.unconfiguredWarning") });
      warningEl.dataset.scopeWarning = "unconfigured";
      addClasses(warningEl, "ahs-settings-warning-text");
    }

    if (this.plugin.settings.scopeMode === "all") {
      return;
    }

    const refreshRow = containerEl.createDiv();
    const refreshButton = new ButtonComponent(refreshRow)
      .setButtonText(t("settings.cards.scope.refreshFolders"))
      .setCta()
      .setDisabled(Boolean(this.folderTreeLoadPromise))
      .onClick(() => {
        void this.refreshFolderTree();
      });
    refreshButton.buttonEl.dataset.scopeRefreshFolders = "true";

    this.ensureFolderTreeLoaded();
    containerEl.createEl("p", { text: getScopeModeTreeDescription(this.plugin.settings.scopeMode) });

    if (this.folderTreeLoadPromise || this.folderTree.length === 0) {
      containerEl.createEl("p", { text: renderUserFacingMessage(this.folderTreeStatus) });
      return;
    }

    this.expandSelectedFolderAncestorsIfNeeded(this.plugin.settings.scopeMode);

    const selectedFolders = this.getSelectedFoldersForScopeMode(this.plugin.settings.scopeMode);
    const selectionTree = buildFolderTreeSelection(this.folderTree, selectedFolders);
    const treeContainer = containerEl.createDiv();
    treeContainer.dataset.scopeTree = "true";
    addClasses(treeContainer, "ahs-settings-folder-tree");

    for (const node of selectionTree) {
      this.renderFolderNode(treeContainer, node, this.plugin.settings.scopeMode, 0);
    }
  }

  private renderDeckCard(containerEl: HTMLElement): void {
    const folderMappingSection = this.createDeckSection(containerEl, "folder-mapping", t("settings.cards.deck.sections.folderMapping"));
    new Setting(folderMappingSection)
      .setName(t("settings.deck.folderDeckMode.name"))
      .setDesc(t("settings.deck.folderDeckMode.desc"))
      .addDropdown((dropdown) => {
        this.populateFolderDeckModeDropdown(dropdown, this.plugin.settings.folderDeckMode);
        dropdown.onChange((value) => {
          if (value !== "off" && value !== "folder" && value !== "folder-and-file") {
            return;
          }

          void this.plugin.updateSettings({ folderDeckMode: value as FolderDeckMode });
        });
      });

    this.renderDeckExampleBlock(folderMappingSection);

    const fileDeckSection = this.createDeckSection(containerEl, "file-deck", t("settings.cards.deck.sections.fileDeck"));
    new Setting(fileDeckSection)
      .setName(t("settings.deck.fileDeckEnabled.name"))
      .setDesc(t("settings.deck.fileDeckEnabled.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.fileDeckEnabled).onChange(async (value) => {
          await this.plugin.updateSettings({ fileDeckEnabled: value });
          this.renderCard("deck");
        });
      });

    if (this.plugin.settings.fileDeckEnabled) {
      new Setting(fileDeckSection)
        .setName(t("settings.deck.marker.name"))
        .setDesc(t("settings.deck.marker.desc"))
        .addText((text) => {
          text.setValue(this.getDraftValue("file-deck-marker", this.plugin.settings.fileDeckMarker)).onChange((value) => {
            this.scheduleDebouncedTextSave("file-deck-marker", value, async (draftValue) => {
              const nextValue = draftValue.trim();
              if (!nextValue) {
                this.textDraftValues.delete("file-deck-marker");
                this.renderCard("deck");
                return;
              }

              await this.plugin.updateSettings({ fileDeckMarker: nextValue });
              this.textDraftValues.delete("file-deck-marker");
            });
          });
        });

      new Setting(fileDeckSection)
        .setName(t("settings.deck.template.name"))
        .setDesc(t("settings.deck.template.desc"))
        .addText((text) => {
          text.setValue(this.getDraftValue("file-deck-template", this.plugin.settings.fileDeckTemplate)).onChange((value) => {
            this.scheduleDebouncedTextSave("file-deck-template", value, async (draftValue) => {
              const nextValue = draftValue.trim();
              if (!nextValue) {
                this.textDraftValues.delete("file-deck-template");
                this.renderCard("deck");
                return;
              }

              await this.plugin.updateSettings({ fileDeckTemplate: nextValue });
              this.textDraftValues.delete("file-deck-template");
            });
          });
        });

      new Setting(fileDeckSection)
        .setName(t("settings.deck.insertLocation.name"))
        .setDesc(t("settings.deck.insertLocation.desc"))
        .addDropdown((dropdown) => {
          this.populateFileDeckInsertLocationDropdown(dropdown, this.plugin.settings.fileDeckInsertLocation);
          dropdown.onChange((value) => {
            if (value !== "yaml" && value !== "body") {
              return;
            }

            void this.plugin.updateSettings({ fileDeckInsertLocation: value as FileDeckInsertLocation });
          });
        });

      new Setting(fileDeckSection)
        .setName(t("settings.deck.insertTemplate.name"))
        .setDesc(t("settings.deck.insertTemplate.desc"))
        .addButton((button) => {
          this.markActionButton(button);
          button.setButtonText(t("settings.deck.insertTemplate.button")).onClick(() => {
            void this.plugin.insertDeckTemplateToCurrentFile();
          });
        });
    }

    const defaultDeckSection = this.createDeckSection(containerEl, "default-deck", t("settings.cards.deck.sections.defaultDeck"));
    new Setting(defaultDeckSection)
      .setName(t("settings.deck.defaultDeck.name"))
      .setDesc(t("settings.deck.defaultDeck.desc"))
      .addText((text) => {
        text.setValue(this.getDraftValue("default-deck", this.plugin.settings.defaultDeck)).onChange((value) => {
          this.scheduleDebouncedTextSave("default-deck", value, async (draftValue) => {
            const nextValue = draftValue.trim();
            if (!nextValue) {
              this.textDraftValues.delete("default-deck");
              this.renderCard("deck");
              return;
            }

            await this.plugin.updateSettings({ defaultDeck: nextValue });
            this.textDraftValues.delete("default-deck");
          });
        });
      });

    this.createDeckHelperText(defaultDeckSection, t("settings.deck.fallbackDesc"), "fallback");
    this.createDeckPriorityFooter(containerEl);
  }

  private renderDeckExampleBlock(containerEl: HTMLElement): void {
    const exampleBlockEl = containerEl.createDiv();
    exampleBlockEl.dataset.deckExampleBlock = "true";
    addClasses(exampleBlockEl, "ahs-settings-deck-example-block");

    const titleEl = exampleBlockEl.createEl("strong", { text: t("settings.deck.examplesTitle") });
    addClasses(titleEl, "ahs-settings-small-title");

    for (const exampleText of [
      t("settings.deck.folderExample"),
      t("settings.deck.folderAndFileExample"),
    ]) {
      const rowEl = exampleBlockEl.createDiv({ text: exampleText });
      rowEl.dataset.deckExampleRow = "true";
      addClasses(rowEl, "ahs-settings-helper-text");
    }
  }

  private createDeckHelperText(containerEl: HTMLElement, text: string, helperId: string): HTMLElement {
    const helperEl = containerEl.createDiv({ text });
    helperEl.dataset.deckHelperText = helperId;
    addClasses(helperEl, "ahs-settings-helper-text");
    return helperEl;
  }

  private createDeckPriorityFooter(containerEl: HTMLElement): void {
    const footerEl = this.createDeckHelperText(containerEl, t("settings.deck.priorityDesc"), "priority");
    footerEl.dataset.deckPriorityFooter = "true";
    addClasses(footerEl, "ahs-settings-helper-text-priority");
  }

  private createDeckSection(containerEl: HTMLElement, sectionId: string, title: string): HTMLElement {
    const sectionEl = containerEl.createDiv();
    sectionEl.dataset.deckSection = sectionId;
    addClasses(sectionEl, "ahs-settings-section");
    this.createSectionHeading(sectionEl, "deckSectionTitle", sectionId, title);

    return sectionEl;
  }

  private renderCommandsCard(containerEl: HTMLElement): void {
    containerEl.createEl("p", { text: t("settings.cards.commands.desc") });
    const commandList = containerEl.createEl("ul");
    for (const [name, description] of [
      [t("commands.syncCurrentFileToAnki"), t("settings.cards.commands.items.syncCurrentFile")],
      [t("commands.syncVaultToAnki"), t("settings.cards.commands.items.syncVault")],
      [t("commands.clearCurrentFileSyncedCards"), t("settings.cards.commands.items.clearCurrentFile")],
      [t("commands.cleanupEmptyDecks"), t("settings.cards.commands.items.cleanupDecks")],
    ]) {
      commandList.createEl("li", { text: `${name}: ${description}` });
    }
  }

  private async saveCardTypeConfig(configId: CardTypeConfigId, partialConfig: Partial<AnkiHeadingSyncPlugin["settings"]["cardTypeConfigs"][CardTypeConfigId]>): Promise<boolean> {
    const nextCardTypeConfigs = {
      ...this.plugin.settings.cardTypeConfigs,
      [configId]: {
        ...this.plugin.settings.cardTypeConfigs[configId],
        ...partialConfig,
      },
    };

    try {
      validatePluginSettings(normalizePluginSettings({
        ...this.plugin.settings,
        cardTypeConfigs: nextCardTypeConfigs,
      }));
    } catch (error) {
      this.cardTypeStatusOverride = toUserFacingMessage(error, "settings.cards.cardTypes.failedSave");
      this.renderCard("card-types");
      return false;
    }

    this.cardTypeStatusOverride = null;
    await this.plugin.updateSettings({ cardTypeConfigs: nextCardTypeConfigs });

    if (configId === "qa-group" && typeof partialConfig.noteType === "string") {
      await this.syncQaGroupMappingFromCache(nextCardTypeConfigs[configId].noteType);

      const mappingKey = createNoteFieldMappingKey("qa-group", nextCardTypeConfigs[configId].noteType);
      if (!this.plugin.settings.noteFieldMappings[mappingKey]) {
        const cacheEntry = this.plugin.settings.ankiModelFieldCache[nextCardTypeConfigs[configId].noteType];
        if (cacheEntry) {
          const fallbackMapping = this.qaGroupFieldMappingService.suggest(
            nextCardTypeConfigs[configId].noteType,
            cacheEntry.fieldNames,
            cacheEntry.loadedAt,
          );
          await this.plugin.updateSettings({
            noteFieldMappings: {
              ...this.plugin.settings.noteFieldMappings,
              [mappingKey]: fallbackMapping,
            },
          });
        }
      }
    }

    if ((configId === "basic" || configId === "cloze") && typeof partialConfig.noteType === "string") {
      await this.syncFieldMappingFromCache(configId);
    }

    this.renderCard("card-types");
    return true;
  }

  private async saveFieldMapping(configId: CardTypeConfigId, partialMapping: Partial<NoteModelFieldMapping>): Promise<void> {
    const mapping = this.getCurrentMappingForConfig(configId);
    const runtimeCardType = this.getRuntimeCardType(configId);
    const modelName = this.plugin.settings.cardTypeConfigs[configId].noteType;
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const nextMapping = {
      ...(mapping ?? this.createFallbackMapping(runtimeCardType, modelName)),
      ...partialMapping,
    } as NoteModelFieldMapping;

    this.cardTypeStatusOverride = null;
    this.draftMappings[mappingKey] = nextMapping;
    await this.plugin.updateSettings({
      noteFieldMappings: {
        ...this.plugin.settings.noteFieldMappings,
        [mappingKey]: {
          ...nextMapping,
          loadedFieldNames: [...nextMapping.loadedFieldNames],
        } as NoteModelFieldMapping,
      },
    });
    this.renderCard("card-types");
  }

  private async loadAnkiCardTypeConfig(): Promise<void> {
    this.noteTypeCacheCheckToken += 1;
    this.noteTypeCacheCheckPromise = null;
    this.cardTypeStatusOverride = null;
    this.noteTypeCacheCheckStatus = this.resolveManualRefreshCacheStatus();
    this.ankiConfigLoading = true;
    this.renderCard("card-types");

    try {
      const noteModels = await this.plugin.listNoteModels();
      const nextAvailableNoteModels = normalizeNoteTypeNames(noteModels);
      this.availableNoteModels.splice(0, this.availableNoteModels.length, ...nextAvailableNoteModels);

      const fieldNamesByModelName = await this.plugin.getModelFieldNamesByModelNames(nextAvailableNoteModels);
      const loadedAt = Date.now();
      const ankiModelFieldCache = Object.entries(fieldNamesByModelName).reduce<AnkiHeadingSyncPlugin["settings"]["ankiModelFieldCache"]>((cache, [modelName, fieldNames]) => {
        cache[modelName] = {
          fieldNames: [...fieldNames],
          loadedAt,
        };
        return cache;
      }, {});

      await this.plugin.updateSettings({
        ankiNoteTypeCache: this.getAvailableNoteModels(),
        ankiModelFieldCache,
      });

      this.hydrateVisibleCardTypeCaches(ankiModelFieldCache);
      await this.syncVisibleFieldMappingsFromCache(ankiModelFieldCache);
      await this.syncQaGroupMappingFromCache(this.plugin.settings.cardTypeConfigs["qa-group"].noteType, ankiModelFieldCache);
      const configuredCount = this.countConfiguredCardTypes(ankiModelFieldCache);

      this.detectedAnkiNoteTypeCache = [...nextAvailableNoteModels];
      this.noteTypeCacheCheckStatus = "same";
      this.cardTypeStatusOverride = {
        key: "settings.cards.cardTypes.loadedSummary",
        params: {
          noteTypeCount: this.availableNoteModels.length,
          configuredCount,
        },
      };
    } catch (error) {
      this.cardTypeStatusOverride = toUserFacingMessage(error, "settings.cards.cardTypes.failedLoad");
    } finally {
      this.ankiConfigLoading = false;
      this.renderCard("card-types");
    }
  }

  private maybeStartNoteTypeCacheCheck(): void {
    if (this.ankiConfigLoading || this.plugin.settings.ankiNoteTypeCache.length === 0) {
      return;
    }

    if (this.noteTypeCacheCheckStatus !== "idle" || this.noteTypeCacheCheckPromise) {
      return;
    }

    this.noteTypeCacheCheckStatus = "checking";
    const token = ++this.noteTypeCacheCheckToken;
    const checkPromise = this.checkNoteTypeCacheFreshness(token).finally(() => {
      if (this.noteTypeCacheCheckPromise === checkPromise) {
        this.noteTypeCacheCheckPromise = null;
      }

      if (token === this.noteTypeCacheCheckToken) {
        this.renderCard("card-types");
      }
    });

    this.noteTypeCacheCheckPromise = checkPromise;
  }

  private async checkNoteTypeCacheFreshness(token: number): Promise<void> {
    try {
      const liveNoteModels = normalizeNoteTypeNames(await this.plugin.listNoteModels());
      if (token !== this.noteTypeCacheCheckToken) {
        return;
      }

      this.detectedAnkiNoteTypeCache = liveNoteModels;
      this.noteTypeCacheCheckStatus = areStringArraysEqual(this.plugin.settings.ankiNoteTypeCache, liveNoteModels)
        ? "same"
        : "changed";
    } catch {
      if (token !== this.noteTypeCacheCheckToken) {
        return;
      }

      this.noteTypeCacheCheckStatus = "failed";
    }
  }

  private getCardTypeStatusMessage(): UserFacingMessage {
    if (this.ankiConfigLoading) {
      return { key: "settings.cards.cardTypes.loadAnki.loading" };
    }

    if (this.cardTypeStatusOverride) {
      return this.cardTypeStatusOverride;
    }

    const cachedNoteTypeCount = this.plugin.settings.ankiNoteTypeCache.length;
    if (cachedNoteTypeCount === 0) {
      return { key: "settings.cards.cardTypes.cacheEmpty" };
    }

    const configuredCount = this.countConfiguredCardTypes(this.plugin.settings.ankiModelFieldCache);
    if (this.noteTypeCacheCheckStatus === "changed") {
      return {
        key: "settings.cards.cardTypes.cacheChanged",
        params: {
          cachedCount: cachedNoteTypeCount,
          liveCount: this.detectedAnkiNoteTypeCache?.length ?? cachedNoteTypeCount,
          configuredCount,
        },
      };
    }

    if (this.noteTypeCacheCheckStatus === "failed") {
      return {
        key: "settings.cards.cardTypes.cacheCheckFailed",
        params: {
          noteTypeCount: cachedNoteTypeCount,
          configuredCount,
        },
      };
    }

    return {
      key: "settings.cards.cardTypes.cacheSummary",
      params: {
        noteTypeCount: cachedNoteTypeCount,
        configuredCount,
      },
    };
  }

  private resolveManualRefreshCacheStatus(): NoteTypeCacheCheckStatus {
    if (this.noteTypeCacheCheckStatus === "changed" || this.noteTypeCacheCheckStatus === "failed") {
      return this.noteTypeCacheCheckStatus;
    }

    return this.plugin.settings.ankiNoteTypeCache.length > 0 ? "same" : "idle";
  }

  private hydrateVisibleCardTypeCaches(
    ankiModelFieldCache: AnkiHeadingSyncPlugin["settings"]["ankiModelFieldCache"] = this.plugin.settings.ankiModelFieldCache,
  ): void {
    for (const configId of VISIBLE_CARD_TYPE_CONFIG_IDS) {
      this.hydrateCardTypeCache(configId, ankiModelFieldCache);
    }
  }

  private hydrateCardTypeCache(
    configId: CardTypeConfigId,
    ankiModelFieldCache: AnkiHeadingSyncPlugin["settings"]["ankiModelFieldCache"],
  ): void {
    const runtimeCardType = this.getRuntimeCardType(configId);
    const modelName = this.plugin.settings.cardTypeConfigs[configId].noteType;
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const cacheEntry = ankiModelFieldCache[modelName];

    if (!cacheEntry) {
      return;
    }

    const modelDetails = this.createCachedModelDetails(modelName, cacheEntry.fieldNames);
    this.loadedModelDetails[mappingKey] = modelDetails;
    this.seedDraftMapping(runtimeCardType, modelName, modelDetails, cacheEntry.loadedAt);
  }

  private async syncVisibleFieldMappingsFromCache(
    ankiModelFieldCache: AnkiHeadingSyncPlugin["settings"]["ankiModelFieldCache"] = this.plugin.settings.ankiModelFieldCache,
  ): Promise<void> {
    for (const configId of VISIBLE_CARD_TYPE_CONFIG_IDS) {
      if (configId === "qa-group" || configId === "cloze-all") {
        continue;
      }

      await this.syncFieldMappingFromCache(configId, ankiModelFieldCache);
    }
  }

  private async syncFieldMappingFromCache(
    configId: Extract<CardTypeConfigId, "basic" | "cloze">,
    ankiModelFieldCache: AnkiHeadingSyncPlugin["settings"]["ankiModelFieldCache"] = this.plugin.settings.ankiModelFieldCache,
  ): Promise<void> {
    const runtimeCardType = this.getRuntimeCardType(configId);
    const modelName = this.plugin.settings.cardTypeConfigs[configId].noteType.trim();
    const cacheEntry = ankiModelFieldCache[modelName];
    if (!cacheEntry) {
      return;
    }

    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const currentMapping = this.plugin.settings.noteFieldMappings[mappingKey] ?? this.draftMappings[mappingKey];
    const nextMapping = currentMapping
      ? {
          ...currentMapping,
          loadedFieldNames: [...cacheEntry.fieldNames],
          loadedAt: cacheEntry.loadedAt,
        } as NoteModelFieldMapping
      : this.noteFieldMappingService.suggest(runtimeCardType, modelName, cacheEntry.fieldNames, cacheEntry.loadedAt);

    this.draftMappings[mappingKey] = nextMapping;
    if (areMappingsEqual(this.plugin.settings.noteFieldMappings[mappingKey], nextMapping)) {
      return;
    }

    await this.plugin.updateSettings({
      noteFieldMappings: {
        ...this.plugin.settings.noteFieldMappings,
        [mappingKey]: nextMapping,
      },
    });
  }

  private createCachedModelDetails(modelName: string, fieldNames: string[]): NoteModelDetails {
    void modelName;
    return {
      fieldNames: [...fieldNames],
    };
  }

  private countConfiguredCardTypes(ankiModelFieldCache: AnkiHeadingSyncPlugin["settings"]["ankiModelFieldCache"]): number {
    return VISIBLE_CARD_TYPE_CONFIG_IDS.reduce((configuredCount, configId) => {
      const config = this.plugin.settings.cardTypeConfigs[configId];
      if (!config.enabled) {
        return configuredCount;
      }

      return configuredCount + (ankiModelFieldCache[config.noteType] ? 1 : 0);
    }, 0);
  }

  private seedDraftMapping(runtimeCardType: NoteModelFieldMappingCardType, modelName: string, modelDetails: NoteModelDetails, loadedAt = Date.now()): void {
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const currentMapping = this.plugin.settings.noteFieldMappings[mappingKey] ?? this.draftMappings[mappingKey];

    if (runtimeCardType === "qa-group") {
      if (isQaGroupFieldMapping(currentMapping)) {
        this.draftMappings[mappingKey] = this.refreshSavedQaGroupMapping(currentMapping, modelDetails.fieldNames, loadedAt);
        return;
      }

      try {
        this.draftMappings[mappingKey] = this.qaGroupFieldMappingService.suggest(
          modelName,
          modelDetails.fieldNames,
          loadedAt,
          undefined,
          undefined,
        );
      } catch {
        delete this.draftMappings[mappingKey];
      }
      return;
    }

    if (currentMapping) {
      this.draftMappings[mappingKey] = {
        ...currentMapping,
        loadedFieldNames: [...modelDetails.fieldNames],
        loadedAt,
      };
      return;
    }

    this.draftMappings[mappingKey] = this.noteFieldMappingService.suggest(runtimeCardType, modelName, modelDetails.fieldNames, loadedAt);
  }

  private getSelectableNoteModels(selectedModelName: string): string[] {
    const noteModels = this.availableNoteModels.length > 0
      ? this.getAvailableNoteModels()
      : [...this.plugin.settings.ankiNoteTypeCache];
    if (!noteModels.includes(selectedModelName)) {
      noteModels.unshift(selectedModelName);
    }

    return noteModels;
  }

  private getAvailableNoteModels(): string[] {
    return [...this.availableNoteModels];
  }

  private getCurrentMappingForConfig(configId: CardTypeConfigId): NoteModelFieldMapping | undefined {
    const runtimeCardType = this.getRuntimeCardType(configId);
    const modelName = this.plugin.settings.cardTypeConfigs[configId].noteType;
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const mapping = this.draftMappings[mappingKey] ?? this.plugin.settings.noteFieldMappings[mappingKey];

    if (mapping) {
      if (isQaGroupFieldMapping(mapping)) {
        return this.cloneQaGroupFieldMapping(mapping);
      }

      return {
        ...mapping,
        loadedFieldNames: [...mapping.loadedFieldNames],
      };
    }

    const modelDetails = this.loadedModelDetails[mappingKey];
    if (!modelDetails) {
      return undefined;
    }

    if (runtimeCardType === "qa-group") {
      try {
        const currentMapping = this.plugin.settings.noteFieldMappings[mappingKey] ?? this.draftMappings[mappingKey];
        const suggestedMapping = this.qaGroupFieldMappingService.suggest(
          modelName,
          modelDetails.fieldNames,
          Date.now(),
          isQaGroupFieldMapping(currentMapping) ? currentMapping.acceptedWarnings : undefined,
          isQaGroupFieldMapping(currentMapping) ? currentMapping.titleField : undefined,
        );
        this.draftMappings[mappingKey] = suggestedMapping;
        return this.cloneQaGroupFieldMapping(suggestedMapping);
      } catch {
        return undefined;
      }
    }

    const suggestedMapping = this.noteFieldMappingService.suggest(runtimeCardType, modelName, modelDetails.fieldNames);
    this.draftMappings[mappingKey] = suggestedMapping;
    return {
      ...suggestedMapping,
      loadedFieldNames: [...suggestedMapping.loadedFieldNames],
    };
  }

  private createFallbackMapping(runtimeCardType: NoteModelFieldMappingCardType, modelName: string): NoteModelFieldMapping {
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const modelDetails = this.loadedModelDetails[mappingKey];

    if (modelDetails) {
      if (runtimeCardType === "qa-group") {
        const currentMapping = this.plugin.settings.noteFieldMappings[mappingKey] ?? this.draftMappings[mappingKey];
        return this.qaGroupFieldMappingService.suggest(
          modelName,
          modelDetails.fieldNames,
          Date.now(),
          isQaGroupFieldMapping(currentMapping) ? currentMapping.acceptedWarnings : undefined,
          isQaGroupFieldMapping(currentMapping) ? currentMapping.titleField : undefined,
        );
      }

      return this.noteFieldMappingService.suggest(runtimeCardType, modelName, modelDetails.fieldNames);
    }

    if (runtimeCardType === "qa-group") {
      return {
        cardType: runtimeCardType,
        modelName,
        titleField: undefined,
        slots: [],
        warnings: [],
        acceptedWarnings: undefined,
        derivation: undefined,
        loadedFieldNames: [],
        loadedAt: Date.now(),
      };
    }

    return {
      cardType: runtimeCardType,
      modelName,
      loadedFieldNames: [],
      loadedAt: Date.now(),
    };
  }

  private async saveQaGroupWarningAcceptance(configId: Extract<CardTypeConfigId, "qa-group">, accepted: boolean): Promise<void> {
    const mapping = this.getCurrentMappingForConfig(configId);
    if (!mapping || !isQaGroupFieldMapping(mapping)) {
      return;
    }

    const runtimeCardType = this.getRuntimeCardType(configId);
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, mapping.modelName);
    const nextMapping: QaGroupFieldMapping = {
      ...mapping,
      slots: mapping.slots.map((slot) => ({ ...slot })),
      warnings: [...mapping.warnings],
      acceptedWarnings: accepted ? [...mapping.warnings] : undefined,
      loadedFieldNames: [...mapping.loadedFieldNames],
    };

    this.cardTypeStatusOverride = null;
    this.draftMappings[mappingKey] = nextMapping;
    await this.plugin.updateSettings({
      noteFieldMappings: {
        ...this.plugin.settings.noteFieldMappings,
        [mappingKey]: nextMapping,
      },
    });
    this.renderCard("card-types");
  }

  private async saveQaGroupFieldSelection(
    configId: Extract<CardTypeConfigId, "qa-group">,
    selection: { titleField?: string; firstQuestionField?: string; firstAnswerField?: string },
  ): Promise<void> {
    const modelName = this.plugin.settings.cardTypeConfigs[configId].noteType.trim();
    if (modelName.length === 0) {
      return;
    }

    const mappingKey = createNoteFieldMappingKey("qa-group", modelName);
    const currentMapping = this.getCurrentMappingForConfig(configId);
    const loadedFieldNames = currentMapping && isQaGroupFieldMapping(currentMapping)
      ? currentMapping.loadedFieldNames
      : (this.loadedModelDetails[mappingKey]?.fieldNames ?? []);
    const loadedAt = currentMapping && isQaGroupFieldMapping(currentMapping) ? currentMapping.loadedAt : Date.now();
    const draftMapping = this.createQaGroupSelectionDraft(modelName, loadedFieldNames, loadedAt, selection);
    this.draftMappings[mappingKey] = draftMapping;

    try {
      const nextMapping = this.qaGroupFieldMappingService.createMappingFromSelection(modelName, loadedFieldNames, selection, loadedAt);
      this.cardTypeStatusOverride = null;
      this.draftMappings[mappingKey] = nextMapping;
      await this.plugin.updateSettings({
        noteFieldMappings: {
          ...this.plugin.settings.noteFieldMappings,
          [mappingKey]: nextMapping,
        },
      });
    } catch {
      this.cardTypeStatusOverride = null;
      this.renderCard("card-types");
      return;
    }

    this.renderCard("card-types");
  }

  private async syncQaGroupMappingFromCache(
    modelName: string,
    ankiModelFieldCache: AnkiHeadingSyncPlugin["settings"]["ankiModelFieldCache"] = this.plugin.settings.ankiModelFieldCache,
  ): Promise<void> {
    const trimmedModelName = modelName.trim();
    if (trimmedModelName.length === 0) {
      return;
    }

    const cacheEntry = ankiModelFieldCache[trimmedModelName];
    if (!cacheEntry) {
      return;
    }

    const mappingKey = createNoteFieldMappingKey("qa-group", trimmedModelName);
    const currentMapping = this.plugin.settings.noteFieldMappings[mappingKey] ?? this.draftMappings[mappingKey];

    if (isQaGroupFieldMapping(currentMapping)) {
      const nextMapping = this.refreshSavedQaGroupMapping(currentMapping, cacheEntry.fieldNames, cacheEntry.loadedAt);
      this.draftMappings[mappingKey] = nextMapping;
      if (!areMappingsEqual(this.plugin.settings.noteFieldMappings[mappingKey], nextMapping)) {
        await this.plugin.updateSettings({
          noteFieldMappings: {
            ...this.plugin.settings.noteFieldMappings,
            [mappingKey]: nextMapping,
          },
        });
      }
      return;
    }

    try {
      const nextMapping = this.qaGroupFieldMappingService.suggest(
        trimmedModelName,
        cacheEntry.fieldNames,
        cacheEntry.loadedAt,
        undefined,
        undefined,
      );

      this.draftMappings[mappingKey] = nextMapping;
      if (!areMappingsEqual(this.plugin.settings.noteFieldMappings[mappingKey], nextMapping)) {
        await this.plugin.updateSettings({
          noteFieldMappings: {
            ...this.plugin.settings.noteFieldMappings,
            [mappingKey]: nextMapping,
          },
        });
      }
    } catch {
      delete this.draftMappings[mappingKey];
      if (this.plugin.settings.noteFieldMappings[mappingKey]) {
        const nextMappings = { ...this.plugin.settings.noteFieldMappings };
        delete nextMappings[mappingKey];
        await this.plugin.updateSettings({ noteFieldMappings: nextMappings });
      }
    }
  }

  private getQaGroupFieldState(configId: Extract<CardTypeConfigId, "qa-group">): { mapping?: QaGroupFieldMapping; error?: UserFacingMessage } {
    const modelName = this.plugin.settings.cardTypeConfigs[configId].noteType;
    const mappingKey = createNoteFieldMappingKey("qa-group", modelName);
    const currentMapping = this.draftMappings[mappingKey] ?? this.plugin.settings.noteFieldMappings[mappingKey];
    if (currentMapping && isQaGroupFieldMapping(currentMapping)) {
      if (currentMapping.derivation?.mode === "first-pair") {
        const selectedFields = this.getQaGroupSelectedFields(currentMapping);
        try {
          return {
            mapping: this.qaGroupFieldMappingService.createMappingFromSelection(
              modelName,
              currentMapping.loadedFieldNames,
              selectedFields,
              currentMapping.loadedAt,
            ),
          };
        } catch (error) {
          return {
            mapping: this.cloneQaGroupFieldMapping(currentMapping),
            error: toUserFacingMessage(error, "settings.cards.cardTypes.failedSave"),
          };
        }
      }

      return {
        mapping: this.cloneQaGroupFieldMapping(currentMapping),
      };
    }

    const modelDetails = this.loadedModelDetails[mappingKey];
    if (!modelDetails) {
      return {};
    }

    try {
      const currentMapping = this.plugin.settings.noteFieldMappings[mappingKey] ?? this.draftMappings[mappingKey];
      return {
        mapping: this.qaGroupFieldMappingService.suggest(
          modelName,
          modelDetails.fieldNames,
          Date.now(),
          isQaGroupFieldMapping(currentMapping) ? currentMapping.acceptedWarnings : undefined,
          isQaGroupFieldMapping(currentMapping) ? currentMapping.titleField : undefined,
        ),
      };
    } catch (error) {
      return {
        error: toUserFacingMessage(error, "settings.cards.cardTypes.failedSave"),
      };
    }
  }

  private refreshSavedQaGroupMapping(mapping: QaGroupFieldMapping, fieldNames: string[], loadedAt: number): QaGroupFieldMapping {
    if (mapping.derivation?.mode === "first-pair") {
      try {
        return this.qaGroupFieldMappingService.createMappingFromSelection(
          mapping.modelName,
          fieldNames,
          this.getQaGroupSelectedFields(mapping),
          loadedAt,
        );
      } catch {
        return {
          ...this.cloneQaGroupFieldMapping(mapping),
          loadedFieldNames: [...fieldNames],
          loadedAt,
        };
      }
    }

    return {
      ...mapping,
      loadedFieldNames: [...fieldNames],
      slots: mapping.slots.map((slot) => ({ ...slot })),
      warnings: [...mapping.warnings],
      acceptedWarnings: mapping.acceptedWarnings ? [...mapping.acceptedWarnings] : undefined,
      derivation: mapping.derivation ? { ...mapping.derivation } : undefined,
      loadedAt,
    };
  }

  private cloneQaGroupFieldMapping(mapping: QaGroupFieldMapping): QaGroupFieldMapping {
    return {
      ...mapping,
      derivation: mapping.derivation ? { ...mapping.derivation } : undefined,
      loadedFieldNames: [...mapping.loadedFieldNames],
      slots: mapping.slots.map((slot) => ({ ...slot })),
      warnings: [...mapping.warnings],
      acceptedWarnings: mapping.acceptedWarnings ? [...mapping.acceptedWarnings] : undefined,
    };
  }

  private getQaGroupSelectedFields(mapping: QaGroupFieldMapping): { titleField?: string; firstQuestionField?: string; firstAnswerField?: string } {
    return {
      titleField: mapping.titleField,
      firstQuestionField: mapping.derivation?.firstQuestionField ?? mapping.slots[0]?.questionField,
      firstAnswerField: mapping.derivation?.firstAnswerField ?? mapping.slots[0]?.answerField,
    };
  }

  private createQaGroupSelectionDraft(
    modelName: string,
    fieldNames: string[],
    loadedAt: number,
    selection: { titleField?: string; firstQuestionField?: string; firstAnswerField?: string },
  ): QaGroupFieldMapping {
    const titleField = selection.titleField?.trim() || undefined;
    const firstQuestionField = selection.firstQuestionField?.trim() || undefined;
    const firstAnswerField = selection.firstAnswerField?.trim() || undefined;

    return {
      cardType: "qa-group",
      modelName,
      titleField,
      slots: [],
      warnings: [],
      acceptedWarnings: undefined,
      derivation: firstQuestionField || firstAnswerField
        ? {
            mode: "first-pair",
            firstQuestionField,
            firstAnswerField,
          }
        : undefined,
      loadedFieldNames: [...fieldNames],
      loadedAt,
    };
  }

  private renderQaGroupWarning(warning: string): string {
    const parsedWarning = parseQaGroupFieldWarning(warning);
    if (!parsedWarning) {
      return warning;
    }

    const index = String(parsedWarning.index).padStart(2, "0");
    if (parsedWarning.kind === "missing-answer") {
      return t("settings.cards.cardTypes.qaGroup.warning.missingAnswer", {
        index,
        questionField: parsedWarning.questionField,
        answerField: parsedWarning.answerField,
      });
    }

    return t("settings.cards.cardTypes.qaGroup.warning.missingQuestion", {
      index,
      questionField: parsedWarning.questionField,
      answerField: parsedWarning.answerField,
    });
  }

  private getRuntimeCardType(configId: CardTypeConfigId): NoteModelFieldMapping["cardType"] {
    if (configId === "qa-group") {
      return "qa-group";
    }

    return configId === "cloze" || configId === "cloze-all" ? "cloze" : "basic";
  }

  private ensureFolderTreeLoaded(forceReload = false): void {
    if (forceReload) {
      this.hasLoadedFolderTree = false;
      this.folderTree = [];
    }

    if (this.hasLoadedFolderTree || this.folderTreeLoadPromise) {
      return;
    }

    this.folderTreeStatus = FOLDER_TREE_STATUS_LOADING;
    this.folderTreeLoadPromise = this.plugin
      .listFolderTree()
      .then((folderTree) => {
        this.folderTree = folderTree;
        this.folderTreeStatus = folderTree.length > 0 ? { rawMessage: "" } : { key: "settings.scope.empty" };
        this.requestSelectedFolderAncestorExpansion();
      })
      .catch((error) => {
        this.folderTree = [];
        this.folderTreeStatus = toUserFacingMessage(error, "settings.scope.failedLoad");
      })
      .finally(() => {
        this.hasLoadedFolderTree = true;
        this.folderTreeLoadPromise = null;
        this.renderCard("scope");
      });
  }

  private refreshFolderTree(): void {
    this.expandedFolderPaths.clear();
    this.ensureFolderTreeLoaded(true);
    this.renderCard("scope");
  }

  private async updateScopeMode(scopeMode: ScopeMode): Promise<void> {
    await this.plugin.updateSettings({ scopeMode });
    if (scopeMode !== "all") {
      this.requestSelectedFolderAncestorExpansion();
      this.ensureFolderTreeLoaded();
    }
    this.renderCard("scope");
  }

  private async updateFolderSelection(scopeMode: ScopeMode, folderPath: string, checked: boolean): Promise<void> {
    const currentSelection = scopeMode === "include" ? this.plugin.settings.includeFolders : this.plugin.settings.excludeFolders;
    const nextSelection = toggleFolderTreeSelection(this.folderTree, currentSelection, folderPath, checked);

    await this.plugin.updateSettings(scopeMode === "include" ? { includeFolders: nextSelection } : { excludeFolders: nextSelection });
    this.renderCard("scope");
  }

  private renderFolderNode(containerEl: HTMLElement, node: FolderTreeSelectionNode, scopeMode: ScopeMode, depth: number): void {
    const row = containerEl.createDiv();
    row.dataset.folderRow = node.path;
    addClasses(row, "ahs-settings-folder-row");
    row.style.setProperty("--ahs-folder-depth-indent", `${depth * 18}px`);

    const hasChildren = node.children.length > 0;
    const expanded = hasChildren && this.expandedFolderPaths.has(node.path);
    const toggleControl = row.createEl(hasChildren ? "button" : "span");
    toggleControl.dataset.folderToggle = node.path;
    toggleControl.textContent = hasChildren ? (expanded ? "▾" : "▸") : "";
    addClasses(toggleControl, "ahs-settings-folder-toggle");
    if (hasChildren) {
      addClasses(toggleControl, "ahs-settings-folder-toggle-button");
      toggleControl.setAttr("aria-label", expanded ? t("settings.scope.collapseFolder", { name: node.name }) : t("settings.scope.expandFolder", { name: node.name }));
      toggleControl.setAttr("title", expanded ? t("settings.scope.collapseFolder", { name: node.name }) : t("settings.scope.expandFolder", { name: node.name }));
      toggleControl.addEventListener("click", () => {
        if (this.expandedFolderPaths.has(node.path)) {
          this.expandedFolderPaths.delete(node.path);
        } else {
          this.expandedFolderPaths.add(node.path);
        }

        this.renderCard("scope");
      });
    } else {
      addClasses(toggleControl, "ahs-settings-folder-toggle-spacer");
    }

    const checkbox = row.createEl("input");
    checkbox.type = "checkbox";
    checkbox.checked = node.checked;
    checkbox.indeterminate = node.indeterminate;
    checkbox.dataset.folderPath = node.path;
    addClasses(checkbox, "ahs-settings-folder-checkbox");
    checkbox.addEventListener("change", () => {
      void this.updateFolderSelection(scopeMode, node.path, checkbox.checked);
    });

    const labelEl = row.createSpan({ text: node.name });
    labelEl.dataset.folderPathLabel = node.path;
    addClasses(labelEl, "ahs-settings-folder-label");
    this.applyFluidEllipsis(labelEl);

    if (!hasChildren || !expanded) {
      return;
    }

    const childrenContainer = containerEl.createDiv();
    childrenContainer.dataset.folderChildren = node.path;
    addClasses(childrenContainer, "ahs-settings-folder-children");
    for (const child of node.children) {
      this.renderFolderNode(childrenContainer, child, scopeMode, depth + 1);
    }
  }

  private requestSelectedFolderAncestorExpansion(): void {
    this.scopeNeedsSelectedAncestorExpansion = true;
  }

  private expandSelectedFolderAncestorsIfNeeded(scopeMode: ScopeMode): void {
    if (!this.scopeNeedsSelectedAncestorExpansion) {
      return;
    }

    this.scopeNeedsSelectedAncestorExpansion = false;
    for (const folderPath of this.getSelectedFoldersForScopeMode(scopeMode)) {
      for (const ancestorPath of getAncestorFolderPaths(folderPath)) {
        this.expandedFolderPaths.add(ancestorPath);
      }
    }
  }

  private getSelectedFoldersForScopeMode(scopeMode: ScopeMode): string[] {
    return scopeMode === "include" ? this.plugin.settings.includeFolders : this.plugin.settings.excludeFolders;
  }

  private createInlineControlGroup(containerEl: HTMLElement, label: string): HTMLElement {
    const groupEl = containerEl.createEl("label");
    addClasses(groupEl, "ahs-settings-inline-control-group");

    const labelEl = groupEl.createSpan({ text: label });
    addClasses(labelEl, "ahs-settings-inline-control-label");

    return groupEl;
  }

  private createGridControlSlot(containerEl: HTMLElement, label: string): HTMLElement {
    const groupEl = containerEl.createEl("label");
    addClasses(groupEl, "ahs-settings-grid-control-slot");

    const labelEl = groupEl.createSpan({ text: label });
    addClasses(labelEl, "ahs-settings-grid-control-label");

    const slotEl = groupEl.createDiv();
    addClasses(slotEl, "ahs-settings-grid-control-content");

    return slotEl;
  }

  private applyFluidEllipsis(element: HTMLElement): void {
    const tagName = (element.tagName || (element as unknown as { tag?: string }).tag || "").toLowerCase();
    const isFieldControl = tagName === "select" || tagName === "input";
    addClasses(element, "ahs-settings-fluid-ellipsis");
    if (isFieldControl) {
      addClasses(element, "ahs-settings-fluid-control");
    }
  }

  private createSectionHeading(containerEl: HTMLElement, datasetKey: string, sectionId: string, title: string): void {
    const headingContainer = containerEl.createDiv();
    const headingSetting = new Setting(headingContainer).setName(title).setHeading();
    headingSetting.settingEl.dataset[datasetKey] = sectionId;
    headingSetting.nameEl.dataset[datasetKey] = sectionId;
    addClasses(headingSetting.settingEl, "ahs-settings-section-heading");
  }

  private scheduleDebouncedTextSave(key: string, value: string, saveAction: (draftValue: string) => Promise<void>): void {
    const activeWindow = window.activeWindow;
    this.textDraftValues.set(key, value);

    const pendingTimer = this.debouncedTextSaves.get(key);
    if (pendingTimer) {
      activeWindow.clearTimeout(pendingTimer.timer);
    }

    const timer = activeWindow.setTimeout(() => {
      void this.flushDebouncedTextSave(key);
    }, TEXT_SAVE_DEBOUNCE_MS);

    this.debouncedTextSaves.set(key, { timer, saveAction });
  }

  private async flushDebouncedTextSave(key: string): Promise<void> {
    const activeWindow = window.activeWindow;
    const pendingSave = this.debouncedTextSaves.get(key);
    if (!pendingSave) {
      return;
    }

    activeWindow.clearTimeout(pendingSave.timer);
    this.debouncedTextSaves.delete(key);
    await pendingSave.saveAction(this.textDraftValues.get(key) ?? "");
  }

  private async flushDebouncedTextSaves(): Promise<void> {
    const keys = [...this.debouncedTextSaves.keys()];
    await Promise.allSettled(keys.map((key) => this.flushDebouncedTextSave(key)));
  }

  private getDraftValue(key: string, persistedValue: string): string {
    return this.textDraftValues.get(key) ?? persistedValue;
  }

  private createSelect(containerEl: HTMLElement, datasetKey: string): HTMLSelectElement {
    const selectEl = containerEl.createEl("select");
    selectEl.dataset.selectKey = datasetKey;
    return selectEl;
  }

  private createFieldSelect(containerEl: HTMLElement, datasetKey: string): HTMLSelectElement {
    return this.createSelect(containerEl, datasetKey);
  }

  private appendOption(selectEl: HTMLSelectElement, value: string, label: string): void {
    const optionEl = selectEl.createEl("option", { text: label });
    optionEl.value = value;
  }

  private populateFieldSelect(selectEl: HTMLSelectElement, fieldNames: string[], selectedValue: string | undefined): void {
    selectEl.empty();
    this.appendOption(selectEl, "", fieldNames.length > 0 ? t("settings.mapping.selectFieldPlaceholder") : t("settings.cards.cardTypes.fieldsUnavailable"));
    for (const fieldName of fieldNames) {
      this.appendOption(selectEl, fieldName, fieldName);
    }
    selectEl.value = selectedValue ?? "";
  }

  private populateFileDeckInsertLocationDropdown(
    dropdown: {
      addOption(value: string, label: string): unknown;
      setValue(value: string): unknown;
    },
    selectedValue: FileDeckInsertLocation,
  ): void {
    dropdown.addOption("body", t("settings.deck.insertLocation.options.body"));
    dropdown.addOption("yaml", t("settings.deck.insertLocation.options.yaml"));
    dropdown.setValue(selectedValue);
  }

  private populateFolderDeckModeDropdown(
    dropdown: {
      addOption(value: string, label: string): unknown;
      setValue(value: string): unknown;
    },
    selectedValue: FolderDeckMode,
  ): void {
    dropdown.addOption("off", t("settings.deck.folderDeckMode.options.off"));
    dropdown.addOption("folder", t("settings.deck.folderDeckMode.options.folder"));
    dropdown.addOption("folder-and-file", t("settings.deck.folderDeckMode.options.folderAndFile"));
    dropdown.setValue(selectedValue);
  }

  private getCardTitle(cardId: SettingsCardId): string {
    if (cardId === "card-types") {
      return t("settings.cards.cardTypes.title");
    }

    if (cardId === "sync-content") {
      return t("settings.cards.syncContent.title");
    }

    if (cardId === "scope") {
      return t("settings.cards.scope.title");
    }

    if (cardId === "deck") {
      return t("settings.cards.deck.title");
    }

    return t("settings.cards.commands.title");
  }

  private getCardTypeLabel(configId: CardTypeConfigId): string {
    if (configId === "basic") {
      return t("settings.cards.cardTypes.rows.basic");
    }

    if (configId === "qa-group") {
      return t("settings.cards.cardTypes.rows.qaGroup");
    }

    if (configId === "cloze") {
      return t("settings.cards.cardTypes.rows.cloze");
    }

    if (configId === "cloze-all") {
      return t("settings.cards.cardTypes.rows.clozeAll");
    }

    return t("settings.cards.cardTypes.rows.qaGroup");
  }
}

function getScopeModeSummary(scopeMode: ScopeMode): string {
  if (scopeMode === "include") {
    return t("settings.scope.summary.include");
  }

  if (scopeMode === "exclude") {
    return t("settings.scope.summary.exclude");
  }

  return t("settings.scope.summary.all");
}

function areMappingsEqual(left: NoteModelFieldMapping | undefined, right: NoteModelFieldMapping): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeNoteTypeNames(noteModels: string[]): string[] {
  const normalizedNoteModels = new Set<string>();

  for (const noteModel of noteModels) {
    if (typeof noteModel !== "string") {
      continue;
    }

    const trimmedNoteModel = noteModel.trim();
    if (trimmedNoteModel.length > 0) {
      normalizedNoteModels.add(trimmedNoteModel);
    }
  }

  return [...normalizedNoteModels].sort((left, right) => left.localeCompare(right));
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getScopeModeTreeDescription(scopeMode: ScopeMode): string {
  if (scopeMode === "include") {
    return t("settings.scope.treeDescription.include");
  }

  return t("settings.scope.treeDescription.exclude");
}

function getAncestorFolderPaths(folderPath: string): string[] {
  const segments = folderPath.split("/").filter((segment) => segment.length > 0);
  const ancestorPaths: string[] = [];

  for (let index = 1; index < segments.length; index += 1) {
    ancestorPaths.push(segments.slice(0, index).join("/"));
  }

  return ancestorPaths;
}
