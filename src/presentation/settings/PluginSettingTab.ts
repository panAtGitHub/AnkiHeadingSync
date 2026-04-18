import { PluginSettingTab, Setting } from "obsidian";

import type { ScopeMode } from "@/application/config/PluginSettings";
import { createNoteFieldMappingKey, type NoteModelFieldMapping } from "@/application/config/NoteModelFieldMapping";
import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import { NoteFieldMappingService } from "@/application/services/NoteFieldMappingService";
import type { CardType } from "@/domain/card/entities/RenderedFields";
import type AnkiHeadingSyncPlugin from "@/presentation/AnkiHeadingSyncPlugin";

import { buildFolderTreeSelection, toggleFolderTreeSelection, type FolderTreeSelectionNode } from "./FolderScopeTree";

const NOTE_TYPE_STATUS_IDLE = "Refresh note types from Anki to load the available note types.";
const FOLDER_TREE_STATUS_LOADING = "正在读取当前 vault 文件夹...";

interface MappingSectionConfig {
  cardType: CardType;
  title: string;
  description: string;
}

type SimpleDropdown = {
  addOption(value: string, label: string): unknown;
  setValue(value: string): unknown;
  onChange(callback: (value: string) => void): unknown;
};

export class AnkiHeadingSyncSettingTab extends PluginSettingTab {
  private readonly noteFieldMappingService = new NoteFieldMappingService();
  private availableNoteModels: string[] = [];
  private noteTypeStatus = NOTE_TYPE_STATUS_IDLE;
  private readonly draftMappings: Record<string, NoteModelFieldMapping> = {};
  private readonly loadedModelDetails: Record<string, NoteModelDetails> = {};
  private readonly sectionStatuses: Partial<Record<CardType, string>> = {};
  private folderTree: FolderTreeNode[] = [];
  private folderTreeStatus = FOLDER_TREE_STATUS_LOADING;
  private folderTreeLoadPromise: Promise<void> | null = null;
  private hasLoadedFolderTree = false;

  constructor(plugin: AnkiHeadingSyncPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  declare plugin: AnkiHeadingSyncPlugin;

  display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Anki Heading Sync" });

    new Setting(containerEl)
      .setName("AnkiConnect URL")
      .setDesc("Default is http://127.0.0.1:8765")
      .addText((text) => {
        text.setPlaceholder("http://127.0.0.1:8765").setValue(settings.ankiConnectUrl).onChange((value) => {
          void this.plugin.updateSettings({ ankiConnectUrl: value.trim() || settings.ankiConnectUrl });
        });
      });

    new Setting(containerEl)
      .setName("Default deck")
      .setDesc("Used when a file does not define TARGET DECK")
      .addText((text) => {
        text.setValue(settings.defaultDeck).onChange((value) => {
          void this.plugin.updateSettings({ defaultDeck: value });
        });
      });

    new Setting(containerEl)
      .setName("QA heading level")
      .setDesc("Default is H4")
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level += 1) {
          dropdown.addOption(String(level), `H${level}`);
        }

