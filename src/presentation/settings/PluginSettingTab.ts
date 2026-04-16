import { PluginSettingTab, Setting } from "obsidian";

import type AnkiHeadingSyncPlugin from "@/presentation/AnkiHeadingSyncPlugin";

export class AnkiHeadingSyncSettingTab extends PluginSettingTab {
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

    new Setting(containerEl)
      .setName("QA note type")
      .setDesc("Default is Basic")
      .addText((text) => {
        text.setValue(settings.qaNoteType).onChange((value) => {
          void this.plugin.updateSettings({ qaNoteType: value });
        });
      });

    new Setting(containerEl)
      .setName("Cloze note type")
      .setDesc("Default is Cloze")
      .addText((text) => {
        text.setValue(settings.clozeNoteType).onChange((value) => {
          void this.plugin.updateSettings({ clozeNoteType: value });
        });
      });

    new Setting(containerEl)
      .setName("Include folders")
      .setDesc("Comma-separated folder paths. Empty means scan the whole vault.")
      .addTextArea((textArea) => {
        textArea.setValue(settings.includeFolders.join(", ")).onChange((value) => {
          void this.plugin.updateSettings({ includeFolders: splitFolders(value) });
        });
      });

    new Setting(containerEl)
      .setName("Exclude folders")
      .setDesc("Comma-separated folder paths always filtered out of vault sync.")
      .addTextArea((textArea) => {
        textArea.setValue(settings.excludeFolders.join(", ")).onChange((value) => {
          void this.plugin.updateSettings({ excludeFolders: splitFolders(value) });
        });
      });

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
  }
}

function splitFolders(value: string): string[] {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}