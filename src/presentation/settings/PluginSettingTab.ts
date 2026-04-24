import { PluginSettingTab, Setting } from "obsidian";

import { QA_GROUP_MODEL_NAME } from "@/application/config/ManagedNoteModels";
import {
  CARD_TYPE_CONFIG_IDS,
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
import { createNoteFieldMappingKey, type NoteModelFieldMapping } from "@/application/config/NoteModelFieldMapping";
import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import { renderUserFacingMessage, toUserFacingMessage, type UserFacingMessage } from "@/application/errors/PluginUserError";
import { NoteFieldMappingService } from "@/application/services/NoteFieldMappingService";
import type { CardType } from "@/domain/card/entities/RenderedFields";
import { t } from "@/presentation/i18n";
import type AnkiHeadingSyncPlugin from "@/presentation/AnkiHeadingSyncPlugin";

import { buildFolderTreeSelection, toggleFolderTreeSelection, type FolderTreeSelectionNode } from "./FolderScopeTree";

const NOTE_TYPE_STATUS_IDLE: UserFacingMessage = { key: "settings.mapping.status.idle" };
const FOLDER_TREE_STATUS_LOADING: UserFacingMessage = { key: "settings.scope.loading" };
const TEXT_SAVE_DEBOUNCE_MS = 500;
const SETTINGS_CARD_ORDER = ["card-types", "sync-content", "scope", "deck", "commands"] as const;

type SettingsCardId = (typeof SETTINGS_CARD_ORDER)[number];

interface SettingsCardShell {
  cardEl: HTMLElement;
  headerEl: HTMLButtonElement;
  bodyEl: HTMLElement;
}

export class AnkiHeadingSyncSettingTab extends PluginSettingTab {
  private readonly noteFieldMappingService = new NoteFieldMappingService();
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
  private cardTypeStatus: UserFacingMessage = NOTE_TYPE_STATUS_IDLE;
  private ankiConfigLoading = false;

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

      const headerEl = cardEl.createEl("button") as HTMLButtonElement;
      headerEl.type = "button";
      headerEl.dataset.settingsCardToggle = cardId;
      headerEl.addEventListener("click", () => {
        this.toggleCard(cardId);
      });

      const bodyEl = cardEl.createDiv();
      bodyEl.dataset.settingsCardBody = cardId;

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
    containerEl.createEl("p", { text: t("settings.cards.cardTypes.desc") });

    const actionRow = containerEl.createDiv();
    const loadButton = actionRow.createEl("button", {
      text: this.ankiConfigLoading
        ? t("settings.cards.cardTypes.loadAnki.loading")
        : t("settings.cards.cardTypes.loadAnki.button"),
    }) as HTMLButtonElement;
    loadButton.type = "button";
    loadButton.dataset.cardTypesRefresh = "true";
    loadButton.disabled = this.ankiConfigLoading;
    loadButton.addEventListener("click", () => {
      void this.loadAnkiCardTypeConfig();
    });
    actionRow.createEl("span", { text: renderUserFacingMessage(this.cardTypeStatus) });

    const table = containerEl.createEl("table");
    table.dataset.cardTypeTable = "true";
    const headerRow = table.createEl("tr");
    for (const columnLabel of [
      t("settings.cards.cardTypes.columns.enabled"),
      t("settings.cards.cardTypes.columns.type"),
      t("settings.cards.cardTypes.columns.headingLevel"),
      t("settings.cards.cardTypes.columns.extraMarker"),
      t("settings.cards.cardTypes.columns.noteType"),
      t("settings.cards.cardTypes.columns.questionField"),
      t("settings.cards.cardTypes.columns.answerField"),
    ]) {
      headerRow.createEl("th", { text: columnLabel });
    }

    for (const configId of CARD_TYPE_CONFIG_IDS) {
      this.renderCardTypeRow(table, configId);
    }

    containerEl.createEl("p", { text: t("settings.cards.cardTypes.advancedHint") });
    new Setting(containerEl)
      .setName(t("settings.ankiConnectUrl.name"))
      .setDesc(t("settings.ankiConnectUrl.desc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.ankiConnectUrl.placeholder"))
          .setValue(this.getDraftValue("anki-connect-url", this.plugin.settings.ankiConnectUrl))
          .onChange((value) => {
            this.scheduleDebouncedTextSave("anki-connect-url", value, async (draftValue) => {
              const nextValue = draftValue.trim() || this.plugin.settings.ankiConnectUrl;
              await this.plugin.updateSettings({ ankiConnectUrl: nextValue });
              this.textDraftValues.delete("anki-connect-url");
            });
          });
      });
  }

  private renderCardTypeRow(tableEl: HTMLElement, configId: CardTypeConfigId): void {
    const config = this.plugin.settings.cardTypeConfigs[configId];
    const row = tableEl.createEl("tr");
    row.dataset.cardTypeConfig = configId;

    const enabledCell = row.createEl("td");
    const enabledCheckbox = enabledCell.createEl("input") as HTMLInputElement;
    enabledCheckbox.type = "checkbox";
    enabledCheckbox.checked = config.enabled;
    enabledCheckbox.dataset.cardTypeEnabled = configId;
    enabledCheckbox.addEventListener("change", () => {
      void this.saveCardTypeConfig(configId, { enabled: enabledCheckbox.checked });
    });

    row.createEl("td", { text: this.getCardTypeLabel(configId) });

    const headingCell = row.createEl("td");
    const headingSelect = this.createSelect(headingCell, `card-type-heading:${configId}`);
    headingSelect.dataset.cardTypeHeading = configId;
    for (let level = 1; level <= 6; level += 1) {
      this.appendOption(headingSelect, String(level), `H${level}`);
    }
    headingSelect.value = String(config.headingLevel);
    headingSelect.addEventListener("change", () => {
      void this.saveCardTypeConfig(configId, { headingLevel: Number(headingSelect.value) });
    });

    const markerCell = row.createEl("td");
    const markerInput = markerCell.createEl("input") as HTMLInputElement;
    markerInput.type = "text";
    markerInput.dataset.cardTypeMarker = configId;
    markerInput.placeholder = t("settings.cards.cardTypes.markerPlaceholder");
    markerInput.value = this.getDraftValue(`card-type-marker:${configId}`, config.extraMarker);
    markerInput.addEventListener("input", () => {
      this.scheduleDebouncedTextSave(`card-type-marker:${configId}`, markerInput.value, async (draftValue) => {
        const persisted = await this.saveCardTypeConfig(configId, { extraMarker: draftValue });
        if (persisted) {
          this.textDraftValues.delete(`card-type-marker:${configId}`);
        }
      });
    });

    const noteTypeCell = row.createEl("td");
    if (configId === "qa-group") {
      const noteTypeText = noteTypeCell.createEl("span", {
        text: t("settings.cards.cardTypes.qaGroupManagedNoteType", { modelName: QA_GROUP_MODEL_NAME }),
      });
      noteTypeText.dataset.cardTypeNoteType = configId;
    } else {
      const noteTypeSelect = this.createSelect(noteTypeCell, `card-type-note-type:${configId}`);
      noteTypeSelect.dataset.cardTypeNoteType = configId;
      for (const noteModel of this.getSelectableNoteModels(config.noteType)) {
        this.appendOption(noteTypeSelect, noteModel, noteModel);
      }
      noteTypeSelect.value = config.noteType;
      noteTypeSelect.disabled = this.ankiConfigLoading;
      noteTypeSelect.addEventListener("change", () => {
        void this.saveCardTypeConfig(configId, { noteType: noteTypeSelect.value });
      });
    }

    this.renderCardTypeFieldCells(row, configId);
  }

  private renderCardTypeFieldCells(rowEl: HTMLElement, configId: CardTypeConfigId): void {
    const questionCell = rowEl.createEl("td");
    const answerCell = rowEl.createEl("td");

    if (configId === "qa-group") {
      questionCell.createEl("span", { text: t("settings.cards.cardTypes.autoManagedField") });
      answerCell.createEl("span", { text: t("settings.cards.cardTypes.autoManagedField") });
      return;
    }

    const mapping = this.getCurrentMappingForConfig(configId);
    if (configId === "cloze") {
      const mainFieldSelect = this.createFieldSelect(questionCell, `card-type-question-field:${configId}`);
      mainFieldSelect.dataset.cardTypeQuestionField = configId;
      this.populateFieldSelect(mainFieldSelect, mapping?.loadedFieldNames ?? [], mapping?.mainField);
      mainFieldSelect.addEventListener("change", () => {
        void this.saveFieldMapping(configId, { mainField: mainFieldSelect.value || undefined });
      });
      answerCell.createEl("span", { text: t("settings.cards.cardTypes.autoComposedAnswer") });
      return;
    }

    const titleFieldSelect = this.createFieldSelect(questionCell, `card-type-question-field:${configId}`);
    titleFieldSelect.dataset.cardTypeQuestionField = configId;
    this.populateFieldSelect(titleFieldSelect, mapping?.loadedFieldNames ?? [], mapping?.titleField);
    titleFieldSelect.addEventListener("change", () => {
      void this.saveFieldMapping(configId, { titleField: titleFieldSelect.value || undefined });
    });

    const bodyFieldSelect = this.createFieldSelect(answerCell, `card-type-answer-field:${configId}`);
    bodyFieldSelect.dataset.cardTypeAnswerField = configId;
    this.populateFieldSelect(bodyFieldSelect, mapping?.loadedFieldNames ?? [], mapping?.bodyField);
    bodyFieldSelect.addEventListener("change", () => {
      void this.saveFieldMapping(configId, { bodyField: bodyFieldSelect.value || undefined });
    });
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
      this.cardTypeStatus = toUserFacingMessage(error, "settings.cards.cardTypes.failedSave");
      this.renderCard("card-types");
      return false;
    }

    this.cardTypeStatus = NOTE_TYPE_STATUS_IDLE;
    await this.plugin.updateSettings({ cardTypeConfigs: nextCardTypeConfigs });
    this.renderCard("card-types");
    return true;
  }

  private async saveFieldMapping(configId: Exclude<CardTypeConfigId, "qa-group">, partialMapping: Partial<NoteModelFieldMapping>): Promise<void> {
    const mapping = this.getCurrentMappingForConfig(configId);
    const runtimeCardType = this.getRuntimeCardType(configId);
    const modelName = this.plugin.settings.cardTypeConfigs[configId].noteType;
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const nextMapping = {
      ...(mapping ?? this.createFallbackMapping(runtimeCardType, modelName)),
      ...partialMapping,
    };

    this.draftMappings[mappingKey] = nextMapping;
    await this.plugin.updateSettings({
      noteFieldMappings: {
        ...this.plugin.settings.noteFieldMappings,
        [mappingKey]: {
          ...nextMapping,
          loadedFieldNames: [...nextMapping.loadedFieldNames],
        },
      },
    });
    this.renderCard("card-types");
  }

  private async loadAnkiCardTypeConfig(): Promise<void> {
    this.ankiConfigLoading = true;
    this.cardTypeStatus = { key: "settings.cards.cardTypes.loadAnki.loading" };
    this.renderCard("card-types");

    try {
      const noteModels = await this.plugin.listNoteModels();
      this.availableNoteModels.splice(0, this.availableNoteModels.length, ...[...noteModels].sort((left, right) => left.localeCompare(right)));
      const selectedConfigs = CARD_TYPE_CONFIG_IDS.filter((configId) => configId !== "qa-group") as Array<Exclude<CardTypeConfigId, "qa-group">>;

      for (const configId of selectedConfigs) {
        const runtimeCardType = this.getRuntimeCardType(configId);
        const modelName = this.plugin.settings.cardTypeConfigs[configId].noteType;
        const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
        const modelDetails = await this.plugin.getNoteModelDetails(modelName);

        this.loadedModelDetails[mappingKey] = modelDetails;
        this.seedDraftMapping(runtimeCardType, modelName, modelDetails);
      }

      this.cardTypeStatus = {
        rawMessage: `${t("settings.mapping.status.loadedCount", { count: this.availableNoteModels.length })} ${t("settings.cards.cardTypes.loadedFieldsStatus", { count: selectedConfigs.length })}`,
      };
    } catch (error) {
      this.cardTypeStatus = toUserFacingMessage(error, "settings.cards.cardTypes.failedLoad");
    } finally {
      this.ankiConfigLoading = false;
      this.renderCard("card-types");
    }
  }

  private seedDraftMapping(runtimeCardType: CardType, modelName: string, modelDetails: NoteModelDetails): void {
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const currentMapping = this.plugin.settings.noteFieldMappings[mappingKey] ?? this.draftMappings[mappingKey];

    if (currentMapping) {
      this.draftMappings[mappingKey] = {
        ...currentMapping,
        loadedFieldNames: [...modelDetails.fieldNames],
        loadedAt: Date.now(),
      };
      return;
    }

    this.draftMappings[mappingKey] = this.noteFieldMappingService.suggest(runtimeCardType, modelName, modelDetails.fieldNames);
  }

  private getSelectableNoteModels(selectedModelName: string): string[] {
    const noteModels = this.availableNoteModels.length > 0 ? [...this.availableNoteModels] : [];
    if (!noteModels.includes(selectedModelName)) {
      noteModels.unshift(selectedModelName);
    }

    return noteModels;
  }

  private getCurrentMappingForConfig(configId: Exclude<CardTypeConfigId, "qa-group">): NoteModelFieldMapping | undefined {
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

    const suggestedMapping = this.noteFieldMappingService.suggest(runtimeCardType, modelName, modelDetails.fieldNames);
    this.draftMappings[mappingKey] = suggestedMapping;
    return {
      ...suggestedMapping,
      loadedFieldNames: [...suggestedMapping.loadedFieldNames],
    };
  }

  private createFallbackMapping(runtimeCardType: CardType, modelName: string): NoteModelFieldMapping {
    const mappingKey = createNoteFieldMappingKey(runtimeCardType, modelName);
    const modelDetails = this.loadedModelDetails[mappingKey];

    if (modelDetails) {
      return this.noteFieldMappingService.suggest(runtimeCardType, modelName, modelDetails.fieldNames);
    }

    return {
      cardType: runtimeCardType,
      modelName,
      loadedFieldNames: [],
      loadedAt: Date.now(),
    };
  }

  private getRuntimeCardType(configId: Exclude<CardTypeConfigId, "qa-group">): CardType {
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

function getScopeModeTreeDescription(scopeMode: ScopeMode): string {
  if (scopeMode === "include") {
    return t("settings.scope.treeDescription.include");
  }

  return t("settings.scope.treeDescription.exclude");
}