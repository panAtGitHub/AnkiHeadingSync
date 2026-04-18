import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { DEFAULT_SETTINGS } from "@/application/config/PluginSettings";

const {
  FakeButtonComponent,
  FakeDropdownComponent,
  FakeElement,
  FakePluginSettingTab,
  FakeSetting,
} = vi.hoisted(() => {
  class HoistedFakeElement {
    public readonly children: HoistedFakeElement[] = [];
    public readonly dataset: Record<string, string> = {};
    public readonly style: Record<string, string> = {};
    public checked = false;
    public indeterminate = false;
    public type = "";
    public value = "";
    public text = "";
    public textContent = "";

    private readonly listeners = new Map<string, Array<() => void | Promise<void>>>();

    constructor(
      public readonly root: HoistedFakeContainerEl,
      public readonly tag: string,
    ) {}

    createEl(tag: string, options?: { text?: string }): HoistedFakeElement {
      const child = new HoistedFakeElement(this.root, tag);
      if (options?.text) {
        child.text = options.text;
        this.root.textNodes.push(options.text);
      }

      this.children.push(child);
      return child;
    }

    createDiv(options?: { text?: string }): HoistedFakeElement {
      return this.createEl("div", options);
    }

    addEventListener(eventName: string, callback: () => void | Promise<void>): void {
      const callbacks = this.listeners.get(eventName) ?? [];
      callbacks.push(callback);
      this.listeners.set(eventName, callbacks);
    }

    async trigger(eventName: string): Promise<void> {
      for (const callback of this.listeners.get(eventName) ?? []) {
        await callback();
      }
    }

    setAttr(name: string, value: string | number): this {
      (this as Record<string, unknown>)[name] = value;
      return this;
    }
  }

  class HoistedFakeContainerEl extends HoistedFakeElement {
    public settings: HoistedFakeSetting[] = [];
    public textNodes: string[] = [];

    constructor() {
      super(undefined as never, "root");
      (this as { root: HoistedFakeContainerEl }).root = this;
    }

    empty(): void {
      this.settings = [];
      this.textNodes = [];
      this.children.length = 0;
    }
  }

  class HoistedFakeButtonComponent {
    public text = "";
    private onClickHandler?: () => void | Promise<void>;

    setButtonText(text: string): this {
      this.text = text;
      return this;
    }

    onClick(callback: () => void | Promise<void>): this {
      this.onClickHandler = callback;
      return this;
    }

    async click(): Promise<void> {
      await this.onClickHandler?.();
    }
  }

  class HoistedFakeDropdownComponent {
    public options: Array<{ value: string; label: string }> = [];
    public value = "";
    private onChangeHandler?: (value: string) => void | Promise<void>;

    addOption(value: string, label: string): this {
      this.options.push({ value, label });
      return this;
    }

    setValue(value: string): this {
      this.value = value;
      return this;
    }

    onChange(callback: (value: string) => void | Promise<void>): this {
      this.onChangeHandler = callback;
      return this;
    }

    async triggerChange(value: string): Promise<void> {
      this.value = value;
      await this.onChangeHandler?.(value);
    }
  }

  class HoistedFakeTextComponent {
    public value = "";

    setPlaceholder(value: string): this {
      void value;
      return this;
    }

    setValue(value: string): this {
      this.value = value;
      return this;
    }

    onChange(callback: (value: string) => void | Promise<void>): this {
      void callback;
      return this;
    }
  }

  class HoistedFakeToggleComponent {
    public value = false;

    setValue(value: boolean): this {
      this.value = value;
      return this;
    }

    onChange(callback: (value: boolean) => void | Promise<void>): this {
      void callback;
      return this;
    }
  }

  class HoistedFakeSetting {
    public name = "";
    public desc: unknown = "";
    public controls: Array<
      HoistedFakeButtonComponent | HoistedFakeDropdownComponent | HoistedFakeTextComponent | HoistedFakeToggleComponent
    > = [];

    constructor(containerEl: HoistedFakeContainerEl) {
      containerEl.settings.push(this);
    }

    setName(name: string): this {
      this.name = name;
      return this;
    }

    setDesc(desc: unknown): this {
      this.desc = desc;
      return this;
    }

    addButton(callback: (button: HoistedFakeButtonComponent) => void): this {
      const button = new HoistedFakeButtonComponent();
      this.controls.push(button);
      callback(button);
      return this;
    }

    addDropdown(callback: (dropdown: HoistedFakeDropdownComponent) => void): this {
      const dropdown = new HoistedFakeDropdownComponent();
      this.controls.push(dropdown);
      callback(dropdown);
      return this;
    }

    addText(callback: (text: HoistedFakeTextComponent) => void): this {
      const text = new HoistedFakeTextComponent();
      this.controls.push(text);
      callback(text);
      return this;
    }

    addTextArea(callback: (text: HoistedFakeTextComponent) => void): this {
      const text = new HoistedFakeTextComponent();
      this.controls.push(text);
      callback(text);
      return this;
    }

    addToggle(callback: (toggle: HoistedFakeToggleComponent) => void): this {
      const toggle = new HoistedFakeToggleComponent();
      this.controls.push(toggle);
      callback(toggle);
      return this;
    }
  }

  class HoistedFakePluginSettingTab {
    public containerEl = new HoistedFakeContainerEl();

    constructor(
      public readonly app: unknown,
      public readonly plugin: unknown,
    ) {}
  }

  return {
    FakeButtonComponent: HoistedFakeButtonComponent,
    FakeDropdownComponent: HoistedFakeDropdownComponent,
    FakeElement: HoistedFakeElement,
    FakePluginSettingTab: HoistedFakePluginSettingTab,
    FakeSetting: HoistedFakeSetting,
  };
});

