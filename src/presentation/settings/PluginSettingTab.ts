import { PluginSettingTab, Setting } from "obsidian";

import { isValidHashtagMarker, isValidSemanticQaMarker, type CardAnswerCutoffMode, type FileDeckInsertLocation, type FolderDeckMode, type ScopeMode } from "@/application/config/PluginSettings";
import { createNoteFieldMappingKey, type NoteModelFieldMapping } from "@/application/config/NoteModelFieldMapping";
import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import { type UserFacingMessage, renderUserFacingMessage, toUserFacingMessage } from "@/application/errors/PluginUserError";
import { NoteFieldMappingService } from "@/application/services/NoteFieldMappingService";
import { buildQaGroupModelDefinition } from "@/application/services/QaGroupModelDefinition";
import type { CardType } from "@/domain/card/entities/RenderedFields";
import { SemanticQaListParser } from "@/domain/manual-sync/services/SemanticQaListParser";
import { t } from "@/presentation/i18n";
import type AnkiHeadingSyncPlugin from "@/presentation/AnkiHeadingSyncPlugin";

import { buildFolderTreeSelection, toggleFolderTreeSelection, type FolderTreeSelectionNode } from "./FolderScopeTree";

const NOTE_TYPE_STATUS_IDLE: UserFacingMessage = { key: "settings.mapping.status.idle" };
const FOLDER_TREE_STATUS_LOADING: UserFacingMessage = { key: "settings.scope.loading" };

interface MappingSectionConfig {
  cardType: CardType;
}

type SimpleDropdown = {
  addOption(value: string, label: string): unknown;
  setValue(value: string): unknown;
  onChange(callback: (value: string) => void): unknown;
};

export class AnkiHeadingSyncSettingTab extends PluginSettingTab {
  private readonly noteFieldMappingService = new NoteFieldMappingService();
  private readonly semanticQaListParser = new SemanticQaListParser();
  private availableNoteModels: string[] = [];
  private noteTypeStatus: UserFacingMessage = NOTE_TYPE_STATUS_IDLE;
  private readonly draftMappings: Record<string, NoteModelFieldMapping> = {};
  private readonly loadedModelDetails: Record<string, NoteModelDetails> = {};
  private readonly sectionStatuses: Partial<Record<CardType, UserFacingMessage>> = {};
  private folderTree: FolderTreeNode[] = [];
  private folderTreeStatus: UserFacingMessage = FOLDER_TREE_STATUS_LOADING;
  private folderTreeLoadPromise: Promise<void> | null = null;
  private hasLoadedFolderTree = false;
  private readonly expandedFolderPaths = new Set<string>();

  constructor(plugin: AnkiHeadingSyncPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  declare plugin: AnkiHeadingSyncPlugin;

  hide(): void {
    super.hide();
    this.hasLoadedFolderTree = false;
    this.expandedFolderPaths.clear();
  }

  display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;

    containerEl.empty();
    containerEl.createEl("h2", { text: t("settings.pluginTitle") });

    new Setting(containerEl)
      .setName(t("settings.ankiConnectUrl.name"))
      .setDesc(t("settings.ankiConnectUrl.desc"))
      .addText((text) => {
        text.setPlaceholder(t("settings.ankiConnectUrl.placeholder")).setValue(settings.ankiConnectUrl).onChange((value) => {
          void this.plugin.updateSettings({ ankiConnectUrl: value.trim() || settings.ankiConnectUrl });
        });
      });

    this.renderDeckSection(containerEl, settings);

    new Setting(containerEl)
      .setName(t("settings.qaHeadingLevel.name"))
      .setDesc(t("settings.qaHeadingLevel.desc"))
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level += 1) {
          dropdown.addOption(String(level), `H${level}`);
        }

