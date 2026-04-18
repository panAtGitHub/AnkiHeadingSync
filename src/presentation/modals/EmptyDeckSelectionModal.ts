import { Modal, Setting, type App } from "obsidian";

export class EmptyDeckSelectionModal extends Modal {
  private readonly selectedDeckNames = new Set<string>();
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
    contentEl.createEl("h2", { text: "清理空牌组" });
    contentEl.createEl("p", { text: "勾选要删除的空牌组。只有删除时仍为空的牌组会被真正删除。" });

    for (const deckName of this.candidateDeckNames) {
      new Setting(contentEl)
        .setName(deckName)
        .addToggle((toggle) => {
          toggle.setValue(false).onChange((value) => {
            if (value) {
              this.selectedDeckNames.add(deckName);
              return;
            }

            this.selectedDeckNames.delete(deckName);
          });
        });
    }

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("取消").onClick(() => {
          this.finish(null);
        });
      })
      .addButton((button) => {
        button.setButtonText("删除所选空牌组").setCta().onClick(() => {
          this.finish(Array.from(this.selectedDeckNames));
        });
      });
  }

  override onClose(): void {
    const resolve = this.resolver;
    const resolvedValue = this.resolvedValue;

    this.contentEl.empty();
    this.resolver = undefined;
    this.resolvedValue = null;
    this.selectedDeckNames.clear();

    resolve?.(resolvedValue);
  }

  private finish(value: string[] | null): void {
    this.resolvedValue = value;
    this.close();
  }
}