vi.mock("obsidian", () => ({
  PluginSettingTab: FakePluginSettingTab,
  Setting: FakeSetting,
}));

import { AnkiHeadingSyncSettingTab } from "./PluginSettingTab";

type FakeContainerElInstance = InstanceType<typeof FakePluginSettingTab>["containerEl"];
type FakeSettingInstance = InstanceType<typeof FakeSetting>;
type FakeButtonComponentInstance = InstanceType<typeof FakeButtonComponent>;
type FakeDropdownComponentInstance = InstanceType<typeof FakeDropdownComponent>;
type FakeElementInstance = InstanceType<typeof FakeElement>;

class FakePlugin {
  public readonly app = {};
  public settings = {
    ...DEFAULT_SETTINGS,
    qaNoteType: "Custom Basic",
    noteFieldMappings: {},
  };
  public folderTree = [
    {
      path: "notes",
      name: "notes",
      children: [
        {
          path: "notes/sub",
          name: "sub",
          children: [],
        },
        {
          path: "notes/other",
          name: "other",
          children: [],
        },
      ],
    },
    {
      path: "empty",
      name: "empty",
      children: [],
    },
  ];

  async updateSettings(partialSettings: Record<string, unknown>): Promise<void> {
    this.settings = {
      ...this.settings,
      ...partialSettings,
    };
  }

  async listNoteModels(): Promise<string[]> {
    return ["Basic", "Cloze", "Custom Basic", "Custom Cloze"];
  }

  async getNoteModelDetails(modelName: string) {
    if (modelName === "Custom Cloze") {
      return {
        fieldNames: ["Text", "Extra", "Context"],
        isCloze: true,
      };
    }

    return {
      fieldNames: ["Title", "Body", "Hint"],
      isCloze: false,
    };
  }

  async listFolderTree() {
    return this.folderTree;
  }
}

function findSetting(containerEl: FakeContainerElInstance, name: string): FakeSettingInstance {
  const setting = containerEl.settings.find((candidate: FakeSettingInstance) => candidate.name === name);

  if (!setting) {
    throw new Error(`Setting not found: ${name}`);
  }

  return setting;
}

function querySetting(containerEl: FakeContainerElInstance, name: string): FakeSettingInstance | undefined {
  return containerEl.settings.find((candidate: FakeSettingInstance) => candidate.name === name);
}

function getButton(setting: FakeSettingInstance): FakeButtonComponentInstance {
  const button = setting.controls.find((control: unknown) => control instanceof FakeButtonComponent);

  if (!button || !(button instanceof FakeButtonComponent)) {
    throw new Error(`Button not found for setting: ${setting.name}`);
  }

  return button;
}

function getDropdown(setting: FakeSettingInstance): FakeDropdownComponentInstance {
  const dropdown = setting.controls.find((control: unknown) => control instanceof FakeDropdownComponent);

  if (!dropdown || !(dropdown instanceof FakeDropdownComponent)) {
    throw new Error(`Dropdown not found for setting: ${setting.name}`);
  }

  return dropdown;
}

function queryCheckboxByPath(containerEl: FakeContainerElInstance, folderPath: string): FakeElementInstance | undefined {
  return findElement(containerEl, (element) => element.tag === "input" && element.dataset.folderPath === folderPath);
}

function getCheckboxByPath(containerEl: FakeContainerElInstance, folderPath: string): FakeElementInstance {
  const checkbox = queryCheckboxByPath(containerEl, folderPath);
  if (!checkbox) {
    throw new Error(`Checkbox not found for folder path: ${folderPath}`);
  }

  return checkbox;
}

function queryFolderToggle(containerEl: FakeContainerElInstance, folderPath: string): FakeElementInstance | undefined {
  return findElement(containerEl, (element) => element.dataset.folderToggle === folderPath);
}

function getFolderToggle(containerEl: FakeContainerElInstance, folderPath: string): FakeElementInstance {
  const toggle = queryFolderToggle(containerEl, folderPath);
  if (!toggle) {
    throw new Error(`Toggle not found for folder path: ${folderPath}`);
  }

  return toggle;
}

