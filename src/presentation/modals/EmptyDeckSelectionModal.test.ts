import { describe, expect, it, vi } from "vitest";

const {
  FakeButtonComponent,
  FakeModal,
  FakeSetting,
  FakeToggleComponent,
} = vi.hoisted(() => {
  class HoistedFakeElement {
    public children: HoistedFakeElement[] = [];
    public classes: string[] = [];

    constructor(public tag: string, public textContent = "") {}

    createEl(tag: string, options?: { text?: string }): HoistedFakeElement {
      const child = new HoistedFakeElement(tag, options?.text ?? "");
      this.children.push(child);
      return child;
    }

    addClass(className: string): void {
      this.classes.push(className);
    }
  }

  class HoistedFakeButtonComponent {
    public text = "";
    public disabled = false;
    private onClickHandler?: () => void | Promise<void>;

    setButtonText(text: string): this {
      this.text = text;
      return this;
    }

    setCta(): this {
      return this;
    }

    onClick(callback: () => void | Promise<void>): this {
      this.onClickHandler = callback;
      return this;
    }

    setDisabled(disabled: boolean): this {
      this.disabled = disabled;
      return this;
    }

    async click(): Promise<void> {
      if (this.disabled) {
        return;
      }
      await this.onClickHandler?.();
    }
  }

  class HoistedFakeToggleComponent {
    public value = false;
    private onChangeHandler?: (value: boolean) => void | Promise<void>;

    setValue(value: boolean): this {
      this.value = value;
      return this;
    }

    onChange(callback: (value: boolean) => void | Promise<void>): this {
      this.onChangeHandler = callback;
      return this;
    }

    async triggerChange(value: boolean): Promise<void> {
      this.value = value;
      await this.onChangeHandler?.(value);
    }
  }

  class HoistedFakeSetting {
    public name = "";
    public controls: Array<HoistedFakeButtonComponent | HoistedFakeToggleComponent> = [];
    public readonly settingEl = new HoistedFakeElement("div");

    constructor(containerEl: HoistedFakeContainerEl) {
      containerEl.settings.push(this);
    }

    setName(name: string): this {
      this.name = name;
      return this;
    }

    addButton(callback: (button: HoistedFakeButtonComponent) => void): this {
      const button = new HoistedFakeButtonComponent();
      this.controls.push(button);
      callback(button);
      return this;
    }

    addToggle(callback: (toggle: HoistedFakeToggleComponent) => void): this {
      const toggle = new HoistedFakeToggleComponent();
      this.controls.push(toggle);
      callback(toggle);
      return this;
    }
  }

  class HoistedFakeContainerEl {
    public settings: HoistedFakeSetting[] = [];
    public elements: HoistedFakeElement[] = [];

    empty(): void {
      this.settings = [];
      this.elements = [];
    }

    createEl(tag: string, options?: { text?: string }): HoistedFakeElement {
      const element = new HoistedFakeElement(tag, options?.text ?? "");
      this.elements.push(element);
      return element;
    }
  }

  class HoistedFakeModal {
    public readonly contentEl = new HoistedFakeContainerEl();

    constructor(public readonly app: unknown) {}

    open(): void {
      this.onOpen();
    }

    close(): void {
      this.onClose();
    }

    onOpen(): void {
      return;
    }

    onClose(): void {
      return;
    }
  }

  return {
    FakeButtonComponent: HoistedFakeButtonComponent,
    FakeElement: HoistedFakeElement,
    FakeModal: HoistedFakeModal,
    FakeSetting: HoistedFakeSetting,
    FakeToggleComponent: HoistedFakeToggleComponent,
  };
});

vi.mock("obsidian", () => ({
  Modal: FakeModal,
  Setting: FakeSetting,
}));

import { EmptyDeckSelectionModal } from "./EmptyDeckSelectionModal";

type FakeButtonComponentInstance = InstanceType<typeof FakeButtonComponent>;
type FakeContainerElInstance = InstanceType<typeof FakeModal>["contentEl"];
type FakeToggleComponentInstance = InstanceType<typeof FakeToggleComponent>;

function getFakeContentEl(modal: EmptyDeckSelectionModal): FakeContainerElInstance {
  return modal.contentEl as unknown as FakeContainerElInstance;
}

function getFooterButtons(contentEl: FakeContainerElInstance): FakeButtonComponentInstance[] {
  return contentEl.settings.at(-1)?.controls.filter((control) => control instanceof FakeButtonComponent) as FakeButtonComponentInstance[];
}

function getDeckToggles(contentEl: FakeContainerElInstance): FakeToggleComponentInstance[] {
  return contentEl.settings
    .slice(0, -1)
    .map((setting) => setting.controls.find((control) => control instanceof FakeToggleComponent))
    .filter((toggle): toggle is FakeToggleComponentInstance => Boolean(toggle));
}