        dropdown.setValue(String(settings.qaHeadingLevel)).onChange((value) => {
          void this.plugin.updateSettings({ qaHeadingLevel: Number(value) });
        });
      });

    new Setting(containerEl)
      .setName(t("settings.clozeHeadingLevel.name"))
      .setDesc(t("settings.clozeHeadingLevel.desc"))
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level += 1) {
          dropdown.addOption(String(level), `H${level}`);
        }

        dropdown.setValue(String(settings.clozeHeadingLevel)).onChange((value) => {
          void this.plugin.updateSettings({ clozeHeadingLevel: Number(value) });
        });
      });

    new Setting(containerEl)
      .setName(t("settings.cardAnswerCutoffMode.name"))
      .setDesc(t("settings.cardAnswerCutoffMode.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("heading-block", t("settings.cardAnswerCutoffMode.options.headingBlock"));
        dropdown.addOption("double-blank-lines", t("settings.cardAnswerCutoffMode.options.doubleBlankLines"));
        dropdown.setValue(settings.cardAnswerCutoffMode).onChange((value) => {
          void this.plugin.updateSettings({ cardAnswerCutoffMode: value as CardAnswerCutoffMode });
        });
      });

    containerEl.createEl("h3", { text: t("settings.qaGroup.title") });

    new Setting(containerEl)
      .setName(t("settings.qaGroup.marker.name"))
      .setDesc(t("settings.qaGroup.marker.desc"))
      .addText((text) => {
        text.setPlaceholder(t("settings.qaGroup.marker.placeholder")).setValue(settings.qaGroupMarker).onChange(async (value) => {
          const nextValue = value.trim();
          if (!nextValue || !isValidHashtagMarker(nextValue) || nextValue === settings.semanticQaMarker) {
            return;
          }

          await this.plugin.updateSettings({ qaGroupMarker: nextValue });
        });
      });

    this.renderQaGroupModelStatus(containerEl);

    containerEl.createEl("h3", { text: t("settings.semanticQa.title") });

    new Setting(containerEl)
      .setName(t("settings.semanticQa.marker.name"))
      .setDesc(t("settings.semanticQa.marker.desc"))
      .addText((text) => {
        text.setPlaceholder(t("settings.semanticQa.marker.placeholder")).setValue(settings.semanticQaMarker).onChange(async (value) => {
          const nextValue = value.trim();
          if (!nextValue || !isValidSemanticQaMarker(nextValue)) {
            return;
          }

          await this.plugin.updateSettings({ semanticQaMarker: nextValue });
          this.display();
        });
      });

    this.renderSemanticQaPreview(containerEl, settings.semanticQaMarker, settings.cardAnswerCutoffMode);

    this.renderScopeSection(containerEl, settings);

    new Setting(containerEl)
      .setName(t("settings.syncOptions.addObsidianBacklink.name"))
      .setDesc(t("settings.syncOptions.addObsidianBacklink.desc"))
      .addToggle((toggle) => {
        toggle.setValue(settings.addObsidianBacklink).onChange((value) => {
          void this.plugin.updateSettings({ addObsidianBacklink: value });
        });
      });

    new Setting(containerEl)
      .setName(t("settings.syncOptions.highlightsToCloze.name"))
      .setDesc(t("settings.syncOptions.highlightsToCloze.desc"))
      .addToggle((toggle) => {
        toggle.setValue(settings.convertHighlightsToCloze).onChange((value) => {
          void this.plugin.updateSettings({ convertHighlightsToCloze: value });
        });
      });

    containerEl.createEl("h3", { text: t("settings.mapping.title") });

    new Setting(containerEl)
      .setName(t("settings.mapping.refresh.name"))
      .setDesc(renderUserFacingMessage(this.noteTypeStatus))
      .addButton((button) => {
        button.setButtonText(t("settings.mapping.refresh.button")).onClick(() => {
          void this.refreshNoteTypes();
        });
      });

    this.renderMappingSection(containerEl, { cardType: "basic" });
    this.renderMappingSection(containerEl, { cardType: "cloze" });
    this.renderMappingSection(containerEl, { cardType: "semantic-qa" });
  }

  private renderMappingSection(containerEl: HTMLElement, config: MappingSectionConfig): void {
    const sectionText = getMappingSectionText(config.cardType);
    const sectionTitle = sectionText.title;
    const selectedModelName = this.getSelectedMappingNoteType(config.cardType);
    const mappingKey = createNoteFieldMappingKey(config.cardType, selectedModelName);
    const currentMapping = this.getCurrentMapping(mappingKey);

    containerEl.createEl("h4", { text: sectionTitle });
    containerEl.createEl("p", { text: sectionText.description });

    new Setting(containerEl)
      .setName(t("settings.mapping.noteTypeLabel", { title: sectionTitle }))
      .setDesc(t("settings.mapping.noteTypeDesc"))
      .addDropdown((dropdown) => {
        for (const noteModel of this.getSelectableNoteModels(config.cardType, selectedModelName)) {
          dropdown.addOption(noteModel, noteModel);
        }

        dropdown.setValue(selectedModelName).onChange((value) => {
          void this.updateSelectedNoteType(config.cardType, value);
        });
      });

    new Setting(containerEl)
      .setName(t("settings.mapping.fieldsLabel", { title: sectionTitle }))
      .setDesc(t("settings.mapping.fieldsDesc"))
      .addButton((button) => {
        button.setButtonText(t("settings.mapping.readFieldsButton")).onClick(() => {
          void this.loadFieldsFromAnki(config.cardType);
        });
      });

    containerEl.createEl("p", {
      text:
        currentMapping?.loadedFieldNames.length
          ? t("settings.mapping.loadedFields", { fields: currentMapping.loadedFieldNames })
          : t("settings.mapping.loadedFieldsNone"),
    });

    if (config.cardType === "cloze") {
      this.renderClozeFieldSelector(containerEl, selectedModelName, currentMapping);
    } else {
      this.renderBasicFieldSelectors(containerEl, selectedModelName, currentMapping, config.cardType, sectionTitle);
    }

    new Setting(containerEl)
      .setName(t("settings.mapping.mappingLabel", { title: sectionTitle }))
      .setDesc(t("settings.mapping.mappingDesc"))
      .addButton((button) => {
        button.setButtonText(t("settings.mapping.saveMappingButton")).onClick(() => {
          void this.saveMapping(config.cardType);
        });
      });

    containerEl.createEl("p", {
      text:
        (this.sectionStatuses[config.cardType] ? renderUserFacingMessage(this.sectionStatuses[config.cardType] as UserFacingMessage) : undefined) ??
        (this.plugin.settings.noteFieldMappings[mappingKey]
          ? t("settings.mapping.status.savedMappingReady", { title: sectionTitle })
          : t("settings.mapping.status.noSavedMapping", { title: sectionTitle })),
    });
  }

  private renderBasicFieldSelectors(
    containerEl: HTMLElement,
    selectedModelName: string,
    mapping: NoteModelFieldMapping | undefined,
    cardType: Extract<CardType, "basic" | "semantic-qa">,
    sectionTitle: string,
  ): void {
    const fieldNames = mapping?.loadedFieldNames ?? [];

    new Setting(containerEl)
      .setName(t("settings.mapping.titleFieldLabel", { title: sectionTitle }))
      .setDesc(t("settings.mapping.titleFieldDesc"))
      .addDropdown((dropdown) => {
        this.populateFieldDropdown(dropdown, fieldNames, mapping?.titleField);
        dropdown.onChange((value) => {
          this.updateDraftMapping(mapping?.cardType ?? cardType, selectedModelName, { titleField: value || undefined });
        });
      });

    new Setting(containerEl)
      .setName(t("settings.mapping.bodyFieldLabel", { title: sectionTitle }))
      .setDesc(t("settings.mapping.bodyFieldDesc"))
      .addDropdown((dropdown) => {
        this.populateFieldDropdown(dropdown, fieldNames, mapping?.bodyField);
        dropdown.onChange((value) => {
          this.updateDraftMapping(mapping?.cardType ?? cardType, selectedModelName, { bodyField: value || undefined });
        });
      });
  }

  private renderClozeFieldSelector(
    containerEl: HTMLElement,
    selectedModelName: string,
    mapping: NoteModelFieldMapping | undefined,
  ): void {
    const fieldNames = mapping?.loadedFieldNames ?? [];

    new Setting(containerEl)
      .setName(t("settings.mapping.mainField.name"))
      .setDesc(t("settings.mapping.mainField.desc"))
      .addDropdown((dropdown) => {
        this.populateFieldDropdown(dropdown, fieldNames, mapping?.mainField);
        dropdown.onChange((value) => {
          this.updateDraftMapping("cloze", selectedModelName, { mainField: value || undefined });
        });
      });
  }

  private populateFieldDropdown(dropdown: SimpleDropdown, fieldNames: string[], selectedValue: string | undefined): void {
    dropdown.addOption("", t("settings.mapping.selectFieldPlaceholder"));

    for (const fieldName of fieldNames) {
      dropdown.addOption(fieldName, fieldName);
    }

    dropdown.setValue(selectedValue ?? "");
  }

  private async refreshNoteTypes(): Promise<void> {
    try {
      const noteModels = await this.plugin.listNoteModels();
      this.availableNoteModels = [...noteModels].sort((left, right) => left.localeCompare(right));
      this.noteTypeStatus =
        this.availableNoteModels.length > 0
          ? { key: "settings.mapping.status.loadedCount", params: { count: this.availableNoteModels.length } }
          : { key: "settings.mapping.status.empty" };
    } catch (error) {
      this.noteTypeStatus = toUserFacingMessage(error, "settings.mapping.status.failedLoadNoteTypes");
    }

    this.display();
  }

  private async updateSelectedNoteType(cardType: CardType, modelName: string): Promise<void> {
    if (cardType === "basic") {
      await this.plugin.updateSettings({ qaNoteType: modelName });
    } else if (cardType === "cloze") {
      await this.plugin.updateSettings({ clozeNoteType: modelName });
    } else {
      await this.plugin.updateSettings({ semanticQaNoteType: modelName });
    }

    const mappingKey = createNoteFieldMappingKey(cardType, modelName);
    this.sectionStatuses[cardType] = this.plugin.settings.noteFieldMappings[mappingKey]
      ? { key: "settings.mapping.status.loadedSavedMapping", params: { modelName } }
      : { key: "settings.mapping.status.selectedModel", params: { modelName } };
    this.display();
  }

  private async loadFieldsFromAnki(cardType: CardType): Promise<void> {
    const modelName = this.getSelectedMappingNoteType(cardType);

    try {
      const modelDetails = await this.plugin.getNoteModelDetails(modelName);
      const mapping = this.noteFieldMappingService.suggest(cardType, modelName, modelDetails.fieldNames);
      const mappingKey = createNoteFieldMappingKey(cardType, modelName);

      this.draftMappings[mappingKey] = mapping;
      this.loadedModelDetails[mappingKey] = modelDetails;
      this.sectionStatuses[cardType] = { key: "settings.mapping.status.loadedFieldsForModel", params: { modelName } };
    } catch (error) {
      this.sectionStatuses[cardType] = toUserFacingMessage(error, "settings.mapping.status.failedLoadFields", { modelName });
    }

    this.display();
  }

  private async saveMapping(cardType: CardType): Promise<void> {
    const modelName = this.getSelectedMappingNoteType(cardType);
    const mappingKey = createNoteFieldMappingKey(cardType, modelName);
    const mapping = this.getCurrentMapping(mappingKey);

    if (!mapping) {
      this.sectionStatuses[cardType] = { key: "settings.mapping.status.noLoadedFields", params: { modelName } };
      this.display();
      return;
    }

    try {
      this.noteFieldMappingService.validateMapping(mapping, this.loadedModelDetails[mappingKey] ?? {
        fieldNames: mapping.loadedFieldNames,
        isCloze: cardType === "cloze",
      });

      await this.plugin.updateSettings({
        noteFieldMappings: {
          ...this.plugin.settings.noteFieldMappings,
          [mappingKey]: {
            ...mapping,
            loadedFieldNames: [...mapping.loadedFieldNames],
          },
        },
      });

      this.sectionStatuses[cardType] = { key: "settings.mapping.status.savedMapping", params: { modelName } };
    } catch (error) {
      this.sectionStatuses[cardType] = toUserFacingMessage(error, "settings.mapping.status.failedSaveMapping", { modelName });
    }

    this.display();
  }

  private getSelectableNoteModels(cardType: CardType, selectedModelName: string): string[] {
    void cardType;
    const noteModels = this.getSelectableMappingNoteModels();

    if (!noteModels.includes(selectedModelName)) {
      noteModels.unshift(selectedModelName);
    }

    return noteModels;
  }

  private getSelectableMappingNoteModels(): string[] {
    return this.availableNoteModels.length > 0 ? [...this.availableNoteModels] : [];
  }

  private updateDraftMapping(
    cardType: CardType,
    modelName: string,
    partialMapping: Partial<NoteModelFieldMapping>,
  ): void {
    const mappingKey = createNoteFieldMappingKey(cardType, modelName);
    const currentMapping = this.getCurrentMapping(mappingKey);

    if (!currentMapping) {
      return;
    }

    this.draftMappings[mappingKey] = {
      ...currentMapping,
      ...partialMapping,
    };
  }

  private getCurrentMapping(mappingKey: string): NoteModelFieldMapping | undefined {
    const mapping = this.draftMappings[mappingKey] ?? this.plugin.settings.noteFieldMappings[mappingKey];

    if (!mapping) {
      return undefined;
    }

    return {
      ...mapping,
      loadedFieldNames: [...mapping.loadedFieldNames],
    };
  }

  private getSelectedNoteType(cardType: CardType): string {
    if (cardType === "basic") {
      return this.plugin.settings.qaNoteType;
    }

    if (cardType === "cloze") {
      return this.plugin.settings.clozeNoteType;
    }

    return this.plugin.settings.semanticQaNoteType;
  }

  private getSelectedMappingNoteType(cardType: CardType): string {
    return this.getSelectedNoteType(cardType);
  }

  private renderQaGroupModelStatus(containerEl: HTMLElement): void {
    const definition = buildQaGroupModelDefinition();
    containerEl.createEl("p", {
      text: t("settings.qaGroup.managedNoteType", {
        modelName: definition.modelName,
      }),
    });
    containerEl.createEl("p", {
      text: t("settings.qaGroup.managedModelContract", {
        fieldCount: definition.fieldNames.length,
        templateCount: definition.templates.length,
      }),
    });
  }

  private renderSemanticQaPreview(containerEl: HTMLElement, marker: string, cardAnswerCutoffMode: CardAnswerCutoffMode): void {
    const sampleHeading = `城市更新 ${marker}`;

    containerEl.createEl("h4", { text: t("settings.semanticQa.previewTitle") });
    containerEl.createEl("p", { text: t("settings.semanticQa.triggerHeadingExample", { heading: sampleHeading }) });

    const previewCards = this.semanticQaListParser.parse({
      parentHeadingText: sampleHeading,
      marker,
      bodyLines: [
        "- 核心产品",
        "  百人会、城市更新研习社、城市更新创投营。",
        "- 目标客户",
        "  对城市更新有系统学习需求的从业者。",
      ],
      bodyStartLine: 2,
      cardAnswerCutoffMode,
    });

    if (previewCards.length === 0) {
      containerEl.createEl("p", { text: t("settings.semanticQa.previewUnavailable") });
      return;
    }

    const firstPreview = previewCards[0];
    containerEl.createEl("p", { text: t("settings.semanticQa.questionPreview", { question: firstPreview.heading }) });
    containerEl.createEl("p", { text: t("settings.semanticQa.answerPreview", { answer: firstPreview.bodyMarkdown }) });
  }

  private renderDeckSection(containerEl: HTMLElement, settings: AnkiHeadingSyncPlugin["settings"]): void {
    containerEl.createEl("h3", { text: t("settings.deck.defaultSectionTitle") });

    new Setting(containerEl)
      .setName(t("settings.deck.defaultDeck.name"))
      .setDesc(t("settings.deck.defaultDeck.desc"))
      .addText((text) => {
        text.setValue(settings.defaultDeck).onChange((value) => {
          void this.plugin.updateSettings({ defaultDeck: value });
        });
      });

    containerEl.createEl("h3", { text: t("settings.deck.fileDeckSectionTitle") });

    new Setting(containerEl)
      .setName(t("settings.deck.fileDeckEnabled.name"))
      .setDesc(t("settings.deck.fileDeckEnabled.desc"))
      .addToggle((toggle) => {
        toggle.setValue(settings.fileDeckEnabled).onChange(async (value) => {
          await this.plugin.updateSettings({ fileDeckEnabled: value });
          this.display();
        });
      });

    if (settings.fileDeckEnabled) {
      new Setting(containerEl)
        .setName(t("settings.deck.marker.name"))
        .setDesc(t("settings.deck.marker.desc"))
        .addText((text) => {
          text.setValue(settings.fileDeckMarker).onChange((value) => {
            const nextValue = value.trim();
            if (!nextValue) {
              return;
            }

            void this.plugin.updateSettings({ fileDeckMarker: nextValue });
          });
        });

      new Setting(containerEl)
        .setName(t("settings.deck.template.name"))
        .setDesc(t("settings.deck.template.desc"))
        .addText((text) => {
          text.setValue(settings.fileDeckTemplate).onChange((value) => {
            const nextValue = value.trim();
            if (!nextValue) {
              return;
            }

            void this.plugin.updateSettings({ fileDeckTemplate: nextValue });
          });
        });

      new Setting(containerEl)
        .setName(t("settings.deck.insertLocation.name"))
        .setDesc(t("settings.deck.insertLocation.desc"))
        .addDropdown((dropdown) => {
          this.populateFileDeckInsertLocationDropdown(dropdown, settings.fileDeckInsertLocation);
          dropdown.onChange((value) => {
            if (value !== "yaml" && value !== "body") {
              return;
            }

            void this.plugin.updateSettings({ fileDeckInsertLocation: value });
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

    containerEl.createEl("h3", { text: t("settings.deck.folderMappingSectionTitle") });

    new Setting(containerEl)
      .setName(t("settings.deck.folderDeckMode.name"))
      .setDesc(t("settings.deck.folderDeckMode.desc"))
      .addDropdown((dropdown) => {
        this.populateFolderDeckModeDropdown(dropdown, settings.folderDeckMode);
        dropdown.onChange((value) => {
          if (value !== "off" && value !== "folder" && value !== "folder-and-file") {
            return;
          }

          void this.plugin.updateSettings({ folderDeckMode: value });
        });
      });

    containerEl.createEl("p", { text: t("settings.deck.folderExample") });
    containerEl.createEl("p", { text: t("settings.deck.folderAndFileExample") });

    containerEl.createEl("h3", { text: t("settings.deck.priorityTitle") });
    containerEl.createEl("p", {
      text: t("settings.deck.priorityDesc"),
    });
  }

  private populateFileDeckInsertLocationDropdown(dropdown: SimpleDropdown, selectedValue: FileDeckInsertLocation): void {
    dropdown.addOption("body", t("settings.deck.insertLocation.options.body"));
    dropdown.addOption("yaml", t("settings.deck.insertLocation.options.yaml"));
    dropdown.setValue(selectedValue);
  }

  private populateFolderDeckModeDropdown(dropdown: SimpleDropdown, selectedValue: FolderDeckMode): void {
    dropdown.addOption("off", t("settings.deck.folderDeckMode.options.off"));
    dropdown.addOption("folder", t("settings.deck.folderDeckMode.options.folder"));
    dropdown.addOption("folder-and-file", t("settings.deck.folderDeckMode.options.folderAndFile"));
    dropdown.setValue(selectedValue);
  }

  private renderScopeSection(containerEl: HTMLElement, settings: AnkiHeadingSyncPlugin["settings"]): void {
    new Setting(containerEl)
      .setName(t("settings.scope.name"))
      .setDesc(getScopeModeSummary(settings.scopeMode))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", t("settings.scope.option.all"))
          .addOption("include", t("settings.scope.option.include"))
          .addOption("exclude", t("settings.scope.option.exclude"))
          .setValue(settings.scopeMode)
          .onChange((value) => {
            if (value !== "all" && value !== "include" && value !== "exclude") {
              return;
            }

            void this.updateScopeMode(value);
          });
      });

    if (settings.scopeMode === "all") {
      return;
    }

    this.ensureFolderTreeLoaded();

    const scopeContainer = containerEl.createDiv();
    scopeContainer.createEl("p", { text: getScopeModeTreeDescription(settings.scopeMode) });

    if (this.folderTreeLoadPromise) {
      scopeContainer.createEl("p", { text: renderUserFacingMessage(this.folderTreeStatus) });
      return;
    }

    if (this.folderTree.length === 0) {
      scopeContainer.createEl("p", { text: renderUserFacingMessage(this.folderTreeStatus) });
      return;
    }

    const selectedFolders = settings.scopeMode === "include" ? settings.includeFolders : settings.excludeFolders;
    const selectionTree = buildFolderTreeSelection(this.folderTree, selectedFolders);
    const treeContainer = scopeContainer.createDiv();
    treeContainer.style.marginTop = "8px";
    treeContainer.style.display = "flex";
    treeContainer.style.flexDirection = "column";
    treeContainer.style.gap = "2px";

    for (const node of selectionTree) {
      this.renderFolderNode(treeContainer, node, settings.scopeMode, 0);
    }
  }

  private renderFolderNode(containerEl: HTMLElement, node: FolderTreeSelectionNode, scopeMode: ScopeMode, depth: number): void {
    const row = containerEl.createDiv();
    row.dataset.folderRow = node.path;
    row.dataset.folderDepth = String(depth);
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.minHeight = "24px";
    row.style.paddingLeft = `${depth * 18}px`;

    const hasChildren = node.children.length > 0;
    const expanded = hasChildren && this.expandedFolderPaths.has(node.path);
    const toggleControl = row.createEl(hasChildren ? "button" : "span");
    toggleControl.dataset.folderToggle = node.path;
    toggleControl.textContent = hasChildren ? (expanded ? "▾" : "▸") : "";
    toggleControl.style.width = "18px";
    toggleControl.style.display = "inline-flex";
    toggleControl.style.alignItems = "center";
    toggleControl.style.justifyContent = "center";
    toggleControl.style.flexShrink = "0";
    toggleControl.style.padding = "0";
    toggleControl.style.border = "0";
    toggleControl.style.background = "transparent";
    toggleControl.style.color = "var(--text-muted)";
    toggleControl.style.cursor = hasChildren ? "pointer" : "default";

    if (hasChildren) {
      toggleControl.setAttr("aria-label", expanded ? t("settings.scope.collapseFolder", { name: node.name }) : t("settings.scope.expandFolder", { name: node.name }));
      toggleControl.setAttr("aria-expanded", String(expanded));
      toggleControl.addEventListener("click", () => {
        this.toggleFolderExpanded(node.path);
      });
    }

    const checkbox = row.createEl("input") as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.checked = node.checked;
    checkbox.indeterminate = node.indeterminate;
    checkbox.dataset.folderPath = node.path;
    checkbox.style.margin = "0";
    checkbox.addEventListener("change", () => {
      void this.updateFolderSelection(scopeMode, node.path, checkbox.checked);
    });

    const label = row.createEl("span", { text: node.name });
    label.dataset.folderPathLabel = node.path;
    label.style.userSelect = "none";

    if (!hasChildren || !expanded) {
      return;
    }

    const childrenContainer = containerEl.createDiv();
    childrenContainer.dataset.folderChildren = node.path;
    childrenContainer.style.display = "flex";
    childrenContainer.style.flexDirection = "column";
    childrenContainer.style.gap = "2px";
    for (const child of node.children) {
      this.renderFolderNode(childrenContainer, child, scopeMode, depth + 1);
    }
  }

  private ensureFolderTreeLoaded(): void {
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
        this.display();
      });
  }

  private async updateScopeMode(scopeMode: ScopeMode): Promise<void> {
    await this.plugin.updateSettings({ scopeMode });
    this.display();
  }

  private async updateFolderSelection(scopeMode: ScopeMode, folderPath: string, checked: boolean): Promise<void> {
    const currentSelection = scopeMode === "include" ? this.plugin.settings.includeFolders : this.plugin.settings.excludeFolders;
    const nextSelection = toggleFolderTreeSelection(this.folderTree, currentSelection, folderPath, checked);

    await this.plugin.updateSettings(scopeMode === "include" ? { includeFolders: nextSelection } : { excludeFolders: nextSelection });
    this.display();
  }

  private toggleFolderExpanded(folderPath: string): void {
    if (this.expandedFolderPaths.has(folderPath)) {
      this.expandedFolderPaths.delete(folderPath);
    } else {
      this.expandedFolderPaths.add(folderPath);
    }

    this.display();
  }
}

function getMappingSectionText(cardType: CardType): { title: string; description: string } {
  if (cardType === "cloze") {
    return {
      title: t("settings.mapping.section.cloze.title"),
      description: t("settings.mapping.section.cloze.description"),
    };
  }

  if (cardType === "semantic-qa") {
    return {
      title: t("settings.mapping.section.semanticQa.title"),
      description: t("settings.mapping.section.semanticQa.description"),
    };
  }

  return {
    title: t("settings.mapping.section.basic.title"),
    description: t("settings.mapping.section.basic.description"),
  };
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