function getFolderRow(containerEl: FakeContainerElInstance, folderPath: string): FakeElementInstance {
  const row = findElement(containerEl, (element) => element.dataset.folderRow === folderPath);
  if (!row) {
    throw new Error(`Row not found for folder path: ${folderPath}`);
  }

  return row;
}

function findElement(
  root: FakeElementInstance,
  predicate: (element: FakeElementInstance) => boolean,
): FakeElementInstance | undefined {
  if (predicate(root)) {
    return root;
  }

  for (const child of root.children) {
    if (!(child instanceof FakeElement)) {
      continue;
    }

    const match = findElement(child as FakeElementInstance, predicate);
    if (match) {
      return match;
    }
  }

  return undefined;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AnkiHeadingSyncSettingTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes note type list from Anki into the dropdowns", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await getButton(findSetting(container, "Refresh note types from Anki")).click();

    const dropdown = getDropdown(findSetting(container, "QA / Basic note type"));
    expect(dropdown.options.map((option: { value: string }) => option.value)).toEqual(["Basic", "Cloze", "Custom Basic", "Custom Cloze"]);
  });

  it("loads fields, applies suggestions, and saves a user-adjusted basic mapping", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await getButton(findSetting(container, "Refresh note types from Anki")).click();
    await getButton(findSetting(container, "QA / Basic fields")).click();

    const titleDropdown = getDropdown(findSetting(container, "QA / Basic title field"));
    const bodyDropdown = getDropdown(findSetting(container, "QA / Basic body field"));

    expect(titleDropdown.value).toBe("Title");
    expect(bodyDropdown.value).toBe("Body");

    await bodyDropdown.triggerChange("Hint");
    await getButton(findSetting(container, "QA / Basic mapping")).click();

    expect(plugin.settings.noteFieldMappings).toEqual({
      [createNoteFieldMappingKey("basic", "Custom Basic")]: {
        cardType: "basic",
        modelName: "Custom Basic",
        loadedFieldNames: ["Title", "Body", "Hint"],
        titleField: "Title",
        bodyField: "Hint",
        loadedAt: expect.any(Number),
      },
    });
    expect(container.textNodes).toContain("Saved mapping for Custom Basic.");
  });

  it("loads cloze fields and suggests the main field", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await getButton(findSetting(container, "Refresh note types from Anki")).click();
    await getDropdown(findSetting(container, "Cloze note type")).triggerChange("Custom Cloze");
    await getButton(findSetting(container, "Cloze fields")).click();

    const mainFieldDropdown = getDropdown(findSetting(container, "Cloze main field"));
    expect(mainFieldDropdown.value).toBe("Text");
  });

  it("removes the old folder textareas and hides the folder tree in all mode", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await flushAsync();

    expect(querySetting(container, "Include folders")).toBeUndefined();
    expect(querySetting(container, "Exclude folders")).toBeUndefined();
    expect(findSetting(container, "运行范围")).toBeDefined();
    expect(queryCheckboxByPath(container, "notes")).toBeUndefined();
  });

  it("shows the folder tree as a collapsed hierarchy and reveals children after expanding a parent", async () => {
    const plugin = new FakePlugin();
    plugin.settings = {
      ...plugin.settings,
      scopeMode: "include",
      includeFolders: ["notes/sub"],
    };
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await flushAsync();
    tab.display();

    const parentCheckbox = getCheckboxByPath(container, "notes");

    expect(parentCheckbox.checked).toBe(false);
    expect(parentCheckbox.indeterminate).toBe(true);
    expect(queryCheckboxByPath(container, "notes/sub")).toBeUndefined();

    await getFolderToggle(container, "notes").trigger("click");

    const childCheckbox = getCheckboxByPath(container, "notes/sub");
    const parentRow = getFolderRow(container, "notes");
    const childRow = getFolderRow(container, "notes/sub");

    expect(childCheckbox.checked).toBe(true);
    expect(parentRow.dataset.folderDepth).toBe("0");
    expect(childRow.dataset.folderDepth).toBe("1");
    expect(parentRow.style.paddingLeft).toBe("0px");
    expect(childRow.style.paddingLeft).toBe("18px");
    expect(container.textNodes).toContain("empty");
  });

  it("switches scope mode and saves compressed folder selections from the tree", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await flushAsync();
    await getDropdown(findSetting(container, "运行范围")).triggerChange("include");
    await flushAsync();

    const parentCheckbox = getCheckboxByPath(container, "notes");
    parentCheckbox.checked = true;
    await parentCheckbox.trigger("change");
    await flushAsync();

    expect(plugin.settings.includeFolders).toEqual(["notes"]);

    await getDropdown(findSetting(container, "运行范围")).triggerChange("all");
    await flushAsync();

    expect(queryCheckboxByPath(container, "notes")).toBeUndefined();
  });
});