function getFooterCountText(contentEl: FakeContainerElInstance): string | undefined {
  const footerSetting = contentEl.settings.at(-1);
  return footerSetting?.settingEl.children.find((child) => child.tag === "span")?.textContent;
}

describe("EmptyDeckSelectionModal", () => {
  it("starts with zero selected count and a disabled delete button", async () => {
    const modal = new EmptyDeckSelectionModal({} as never, ["Deck A", "Deck B", "Deck C"]);

    void modal.openAndGetSelection();
    const buttons = getFooterButtons(getFakeContentEl(modal));
    const deleteButton = buttons.find((button) => button.text === "删除所选空牌组");

    expect(deleteButton?.disabled).toBe(true);
    expect(getFooterCountText(getFakeContentEl(modal))).toBe("已选 0 / 共 3 个空牌组");
  });

  it("selects every candidate when the select-all button is clicked", async () => {
    const modal = new EmptyDeckSelectionModal({} as never, ["Deck A", "Deck B", "Deck C"]);

    const selectionPromise = modal.openAndGetSelection();
    const buttons = getFooterButtons(getFakeContentEl(modal));
    const selectAllButton = buttons.find((button) => button.text === "全选全部");
    const deleteButton = buttons.find((button) => button.text === "删除所选空牌组");

    expect(selectAllButton).toBeDefined();
    expect(deleteButton).toBeDefined();

    await selectAllButton?.click();

    expect(getDeckToggles(getFakeContentEl(modal)).map((toggle) => toggle.value)).toEqual([true, true, true]);
    expect(deleteButton?.disabled).toBe(false);
    expect(getFooterCountText(getFakeContentEl(modal))).toBe("已选 3 / 共 3 个空牌组");

    await deleteButton?.click();

    await expect(selectionPromise).resolves.toEqual(["Deck A", "Deck B", "Deck C"]);
  });

  it("clears every candidate when the clear-all button is clicked", async () => {
    const modal = new EmptyDeckSelectionModal({} as never, ["Deck A", "Deck B", "Deck C"]);

    void modal.openAndGetSelection();
    const buttons = getFooterButtons(getFakeContentEl(modal));
    const selectAllButton = buttons.find((button) => button.text === "全选全部");
    const clearAllButton = buttons.find((button) => button.text === "全部不选");
    const deleteButton = buttons.find((button) => button.text === "删除所选空牌组");

    await selectAllButton?.click();
    await clearAllButton?.click();

    expect(getDeckToggles(getFakeContentEl(modal)).map((toggle) => toggle.value)).toEqual([false, false, false]);
    expect(deleteButton?.disabled).toBe(true);
    expect(getFooterCountText(getFakeContentEl(modal))).toBe("已选 0 / 共 3 个空牌组");
  });

  it("inverts selected candidates when the invert button is clicked", async () => {
    const modal = new EmptyDeckSelectionModal({} as never, ["Deck A", "Deck B", "Deck C"]);

    void modal.openAndGetSelection();
    const contentEl = getFakeContentEl(modal);
    const toggles = getDeckToggles(contentEl);
    const buttons = getFooterButtons(contentEl);
    const invertButton = buttons.find((button) => button.text === "反选");
    const deleteButton = buttons.find((button) => button.text === "删除所选空牌组");

    await toggles[0]?.triggerChange(true);
    await invertButton?.click();

    expect(getDeckToggles(contentEl).map((toggle) => toggle.value)).toEqual([false, true, true]);
    expect(deleteButton?.disabled).toBe(false);
    expect(getFooterCountText(contentEl)).toBe("已选 2 / 共 3 个空牌组");
  });

  it("enables and disables the delete button as manual selection changes", async () => {
    const modal = new EmptyDeckSelectionModal({} as never, ["Deck A"]);

    void modal.openAndGetSelection();
    const contentEl = getFakeContentEl(modal);
    const toggle = getDeckToggles(contentEl)[0];
    const deleteButton = getFooterButtons(contentEl).find((button) => button.text === "删除所选空牌组");

    await toggle?.triggerChange(true);
    expect(deleteButton?.disabled).toBe(false);
    expect(getFooterCountText(contentEl)).toBe("已选 1 / 共 1 个空牌组");

    await toggle?.triggerChange(false);
    expect(deleteButton?.disabled).toBe(true);
    expect(getFooterCountText(contentEl)).toBe("已选 0 / 共 1 个空牌组");
  });

  it("returns null when cancel is clicked", async () => {
    const modal = new EmptyDeckSelectionModal({} as never, ["Deck A", "Deck B"]);

    const selectionPromise = modal.openAndGetSelection();
    const cancelButton = getFooterButtons(getFakeContentEl(modal)).find((button) => button.text === "取消");

    await cancelButton?.click();

    await expect(selectionPromise).resolves.toBeNull();
  });
});
