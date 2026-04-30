import { Modal, Setting, type App, type ButtonComponent, type ToggleComponent } from "obsidian";

import { t } from "@/presentation/i18n";

export class EmptyDeckSelectionModal extends Modal {
  private readonly deckToggles = new Map<string, ToggleComponent>();
  private readonly selectedDeckNames = new Set<string>();
  private deleteButton?: ButtonComponent;
  private selectionCountEl?: HTMLElement;
  private resolver?: (value: string[] | null) => void;
  private resolvedValue: string[] | null = null;

  constructor(app: App, private readonly candidateDeckNames: string[]) {
    super(app);
  }

  openAndGetSelection(): Promise<string[] | null> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.open();
    });
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("modal.emptyDeck.title") });
    contentEl.createEl("p", { text: t("modal.emptyDeck.description") });

    for (const deckName of this.candidateDeckNames) {
      new Setting(contentEl)
        .setName(deckName)
        .addToggle((toggle) => {
          this.deckToggles.set(deckName, toggle);
          toggle.setValue(false).onChange((value) => {
            if (value) {
              this.selectedDeckNames.add(deckName);
            } else {
              this.selectedDeckNames.delete(deckName);
            }
            this.refreshSelectionState();
          });
        });
    }

    const footerSetting = new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t("modal.emptyDeck.selectAll")).onClick(() => {
          this.selectAllDecks();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("modal.emptyDeck.clearAll")).onClick(() => {
          this.clearSelectedDecks();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("modal.emptyDeck.invert")).onClick(() => {
          this.invertSelectedDecks();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("modal.emptyDeck.cancel")).onClick(() => {
          this.finish(null);
        });
      })
      .addButton((button) => {
        this.deleteButton = button;
        button.setButtonText(t("modal.emptyDeck.deleteSelected")).setCta().onClick(() => {
          this.finish(Array.from(this.selectedDeckNames));
        });
      });

    this.selectionCountEl = footerSetting.settingEl.createSpan({
      text: this.getSelectionCountText(),
    });
    this.selectionCountEl.addClass("anki-helper-empty-deck-selection-count");
    this.refreshSelectionState();
  }

  override onClose(): void {
    const resolve = this.resolver;
    const resolvedValue = this.resolvedValue;

    this.contentEl.empty();
    this.deckToggles.clear();
    this.deleteButton = undefined;
    this.selectionCountEl = undefined;
    this.resolver = undefined;
    this.resolvedValue = null;
    this.selectedDeckNames.clear();

    resolve?.(resolvedValue);
  }

  private finish(value: string[] | null): void {
    this.resolvedValue = value;
    this.close();
  }

  private selectAllDecks(): void {
    this.selectedDeckNames.clear();

    for (const deckName of this.candidateDeckNames) {
      this.selectedDeckNames.add(deckName);
      this.deckToggles.get(deckName)?.setValue(true);
    }

    this.refreshSelectionState();
  }

  private clearSelectedDecks(): void {
    this.selectedDeckNames.clear();

    for (const deckName of this.candidateDeckNames) {
      this.deckToggles.get(deckName)?.setValue(false);
    }
    this.refreshSelectionState();
  }

  private invertSelectedDecks(): void {
    const nextSelectedDeckNames = new Set<string>();

    for (const deckName of this.candidateDeckNames) {
      const nextValue = !this.selectedDeckNames.has(deckName);
      this.deckToggles.get(deckName)?.setValue(nextValue);
      if (nextValue) {
        nextSelectedDeckNames.add(deckName);
      }
    }

    this.selectedDeckNames.clear();
    for (const deckName of nextSelectedDeckNames) {
      this.selectedDeckNames.add(deckName);
    }
    this.refreshSelectionState();
  }

  private refreshSelectionState(): void {
    this.deleteButton?.setDisabled(this.selectedDeckNames.size === 0);
    if (this.selectionCountEl) {
      this.selectionCountEl.textContent = this.getSelectionCountText();
    }
  }

  private getSelectionCountText(): string {
    return t("modal.emptyDeck.selectionCount", {
      selected: this.selectedDeckNames.size,
      total: this.candidateDeckNames.length,
    });
  }
}
