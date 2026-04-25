import { PluginSettingTab, Setting } from "obsidian";

import {
  DEFAULT_OBSIDIAN_BACKLINK_LABEL,
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
const SETTINGS_CARD_ORDER = ["card-types", "sync-content", "scope", "deck", "commands"] as const;
const VISIBLE_CARD_TYPE_CONFIG_IDS = ["basic", "qa-group", "cloze"] as const;

type SettingsCardId = (typeof SETTINGS_CARD_ORDER)[number];
type NoteTypeCacheCheckStatus = "idle" | "checking" | "same" | "changed" | "failed";

interface SettingsCardShell {
  cardEl: HTMLElement;
  headerEl: HTMLButtonElement;
  bodyEl: HTMLElement;
}

export class AnkiHeadingSyncSettingTab extends PluginSettingTab {
  private readonly noteFieldMappingService = new NoteFieldMappingService();
  private readonly qaGroupFieldMappingService = new QaGroupFieldMappingService();
  private readonly availableNoteModels: string[] = [];
  private readonly draftMappings: Record<string, NoteModelFieldMapping> = {};
  private readonly loadedModelDetails: Record<string, NoteModelDetails> = {};
  private readonly debouncedTextSaves = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly textDraftValues = new Map<string, string>();
  private readonly cardShells = new Map<SettingsCardId, SettingsCardShell>();
  private readonly expandedCardIds = new Set<SettingsCardId>(["card-types", "commands"]);
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

  constructor(plugin: AnkiHeadingSyncPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  declare plugin: AnkiHeadingSyncPlugin;

  hide(): void {
    super.hide();
    this.displayInitialized = false;
    this.cardShells.clear();
    this.clearDebouncedTextSaves();
    this.cardTypeStatusOverride = null;
    this.noteTypeCacheCheckStatus = "idle";
    this.noteTypeCacheCheckPromise = null;
    this.detectedAnkiNoteTypeCache = null;
    this.noteTypeCacheCheckToken += 1;
  }

  display(): void {
    const { containerEl } = this;
    const previousScrollTop = containerEl.scrollTop;

    if (!this.displayInitialized) {
      containerEl.empty();
      containerEl.createEl("h2", { text: t("settings.pluginTitle") });
      this.initializeCards(containerEl);
      this.displayInitialized = true;
    }

    for (const cardId of SETTINGS_CARD_ORDER) {
      this.renderCard(cardId);
    }

    containerEl.scrollTop = previousScrollTop;
  }

  private initializeCards(containerEl: HTMLElement): void {
    this.cardShells.clear();

    for (const cardId of SETTINGS_CARD_ORDER) {
      const cardEl = containerEl.createDiv();
      cardEl.dataset.settingsCard = cardId;
      cardEl.style.position = "relative";
      cardEl.style.zIndex = "0";

      const headerEl = cardEl.createEl("button") as HTMLButtonElement;
      headerEl.type = "button";
      headerEl.dataset.settingsCardToggle = cardId;
      headerEl.style.position = "sticky";
      headerEl.style.top = "0";
      headerEl.style.zIndex = "80";
      headerEl.style.display = "flex";
      headerEl.style.alignItems = "center";
      headerEl.style.justifyContent = "flex-start";
      headerEl.style.width = "100%";
      headerEl.style.maxWidth = "100%";
      headerEl.style.boxSizing = "border-box";
      headerEl.style.padding = "10px 14px";
      headerEl.style.fontSize = "1.5em";
      headerEl.style.fontWeight = "600";
      headerEl.style.background = "var(--background-primary)";
      headerEl.style.border = "2px solid var(--background-modifier-border)";
      headerEl.style.borderRadius = "0";
      headerEl.style.marginBottom = "8px";
      headerEl.style.textAlign = "left";
      headerEl.style.boxShadow = "none";
      headerEl.addEventListener("click", () => {
        this.toggleCard(cardId);
      });

      const bodyEl = cardEl.createDiv();
      bodyEl.dataset.settingsCardBody = cardId;
      bodyEl.style.position = "relative";
      bodyEl.style.zIndex = "0";
      bodyEl.style.paddingTop = "8px";

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
    shell.bodyEl.style.display = expanded ? "block" : "none";
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

  private renderCardTypesCard(containerEl: HTMLElement): void {
    this.hydrateVisibleCardTypeCaches();
    this.maybeStartNoteTypeCacheCheck();
    containerEl.createEl("p", { text: t("settings.cards.cardTypes.desc") });

    const actionRow = containerEl.createDiv();
    actionRow.style.display = "flex";
    actionRow.style.flexDirection = "column";
    actionRow.style.alignItems = "flex-start";
    actionRow.style.gap = "8px";
    const loadButton = actionRow.createEl("button", {
      text: this.ankiConfigLoading
        ? t("settings.cards.cardTypes.loadAnki.loading")
        : t("settings.cards.cardTypes.loadAnki.button"),
    }) as HTMLButtonElement;
    loadButton.type = "button";
    loadButton.dataset.cardTypesRefresh = "true";
    loadButton.disabled = this.ankiConfigLoading;
    loadButton.addEventListener("click", () => this.loadAnkiCardTypeConfig());
    actionRow.createEl("span", {
      text: `${t("settings.cards.cardTypes.statusLabel")}${renderUserFacingMessage(this.getCardTypeStatusMessage())}`,
    });

    const cardTypeList = containerEl.createDiv();
    cardTypeList.dataset.cardTypeList = "true";
    cardTypeList.style.display = "flex";
    cardTypeList.style.flexDirection = "column";
    cardTypeList.style.gap = "14px";

    for (const configId of VISIBLE_CARD_TYPE_CONFIG_IDS) {
      this.renderCardTypeBlock(cardTypeList, configId);
    }
  }

  private renderCardTypeBlock(containerEl: HTMLElement, configId: CardTypeConfigId): void {
    const config = this.plugin.settings.cardTypeConfigs[configId];
    const blockEl = containerEl.createDiv();
    blockEl.dataset.cardTypeConfig = configId;
    blockEl.style.display = "flex";
    blockEl.style.flexDirection = "column";
    blockEl.style.gap = "8px";
    blockEl.style.padding = "12px";
    blockEl.style.border = "1px solid var(--background-modifier-border)";
    blockEl.style.borderRadius = "8px";

    const headerRow = blockEl.createDiv();
    headerRow.style.display = "flex";
    headerRow.style.alignItems = "center";
    headerRow.style.gap = "10px";

    const enabledCheckbox = headerRow.createEl("input") as HTMLInputElement;
    enabledCheckbox.type = "checkbox";
    enabledCheckbox.checked = config.enabled;
    enabledCheckbox.dataset.cardTypeEnabled = configId;
    enabledCheckbox.addEventListener("change", () => this.saveCardTypeConfig(configId, { enabled: enabledCheckbox.checked }));

    const titleEl = headerRow.createEl("strong", { text: this.getCardTypeLabel(configId) });
    titleEl.style.fontSize = "var(--font-ui-medium)";

    const recognitionRow = blockEl.createDiv();
    recognitionRow.style.display = "flex";
    recognitionRow.style.flexWrap = "wrap";
    recognitionRow.style.alignItems = "center";
    recognitionRow.style.gap = "10px 14px";

    const headingGroup = this.createInlineControlGroup(recognitionRow, t("settings.cards.cardTypes.labels.headingLevel"));
    const headingSelect = this.createSelect(headingGroup, `card-type-heading:${configId}`);
    headingSelect.dataset.cardTypeHeading = configId;
    headingSelect.style.width = "88px";
    for (let level = 1; level <= 6; level += 1) {
      this.appendOption(headingSelect, String(level), `H${level}`);
    }
    headingSelect.value = String(config.headingLevel);
    headingSelect.addEventListener("change", () => this.saveCardTypeConfig(configId, { headingLevel: Number(headingSelect.value) }));

    const markerGroup = this.createInlineControlGroup(recognitionRow, t("settings.cards.cardTypes.labels.extraMarker"));
    const markerInput = markerGroup.createEl("input") as HTMLInputElement;
    markerInput.type = "text";
    markerInput.dataset.cardTypeMarker = configId;
    markerInput.placeholder = t("settings.cards.cardTypes.markerPlaceholder");
    markerInput.style.width = "220px";
    markerInput.value = this.getDraftValue(`card-type-marker:${configId}`, config.extraMarker);
    markerInput.addEventListener("input", () => {
      this.scheduleDebouncedTextSave(`card-type-marker:${configId}`, markerInput.value, async (draftValue) => {
        const persisted = await this.saveCardTypeConfig(configId, { extraMarker: draftValue });
        if (persisted) {
          this.textDraftValues.delete(`card-type-marker:${configId}`);
        }
      });
    });

    const ankiRow = blockEl.createDiv();
    ankiRow.style.display = "grid";
    ankiRow.style.gridTemplateColumns = "minmax(0, 1.1fr) minmax(0, 0.75fr) minmax(220px, 0.95fr)";
    ankiRow.style.alignItems = "center";
    ankiRow.style.columnGap = "16px";
    ankiRow.style.rowGap = "8px";
    ankiRow.style.overflow = "visible";
    ankiRow.style.width = "100%";

    const noteTypeGroup = this.createGridControlSlot(ankiRow, t("settings.cards.cardTypes.labels.noteType"));
    const noteTypeSelect = this.createSelect(noteTypeGroup, `card-type-note-type:${configId}`);
    noteTypeSelect.dataset.cardTypeNoteType = configId;
    this.applyFluidEllipsis(noteTypeSelect);
    for (const noteModel of this.getSelectableNoteModels(config.noteType)) {
      this.appendOption(noteTypeSelect, noteModel, noteModel);
    }
    noteTypeSelect.value = config.noteType;
    noteTypeSelect.disabled = this.ankiConfigLoading;
    noteTypeSelect.addEventListener("change", () => this.saveCardTypeConfig(configId, { noteType: noteTypeSelect.value }));

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
      mainFieldSelect.addEventListener("change", () => this.saveFieldMapping(configId, { mainField: mainFieldSelect.value || undefined }));
      return;
    }

    const titleFieldGroup = this.createGridControlSlot(containerEl, t("settings.cards.cardTypes.labels.questionField"));
    const titleFieldSelect = this.createFieldSelect(titleFieldGroup, `card-type-question-field:${configId}`);
    const basicLikeMapping = mapping && "bodyField" in mapping ? mapping : undefined;
    titleFieldSelect.dataset.cardTypeQuestionField = configId;
    this.applyFluidEllipsis(titleFieldSelect);
    this.populateFieldSelect(titleFieldSelect, basicLikeMapping?.loadedFieldNames ?? [], basicLikeMapping?.titleField);
    titleFieldSelect.addEventListener("change", () => this.saveFieldMapping(configId, { titleField: titleFieldSelect.value || undefined }));

    const bodyFieldGroup = this.createGridControlSlot(containerEl, t("settings.cards.cardTypes.labels.answerField"));
    const bodyFieldSelect = this.createFieldSelect(bodyFieldGroup, `card-type-answer-field:${configId}`);
    bodyFieldSelect.dataset.cardTypeAnswerField = configId;
    this.applyFluidEllipsis(bodyFieldSelect);
    this.populateFieldSelect(bodyFieldSelect, basicLikeMapping?.loadedFieldNames ?? [], basicLikeMapping?.bodyField);
    bodyFieldSelect.addEventListener("change", () => this.saveFieldMapping(configId, { bodyField: bodyFieldSelect.value || undefined }));
  }

  private renderQaGroupFieldControls(containerEl: HTMLElement, configId: Extract<CardTypeConfigId, "qa-group">): void {
    const selectedModelName = this.plugin.settings.cardTypeConfigs[configId].noteType.trim();
    const qaGroupState = this.getQaGroupFieldState(configId);

    const titleFieldGroup = this.createGridControlSlot(containerEl, t("settings.cards.cardTypes.labels.qaGroupTitleField"));
    if (qaGroupState.mapping) {
      const titleFieldSelect = this.createFieldSelect(titleFieldGroup, `card-type-qa-group-title-field:${configId}`);
      titleFieldSelect.dataset.qaGroupTitleField = configId;
      this.applyFluidEllipsis(titleFieldSelect);
      this.populateFieldSelect(titleFieldSelect, qaGroupState.mapping.loadedFieldNames, qaGroupState.mapping.titleField);
      titleFieldSelect.addEventListener("change", () => this.saveFieldMapping(configId, { titleField: titleFieldSelect.value || undefined }));
    } else {
      titleFieldGroup.createEl("span", {
        text: selectedModelName.length > 0 ? t("settings.cards.cardTypes.qaGroup.unavailable") : t("settings.cards.cardTypes.qaGroup.noModel"),
      }).dataset.qaGroupTitleField = configId;
    }

    const slotFieldGroup = this.createGridControlSlot(containerEl, t("settings.cards.cardTypes.labels.qaGroupSlotFields"));
    const slotSummaryEl = slotFieldGroup.createEl("span", {
      text: qaGroupState.mapping
        ? t("settings.cards.cardTypes.qaGroup.detectedSlots", {
            count: qaGroupState.mapping.slots.length,
          })
        : (selectedModelName.length > 0 ? t("settings.cards.cardTypes.qaGroup.unavailable") : t("settings.cards.cardTypes.qaGroup.noModel")),
    });
    slotSummaryEl.dataset.qaGroupSlotSummary = configId;
    this.applyFluidEllipsis(slotSummaryEl);

    if (qaGroupState.error) {
      const errorEl = containerEl.createDiv({
        text: renderUserFacingMessage(qaGroupState.error),
      });
      errorEl.dataset.qaGroupError = configId;
      errorEl.style.gridColumn = "1 / -1";
      return;
    }

    if (!qaGroupState.mapping || qaGroupState.mapping.warnings.length === 0) {
      return;
    }

    const warningsContainer = containerEl.createDiv();
    warningsContainer.dataset.qaGroupWarnings = configId;
    warningsContainer.style.gridColumn = "1 / -1";
    warningsContainer.style.display = "flex";
    warningsContainer.style.flexDirection = "column";
    warningsContainer.style.gap = "6px";
    warningsContainer.createEl("strong", { text: t("settings.cards.cardTypes.labels.qaGroupWarnings") });

    for (const warning of qaGroupState.mapping.warnings) {
      warningsContainer.createEl("div", {
        text: this.renderQaGroupWarning(warning),
      }).dataset.qaGroupWarning = configId;
    }

    const acceptLabel = warningsContainer.createEl("label");
    acceptLabel.style.display = "inline-flex";
    acceptLabel.style.alignItems = "center";
    acceptLabel.style.gap = "8px";
    const acceptCheckbox = acceptLabel.createEl("input") as HTMLInputElement;
    acceptCheckbox.type = "checkbox";
    acceptCheckbox.checked = areQaGroupWarningsAccepted(qaGroupState.mapping.warnings, qaGroupState.mapping.acceptedWarnings);
    acceptCheckbox.dataset.qaGroupWarningAccept = configId;
    acceptCheckbox.addEventListener("change", () => this.saveQaGroupWarningAcceptance(configId, acceptCheckbox.checked));
    acceptLabel.createEl("span", { text: t("settings.cards.cardTypes.qaGroup.acceptWarnings") });
  }

  private renderSyncContentCard(containerEl: HTMLElement): void {
    containerEl.createEl("p", { text: t("settings.cards.syncContent.desc") });

    new Setting(containerEl)
      .setName(t("settings.cardAnswerCutoffMode.name"))
      .setDesc(t("settings.cardAnswerCutoffMode.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("heading-block", t("settings.cardAnswerCutoffMode.options.headingBlock"));
        dropdown.addOption("double-blank-lines", t("settings.cardAnswerCutoffMode.options.doubleBlankLines"));
        dropdown.setValue(this.plugin.settings.cardAnswerCutoffMode).onChange((value) => {
          void this.plugin.updateSettings({ cardAnswerCutoffMode: value as CardAnswerCutoffMode });
        });
      });

    new Setting(containerEl)
      .setName(t("settings.syncOptions.addObsidianBacklink.name"))
      .setDesc(t("settings.syncOptions.addObsidianBacklink.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.addObsidianBacklink).onChange((value) => {
          void this.plugin.updateSettings({ addObsidianBacklink: value });
        });
      });

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName(t("settings.syncOptions.highlightsToCloze.name"))
      .setDesc(t("settings.syncOptions.highlightsToCloze.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.convertHighlightsToCloze).onChange((value) => {
          void this.plugin.updateSettings({ convertHighlightsToCloze: value });
        });
      });

    new Setting(containerEl)
      .setName(t("settings.syncOptions.syncObsidianTagsToAnki.name"))
      .setDesc(t("settings.syncOptions.syncObsidianTagsToAnki.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.syncObsidianTagsToAnki).onChange((value) => {
          void this.plugin.updateSettings({ syncObsidianTagsToAnki: value });
        });
      });

    new Setting(containerEl)
      .setName(t("settings.syncOptions.keepPureTagLinesInCardBody.name"))
      .setDesc(t("settings.syncOptions.keepPureTagLinesInCardBody.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.keepPureTagLinesInCardBody).onChange((value) => {
          void this.plugin.updateSettings({ keepPureTagLinesInCardBody: value });
        });
      });
  }

  private renderScopeCard(containerEl: HTMLElement): void {
    containerEl.createEl("p", { text: t("settings.cards.scope.desc") });

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

    if (this.plugin.settings.scopeMode === "all") {
      return;
    }

    const refreshRow = containerEl.createDiv();
    const refreshButton = refreshRow.createEl("button", { text: t("settings.cards.scope.refreshFolders") }) as HTMLButtonElement;
    refreshButton.type = "button";
    refreshButton.dataset.scopeRefreshFolders = "true";
    refreshButton.disabled = Boolean(this.folderTreeLoadPromise);
    refreshButton.addEventListener("click", () => {
      void this.refreshFolderTree();
    });

    this.ensureFolderTreeLoaded();
    containerEl.createEl("p", { text: getScopeModeTreeDescription(this.plugin.settings.scopeMode) });

    if (this.folderTreeLoadPromise || this.folderTree.length === 0) {
      containerEl.createEl("p", { text: renderUserFacingMessage(this.folderTreeStatus) });
      return;
    }

    const selectedFolders = this.plugin.settings.scopeMode === "include"
      ? this.plugin.settings.includeFolders
      : this.plugin.settings.excludeFolders;
    const selectionTree = buildFolderTreeSelection(this.folderTree, selectedFolders);
    const treeContainer = containerEl.createDiv();
    treeContainer.dataset.scopeTree = "true";

    for (const node of selectionTree) {
      this.renderFolderNode(treeContainer, node, this.plugin.settings.scopeMode, 0);
    }
  }

  private renderDeckCard(containerEl: HTMLElement): void {
    containerEl.createEl("p", { text: t("settings.cards.deck.desc") });

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName(t("settings.deck.fileDeckEnabled.name"))
      .setDesc(t("settings.deck.fileDeckEnabled.desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.fileDeckEnabled).onChange(async (value) => {
          await this.plugin.updateSettings({ fileDeckEnabled: value });
          this.renderCard("deck");
        });
      });

    if (this.plugin.settings.fileDeckEnabled) {
      new Setting(containerEl)
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

      new Setting(containerEl)
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

      new Setting(containerEl)
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

      new Setting(containerEl)
        .setName(t("settings.deck.insertTemplate.name"))
        .setDesc(t("settings.deck.insertTemplate.desc"))
        .addButton((button) => {
          button.setButtonText(t("settings.deck.insertTemplate.button")).onClick(() => {
            void this.plugin.insertDeckTemplateToCurrentFile();
          });
        });
    }

    new Setting(containerEl)
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

    containerEl.createEl("p", { text: t("settings.deck.folderExample") });
    containerEl.createEl("p", { text: t("settings.deck.folderAndFileExample") });
    containerEl.createEl("p", { text: t("settings.deck.priorityDesc") });
  }

  private renderCommandsCard(containerEl: HTMLElement): void {
    containerEl.createEl("p", { text: t("settings.cards.commands.desc") });
    const commandList = containerEl.createEl("ul");
    for (const [name, description] of [
      [t("commands.syncCurrentFileToAnki"), t("settings.cards.commands.items.syncCurrentFile")],
      [t("commands.syncVaultToAnki"), t("settings.cards.commands.items.syncVault")],
      [t("commands.rebuildCardIndex"), t("settings.cards.commands.items.rebuildIndex")],
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

  private createCachedModelDetails(modelName: string, fieldNames: string[]): NoteModelDetails {
    return {
      fieldNames: [...fieldNames],
      isCloze: modelName.toLowerCase().includes("cloze"),
    };
  }

  private countConfiguredCardTypes(ankiModelFieldCache: AnkiHeadingSyncPlugin["settings"]["ankiModelFieldCache"]): number {
    return VISIBLE_CARD_TYPE_CONFIG_IDS.reduce((configuredCount, configId) => {
      const selectedModelName = this.plugin.settings.cardTypeConfigs[configId].noteType;
      return configuredCount + (ankiModelFieldCache[selectedModelName] ? 1 : 0);
    }, 0);
  }

  private seedDraftMapping(runtimeCardType: NoteModelFieldMappingCardType, modelName: string, modelDetails: NoteModelDetails, loadedAt = Date.now()): void {
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const currentMapping = this.plugin.settings.noteFieldMappings[mappingKey] ?? this.draftMappings[mappingKey];

    if (runtimeCardType === "qa-group") {
      try {
        this.draftMappings[mappingKey] = this.qaGroupFieldMappingService.suggest(
          modelName,
          modelDetails.fieldNames,
          loadedAt,
          isQaGroupFieldMapping(currentMapping) ? currentMapping.acceptedWarnings : undefined,
          isQaGroupFieldMapping(currentMapping) ? currentMapping.titleField : undefined,
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
        return {
          ...suggestedMapping,
          loadedFieldNames: [...suggestedMapping.loadedFieldNames],
          slots: suggestedMapping.slots.map((slot) => ({ ...slot })),
          warnings: [...suggestedMapping.warnings],
          acceptedWarnings: suggestedMapping.acceptedWarnings ? [...suggestedMapping.acceptedWarnings] : undefined,
        };
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

    try {
      const nextMapping = this.qaGroupFieldMappingService.suggest(
        trimmedModelName,
        cacheEntry.fieldNames,
        cacheEntry.loadedAt,
        isQaGroupFieldMapping(currentMapping) ? currentMapping.acceptedWarnings : undefined,
        isQaGroupFieldMapping(currentMapping) ? currentMapping.titleField : undefined,
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
      return {
        mapping: {
          ...currentMapping,
          loadedFieldNames: [...currentMapping.loadedFieldNames],
          slots: currentMapping.slots.map((slot) => ({ ...slot })),
          warnings: [...currentMapping.warnings],
          acceptedWarnings: currentMapping.acceptedWarnings ? [...currentMapping.acceptedWarnings] : undefined,
        },
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

    return configId === "cloze" ? "cloze" : configId === "semantic-qa" ? "semantic-qa" : "basic";
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

  private async refreshFolderTree(): Promise<void> {
    this.expandedFolderPaths.clear();
    this.ensureFolderTreeLoaded(true);
    this.renderCard("scope");
  }

  private async updateScopeMode(scopeMode: ScopeMode): Promise<void> {
    await this.plugin.updateSettings({ scopeMode });
    if (scopeMode !== "all") {
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
    row.style.paddingLeft = `${depth * 18}px`;

    const hasChildren = node.children.length > 0;
    const expanded = hasChildren && this.expandedFolderPaths.has(node.path);
    const toggleControl = row.createEl(hasChildren ? "button" : "span");
    toggleControl.dataset.folderToggle = node.path;
    toggleControl.textContent = hasChildren ? (expanded ? "▾" : "▸") : "";
    if (hasChildren) {
      toggleControl.addEventListener("click", () => {
        if (this.expandedFolderPaths.has(node.path)) {
          this.expandedFolderPaths.delete(node.path);
        } else {
          this.expandedFolderPaths.add(node.path);
        }

        this.renderCard("scope");
      });
    }

    const checkbox = row.createEl("input") as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.checked = node.checked;
    checkbox.indeterminate = node.indeterminate;
    checkbox.dataset.folderPath = node.path;
    checkbox.addEventListener("change", () => {
      void this.updateFolderSelection(scopeMode, node.path, checkbox.checked);
    });

    row.createEl("span", { text: node.name }).dataset.folderPathLabel = node.path;

    if (!hasChildren || !expanded) {
      return;
    }

    const childrenContainer = containerEl.createDiv();
    childrenContainer.dataset.folderChildren = node.path;
    for (const child of node.children) {
      this.renderFolderNode(childrenContainer, child, scopeMode, depth + 1);
    }
  }

  private createInlineControlGroup(containerEl: HTMLElement, label: string): HTMLElement {
    const groupEl = containerEl.createEl("label");
    groupEl.style.display = "inline-flex";
    groupEl.style.alignItems = "center";
    groupEl.style.gap = "6px";
    groupEl.style.flexWrap = "nowrap";

    const labelEl = groupEl.createEl("span", { text: label });
    labelEl.style.whiteSpace = "nowrap";

    return groupEl;
  }

  private createGridControlSlot(containerEl: HTMLElement, label: string): HTMLElement {
    const groupEl = containerEl.createEl("label");
    groupEl.style.display = "flex";
    groupEl.style.alignItems = "center";
    groupEl.style.gap = "8px";
    groupEl.style.minWidth = "0";
    groupEl.style.overflow = "visible";

    const labelEl = groupEl.createEl("span", { text: label });
    labelEl.style.whiteSpace = "nowrap";
    labelEl.style.flex = "0 0 auto";

    const slotEl = groupEl.createDiv();
    slotEl.style.flex = "1 1 0";
    slotEl.style.minWidth = "0";
    slotEl.style.overflow = "visible";

    return slotEl;
  }

  private applyFluidEllipsis(element: HTMLElement): void {
    const tagName = (element.tagName || (element as unknown as { tag?: string }).tag || "").toLowerCase();
    const isFieldControl = tagName === "select" || tagName === "input";
    element.style.boxSizing = "border-box";
    element.style.width = isFieldControl ? "calc(100% - 2px)" : "100%";
    element.style.maxWidth = isFieldControl ? "calc(100% - 2px)" : "100%";
    element.style.minWidth = "0";
    element.style.margin = isFieldControl ? "1px" : "0";
    element.style.overflow = isFieldControl ? "visible" : "hidden";
    element.style.textOverflow = "ellipsis";
    element.style.whiteSpace = "nowrap";
  }

  private scheduleDebouncedTextSave(key: string, value: string, saveAction: (draftValue: string) => Promise<void>): void {
    this.textDraftValues.set(key, value);

    const pendingTimer = this.debouncedTextSaves.get(key);
    if (pendingTimer) {
      globalThis.clearTimeout(pendingTimer);
    }

    const timer = globalThis.setTimeout(() => {
      void saveAction(this.textDraftValues.get(key) ?? value).finally(() => {
        this.debouncedTextSaves.delete(key);
      });
    }, TEXT_SAVE_DEBOUNCE_MS);

    this.debouncedTextSaves.set(key, timer);
  }

  private clearDebouncedTextSaves(): void {
    for (const timer of this.debouncedTextSaves.values()) {
      globalThis.clearTimeout(timer);
    }

    this.debouncedTextSaves.clear();
  }

  private getDraftValue(key: string, persistedValue: string): string {
    return this.textDraftValues.get(key) ?? persistedValue;
  }

  private createSelect(containerEl: HTMLElement, datasetKey: string): HTMLSelectElement {
    const selectEl = containerEl.createEl("select") as HTMLSelectElement;
    selectEl.dataset.selectKey = datasetKey;
    return selectEl;
  }

  private createFieldSelect(containerEl: HTMLElement, datasetKey: string): HTMLSelectElement {
    return this.createSelect(containerEl, datasetKey);
  }

  private appendOption(selectEl: HTMLSelectElement, value: string, label: string): void {
    const optionEl = selectEl.createEl("option", { text: label }) as HTMLOptionElement;
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

    return t("settings.cards.cardTypes.rows.semanticQa");
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