        dropdown.setValue(String(settings.qaHeadingLevel)).onChange((value) => {
          void this.plugin.updateSettings({ qaHeadingLevel: Number(value) });
        });
      });

    new Setting(containerEl)
      .setName("Cloze heading level")
      .setDesc("Default is H5")
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level += 1) {
          dropdown.addOption(String(level), `H${level}`);
        }

        dropdown.setValue(String(settings.clozeHeadingLevel)).onChange((value) => {
          void this.plugin.updateSettings({ clozeHeadingLevel: Number(value) });
        });
      });

    this.renderScopeSection(containerEl, settings);

    new Setting(containerEl)
      .setName("Add Obsidian backlink")
      .setDesc("Append a backlink to the source heading into synced cards.")
      .addToggle((toggle) => {
        toggle.setValue(settings.addObsidianBacklink).onChange((value) => {
          void this.plugin.updateSettings({ addObsidianBacklink: value });
        });
      });

    new Setting(containerEl)
      .setName("Highlights to Cloze")
      .setDesc("Convert ==highlight== segments into cloze deletions for cloze cards.")
      .addToggle((toggle) => {
        toggle.setValue(settings.convertHighlightsToCloze).onChange((value) => {
          void this.plugin.updateSettings({ convertHighlightsToCloze: value });
        });
      });

    containerEl.createEl("h3", { text: "Note type field mappings" });

    new Setting(containerEl)
      .setName("Refresh note types from Anki")
      .setDesc(this.noteTypeStatus)
      .addButton((button) => {
        button.setButtonText("Refresh note types").onClick(() => {
          void this.refreshNoteTypes();
        });
      });

    this.renderMappingSection(containerEl, {
      cardType: "basic",
      title: "QA / Basic",
      description: "Choose the QA note type, read its fields from Anki, then confirm the title/body mapping.",
    });
    this.renderMappingSection(containerEl, {
      cardType: "cloze",
      title: "Cloze",
      description: "Choose the cloze note type, read its fields from Anki, then confirm the main field mapping.",
    });
  }

  private renderMappingSection(containerEl: HTMLElement, config: MappingSectionConfig): void {
    const selectedModelName = this.getSelectedNoteType(config.cardType);
    const mappingKey = createNoteFieldMappingKey(config.cardType, selectedModelName);
    const currentMapping = this.getCurrentMapping(mappingKey);

    containerEl.createEl("h4", { text: config.title });
    containerEl.createEl("p", { text: config.description });

    new Setting(containerEl)
      .setName(`${config.title} note type`)
      .setDesc("Loaded from Anki note types. Refresh if the latest models are not shown.")
      .addDropdown((dropdown) => {
        for (const noteModel of this.getSelectableNoteModels(selectedModelName)) {
          dropdown.addOption(noteModel, noteModel);
        }

        dropdown.setValue(selectedModelName).onChange((value) => {
          void this.updateSelectedNoteType(config.cardType, value);
        });
      });

    new Setting(containerEl)
      .setName(`${config.title} fields`)
      .setDesc("Load the current note type fields from Anki, then review the suggested mapping.")
      .addButton((button) => {
        button.setButtonText("Read fields from Anki").onClick(() => {
          void this.loadFieldsFromAnki(config.cardType);
        });
      });

    containerEl.createEl("p", {
      text:
        currentMapping?.loadedFieldNames.length
          ? `Loaded fields: ${currentMapping.loadedFieldNames.join(", ")}`
          : "Loaded fields: none. Read fields from Anki first.",
    });

    if (config.cardType === "basic") {
      this.renderBasicFieldSelectors(containerEl, selectedModelName, currentMapping);
    } else {
      this.renderClozeFieldSelector(containerEl, selectedModelName, currentMapping);
    }

    new Setting(containerEl)
      .setName(`${config.title} mapping`)
      .setDesc("Save the current field mapping for this specific note type.")
      .addButton((button) => {
        button.setButtonText("Save mapping").onClick(() => {
          void this.saveMapping(config.cardType);
        });
      });

    containerEl.createEl("p", {
      text:
        this.sectionStatuses[config.cardType] ??
        (this.plugin.settings.noteFieldMappings[mappingKey]
          ? `Saved mapping is ready for ${config.title}.`
          : `No saved mapping for ${config.title}. Read fields from Anki first.`),
    });
  }

  private renderBasicFieldSelectors(
    containerEl: HTMLElement,
    selectedModelName: string,
    mapping: NoteModelFieldMapping | undefined,
  ): void {
    const fieldNames = mapping?.loadedFieldNames ?? [];

    new Setting(containerEl)
      .setName("QA / Basic title field")
      .setDesc("Which Anki field should receive the heading/title fragment.")
      .addDropdown((dropdown) => {
        this.populateFieldDropdown(dropdown, fieldNames, mapping?.titleField);
        dropdown.onChange((value) => {
          this.updateDraftMapping("basic", selectedModelName, { titleField: value || undefined });
        });
      });

    new Setting(containerEl)
      .setName("QA / Basic body field")
      .setDesc("Which Anki field should receive the body fragment.")
      .addDropdown((dropdown) => {
        this.populateFieldDropdown(dropdown, fieldNames, mapping?.bodyField);
        dropdown.onChange((value) => {
          this.updateDraftMapping("basic", selectedModelName, { bodyField: value || undefined });
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
      .setName("Cloze main field")
      .setDesc("The selected field receives title + <br><br> + body during sync.")
      .addDropdown((dropdown) => {
        this.populateFieldDropdown(dropdown, fieldNames, mapping?.mainField);
        dropdown.onChange((value) => {
          this.updateDraftMapping("cloze", selectedModelName, { mainField: value || undefined });
        });
      });
  }

  private populateFieldDropdown(dropdown: SimpleDropdown, fieldNames: string[], selectedValue: string | undefined): void {
    dropdown.addOption("", "-- Select field --");

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
          ? `Loaded ${this.availableNoteModels.length} note types from Anki.`
          : "Anki returned no note types.";
    } catch (error) {
      this.noteTypeStatus = error instanceof Error ? error.message : "Failed to load note types from Anki.";
    }

    this.display();
  }

  private async updateSelectedNoteType(cardType: CardType, modelName: string): Promise<void> {
    if (cardType === "basic") {
      await this.plugin.updateSettings({ qaNoteType: modelName });
    } else {
      await this.plugin.updateSettings({ clozeNoteType: modelName });
    }

    const mappingKey = createNoteFieldMappingKey(cardType, modelName);
    this.sectionStatuses[cardType] = this.plugin.settings.noteFieldMappings[mappingKey]
      ? `Loaded saved mapping for ${modelName}.`
      : `Selected ${modelName}. Read fields from Anki to create or refresh its mapping.`;
    this.display();
  }

  private async loadFieldsFromAnki(cardType: CardType): Promise<void> {
    const modelName = this.getSelectedNoteType(cardType);

    try {
      const modelDetails = await this.plugin.getNoteModelDetails(modelName);
      const mapping = this.noteFieldMappingService.suggest(cardType, modelName, modelDetails.fieldNames);
      const mappingKey = createNoteFieldMappingKey(cardType, modelName);

      this.draftMappings[mappingKey] = mapping;
      this.loadedModelDetails[mappingKey] = modelDetails;
      this.sectionStatuses[cardType] = `Loaded fields for ${modelName}. Review the suggested mapping and save it.`;
    } catch (error) {
      this.sectionStatuses[cardType] = error instanceof Error ? error.message : `Failed to load fields for ${modelName}.`;
    }

    this.display();
  }

  private async saveMapping(cardType: CardType): Promise<void> {
    const modelName = this.getSelectedNoteType(cardType);
    const mappingKey = createNoteFieldMappingKey(cardType, modelName);
    const mapping = this.getCurrentMapping(mappingKey);

    if (!mapping) {
      this.sectionStatuses[cardType] = `No loaded fields for ${modelName}. Read fields from Anki first.`;
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

      this.sectionStatuses[cardType] = `Saved mapping for ${modelName}.`;
    } catch (error) {
      this.sectionStatuses[cardType] = error instanceof Error ? error.message : `Failed to save mapping for ${modelName}.`;
    }

    this.display();
  }

  private getSelectableNoteModels(selectedModelName: string): string[] {
    const noteModels = this.availableNoteModels.length > 0 ? [...this.availableNoteModels] : [];

    if (!noteModels.includes(selectedModelName)) {
      noteModels.unshift(selectedModelName);
    }

    return noteModels;
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
    return cardType === "basic" ? this.plugin.settings.qaNoteType : this.plugin.settings.clozeNoteType;
  }

  private renderScopeSection(containerEl: HTMLElement, settings: AnkiHeadingSyncPlugin["settings"]): void {
    new Setting(containerEl)
      .setName("运行范围")
      .setDesc(getScopeModeSummary(settings.scopeMode))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", "全部文件")
          .addOption("include", "仅在指定文件夹")
          .addOption("exclude", "排除指定文件夹")
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
      scopeContainer.createEl("p", { text: this.folderTreeStatus });
      return;
    }

    if (this.folderTree.length === 0) {
      scopeContainer.createEl("p", { text: this.folderTreeStatus });
      return;
    }

    const selectedFolders = settings.scopeMode === "include" ? settings.includeFolders : settings.excludeFolders;
    const selectionTree = buildFolderTreeSelection(this.folderTree, selectedFolders);
    const treeContainer = scopeContainer.createDiv();

    for (const node of selectionTree) {
      this.renderFolderNode(treeContainer, node, settings.scopeMode);
    }
  }

  private renderFolderNode(containerEl: HTMLElement, node: FolderTreeSelectionNode, scopeMode: ScopeMode): void {
    const row = containerEl.createDiv();
    const checkbox = row.createEl("input") as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.checked = node.checked;
    checkbox.indeterminate = node.indeterminate;
    checkbox.dataset.folderPath = node.path;
    checkbox.addEventListener("change", () => {
      void this.updateFolderSelection(scopeMode, node.path, checkbox.checked);
    });

    const label = row.createEl("span", { text: node.name });
    label.dataset.folderPathLabel = node.path;

    if (node.children.length === 0) {
      return;
    }

    const childrenContainer = containerEl.createDiv();
    for (const child of node.children) {
      this.renderFolderNode(childrenContainer, child, scopeMode);
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
        this.folderTreeStatus = folderTree.length > 0 ? "" : "当前 vault 中没有可选文件夹。";
      })
      .catch((error) => {
        this.folderTree = [];
        this.folderTreeStatus = error instanceof Error ? error.message : "读取 vault 文件夹失败。";
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
}

function getScopeModeSummary(scopeMode: ScopeMode): string {
  if (scopeMode === "include") {
    return "仅处理下方勾选文件夹中的 Markdown 文件";
  }

  if (scopeMode === "exclude") {
    return "处理整个 vault，但跳过下方勾选文件夹中的 Markdown 文件";
  }

  return "处理整个 vault 中的 Markdown 文件";
}

function getScopeModeTreeDescription(scopeMode: ScopeMode): string {
  if (scopeMode === "include") {
    return "仅在指定文件夹：只处理下方勾选文件夹中的 Markdown 文件";
  }

  return "排除指定文件夹：处理整个 vault，但跳过下方勾选文件夹中的 Markdown 文件";
}