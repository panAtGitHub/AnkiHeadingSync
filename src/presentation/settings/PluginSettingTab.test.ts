import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { DEFAULT_SETTINGS } from "@/application/config/PluginSettings";
import { QA_GROUP_MODEL_NAME } from "@/application/services/QaGroupModelDefinition";

const {
  FakeButtonComponent,
  FakeDropdownComponent,
  FakeElement,
  getLanguageMock,
  FakePluginSettingTab,
  FakeSetting,
} = vi.hoisted(() => {
  const hoistedGetLanguage = vi.fn(() => "en");

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
    private onChangeHandler?: (value: string) => void | Promise<void>;

    setPlaceholder(value: string): this {
      void value;
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

    hide(): void {
      return;
    }
  }

  return {
    FakeButtonComponent: HoistedFakeButtonComponent,
    FakeDropdownComponent: HoistedFakeDropdownComponent,
    FakeElement: HoistedFakeElement,
    getLanguageMock: hoistedGetLanguage,
    FakePluginSettingTab: HoistedFakePluginSettingTab,
    FakeSetting: HoistedFakeSetting,
  };
});

vi.mock("obsidian", () => ({
  getLanguage: getLanguageMock,
  PluginSettingTab: FakePluginSettingTab,
  Setting: FakeSetting,
}));

import { AnkiHeadingSyncSettingTab } from "./PluginSettingTab";

type FakeContainerElInstance = InstanceType<typeof FakePluginSettingTab>["containerEl"];
type FakeSettingInstance = InstanceType<typeof FakeSetting>;
type FakeButtonComponentInstance = InstanceType<typeof FakeButtonComponent>;
type FakeDropdownComponentInstance = InstanceType<typeof FakeDropdownComponent>;
type FakeElementInstance = InstanceType<typeof FakeElement>;
type FakeTextComponentInstance = {
  value: string;
  triggerChange(value: string): Promise<void>;
};
type FakeToggleComponentInstance = {
  value: boolean;
  triggerChange(value: boolean): Promise<void>;
};

class FakePlugin {
  public readonly app = {};
  public listFolderTreeCalls = 0;
  public insertDeckTemplateCalls = 0;
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
    return ["Basic", "Cloze", "Custom Basic", "Custom Cloze", "Semantic QA", QA_GROUP_MODEL_NAME];
  }

  async getNoteModelDetails(modelName: string) {
    if (modelName === "Custom Cloze") {
      return {
        fieldNames: ["Text", "Extra", "Context"],
        isCloze: true,
      };
    }

    if (modelName === "Semantic QA") {
      return {
        fieldNames: ["Title", "Body", "Source"],
        isCloze: false,
      };
    }

    return {
      fieldNames: ["Title", "Body", "Hint"],
      isCloze: false,
    };
  }

  async listFolderTree() {
    this.listFolderTreeCalls += 1;
    return this.folderTree;
  }

  async insertDeckTemplateToCurrentFile(): Promise<void> {
    this.insertDeckTemplateCalls += 1;
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

function getText(setting: FakeSettingInstance): FakeTextComponentInstance {
  const text = setting.controls.find((control: unknown) => typeof control === "object" && control !== null && "triggerChange" in (control as Record<string, unknown>) && "value" in (control as Record<string, unknown>) && !(control instanceof FakeDropdownComponent) && !(control instanceof FakeButtonComponent));

  if (!text) {
    throw new Error(`Text control not found for setting: ${setting.name}`);
  }

  return text as FakeTextComponentInstance;
}

function getToggle(setting: FakeSettingInstance): FakeToggleComponentInstance {
  const toggle = setting.controls.find((control: unknown) => typeof control === "object" && control !== null && "triggerChange" in (control as Record<string, unknown>) && "value" in (control as Record<string, unknown>) && !(control instanceof FakeDropdownComponent) && !(control instanceof FakeButtonComponent) && typeof (control as { value?: unknown }).value === "boolean");

  if (!toggle) {
    throw new Error(`Toggle not found for setting: ${setting.name}`);
  }

  return toggle as FakeToggleComponentInstance;
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
    getLanguageMock.mockReset();
    getLanguageMock.mockReturnValue("en");
  });

  it("renders key settings labels, descriptions, and aria text in English", async () => {
    const plugin = new FakePlugin();
    plugin.settings = {
      ...plugin.settings,
      scopeMode: "include",
    };
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    expect(container.textNodes).toContain("Anki Heading Sync");
    expect(findSetting(container, "AnkiConnect URL").desc).toBe("Default is http://127.0.0.1:8765");
    expect(findSetting(container, "Card answer cutoff mode").desc).toBe("A valid sync marker always wins. Without a valid marker, either keep the whole heading block or stop before the first 2+ consecutive blank lines.");
    expect(findSetting(container, "Obsidian backlink label").desc).toBe("The text shown for the backlink. Blank input falls back to Open in Obsidian.");
    expect(findSetting(container, "Obsidian backlink placement").desc).toBe("Choose whether the backlink is appended to the question field or placed at the start or end of the answer body.");
    expect(findSetting(container, "Sync Obsidian tags to Anki").desc).toBe("Sync Obsidian-recognized tags from the current note into Anki note tags, including nested tags. On each sync, these tags overwrite the managed tags in Anki based on the current Obsidian content.");
    expect(findSetting(container, "Keep pure tag lines in card body").desc).toBe("When turned off, remove every line in the card body that contains only tags, such as \"#ProjectA #重点/案例\". Inline tags like \"This is a #tag example\" and lines with ordinary text like \"标签：#项目A\" are kept. Extra blank lines created by removal are cleaned up automatically.");
    expect(findSetting(container, "Run scope").desc).toBe("Only process Markdown files in the checked folders below");

    await flushAsync();
    tab.display();

    const toggle = getFolderToggle(container, "notes");
    expect((toggle as unknown as { [key: string]: string })["aria-label"]).toBe("Expand notes");

    await toggle.trigger("click");
    expect((getFolderToggle(container, "notes") as unknown as { [key: string]: string })["aria-label"]).toBe("Collapse notes");
  });

  it("renders key settings labels, descriptions, and aria text in Simplified Chinese", async () => {
    getLanguageMock.mockReturnValue("zh");
    const plugin = new FakePlugin();
    plugin.settings = {
      ...plugin.settings,
      scopeMode: "include",
    };
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    expect(findSetting(container, "QA 标题层级").desc).toBe("默认是 H4");
    expect(findSetting(container, "卡片正文截止模式").desc).toBe("有效同步标记始终优先。没有有效标记时，选择继续到整个标题块末尾，或在首个 2+ 连续空行前截止。");
    expect(findSetting(container, "Obsidian 回链显示名称").desc).toBe("设置回链显示的文字。留空或只填空格时会回退为 Open in Obsidian。");
    expect(findSetting(container, "Obsidian 回链放置位置").desc).toBe("选择把回链追加到问题栏最后一行，或放到答案正文的第一行 / 最后一行。");
    expect(findSetting(container, "同步 Obsidian 标签到 Anki").desc).toBe("将当前笔记中 Obsidian 识别到的标签同步为 Anki 笔记标签，支持嵌套标签。每次同步时，这些标签都会以当前 Obsidian 内容为准覆盖 Anki。");
    expect(findSetting(container, "在卡片正文中保留纯标签行").desc).toBe("关闭后，会删除正文中所有只包含标签的整行，例如 “#项目A #重点/案例”。像“这是 #标签 的案例”这类行内标签，或“标签：#项目A”这类带普通文字的行，不会被删除。删除后会自动清理多余空行。");
    expect(findSetting(container, "运行范围").desc).toBe("仅处理下方勾选文件夹中的 Markdown 文件");
    expect(findSetting(container, "默认牌组").desc).toBe("优先级最低：当文件级 deck 与文件夹映射都未命中时使用。");

    await flushAsync();
    tab.display();

    const toggle = getFolderToggle(container, "notes");
    expect((toggle as unknown as { [key: string]: string })["aria-label"]).toBe("展开 notes");

    await toggle.trigger("click");
    expect((getFolderToggle(container, "notes") as unknown as { [key: string]: string })["aria-label"]).toBe("收起 notes");
  });

  it("refreshes note type list from Anki into the dropdowns", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await getButton(findSetting(container, "Refresh note types from Anki")).click();

    const refreshSetting = findSetting(container, "Refresh note types from Anki");
    const dropdown = getDropdown(findSetting(container, "QA / Basic note type"));
    expect(dropdown.options.map((option: { value: string }) => option.value)).toEqual(["Basic", "Cloze", "Custom Basic", "Custom Cloze", QA_GROUP_MODEL_NAME, "Semantic QA"]);
    expect(refreshSetting.desc).toBe("Loaded 6 note types from Anki.");
  });

  it("uses the same total note type count for status text and dropdown options", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await getButton(findSetting(container, "Refresh note types from Anki")).click();

    const refreshSetting = findSetting(container, "Refresh note types from Anki");
    const basicDropdown = getDropdown(findSetting(container, "QA / Basic note type"));
    const clozeDropdown = getDropdown(findSetting(container, "Cloze note type"));
    const semanticDropdown = getDropdown(findSetting(container, "Semantic QA note type"));

    expect(refreshSetting.desc).toBe(`Loaded ${basicDropdown.options.length} note types from Anki.`);
    expect(clozeDropdown.options).toHaveLength(basicDropdown.options.length);
    expect(semanticDropdown.options).toHaveLength(basicDropdown.options.length);
  });

  it("shows QA Group model status and includes it in the field mapping dropdowns", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();

    expect(container.textNodes).toContain(`Managed note type: ${QA_GROUP_MODEL_NAME}. QA Group sync writes Stem / GroupId / Src / S01..S12 directly. The same note type can also appear in the field mapping panels below if you want to reuse it for other routes.`);
    expect(container.textNodes).toContain("Managed model contract: 39 fields and 12 templates are checked automatically during sync.");

    await getButton(findSetting(container, "Refresh note types from Anki")).click();

    const semanticDropdown = getDropdown(findSetting(container, "Semantic QA note type"));
    expect(semanticDropdown.options.map((option: { value: string }) => option.value)).toContain(QA_GROUP_MODEL_NAME);
  });

  it("allows selecting the QA Group model inside semantic QA mapping controls", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await getButton(findSetting(container, "Refresh note types from Anki")).click();
    await getDropdown(findSetting(container, "Semantic QA note type")).triggerChange(QA_GROUP_MODEL_NAME);

    expect(plugin.settings.semanticQaNoteType).toBe(QA_GROUP_MODEL_NAME);
    expect(container.textNodes).toContain("Selected ObsiAnki QA Group 12. Read fields from Anki to create or refresh its mapping.");
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

  it("shows semantic QA preview and saves a semantic QA mapping", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();

    expect(container.textNodes).toContain("Trigger heading example: 城市更新 #anki-list-qa");
    expect(container.textNodes).toContain("Question preview: 城市更新<br>核心产品");
    expect(container.textNodes).toContain("Answer preview: 百人会、城市更新研习社、城市更新创投营。");

    await getText(findSetting(container, "Semantic QA marker")).triggerChange("#semantic-qa");
    await getButton(findSetting(container, "Refresh note types from Anki")).click();
    await getButton(findSetting(container, "Semantic QA fields")).click();

    const titleDropdown = getDropdown(findSetting(container, "Semantic QA title field"));
    const bodyDropdown = getDropdown(findSetting(container, "Semantic QA body field"));

    expect(titleDropdown.value).toBe("Title");
    expect(bodyDropdown.value).toBe("Body");

    await bodyDropdown.triggerChange("Source");
    await getButton(findSetting(container, "Semantic QA mapping")).click();

    expect(plugin.settings.semanticQaMarker).toBe("#semantic-qa");
    expect(plugin.settings.noteFieldMappings).toEqual(expect.objectContaining({
      [createNoteFieldMappingKey("semantic-qa", "Semantic QA")]: {
        cardType: "semantic-qa",
        modelName: "Semantic QA",
        loadedFieldNames: ["Title", "Body", "Source"],
        titleField: "Title",
        bodyField: "Source",
        loadedAt: expect.any(Number),
      },
    }));
    expect(container.textNodes).toContain("Saved mapping for Semantic QA.");
    expect(container.textNodes).toContain("Trigger heading example: 城市更新 #semantic-qa");
  });

  it("saves the QA Group marker independently from the semantic QA marker", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await getText(findSetting(container, "QA Group marker")).triggerChange("#anki-list-12");

    expect(plugin.settings.qaGroupMarker).toBe("#anki-list-12");
    expect(plugin.settings.semanticQaMarker).toBe("#anki-list-qa");
  });

  it("saves and rehydrates the card answer cutoff mode", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();

    const cutoffDropdown = getDropdown(findSetting(container, "Card answer cutoff mode"));
    expect(cutoffDropdown.value).toBe("heading-block");
    expect(cutoffDropdown.options.map((option: { value: string }) => option.value)).toEqual(["heading-block", "double-blank-lines"]);

    await cutoffDropdown.triggerChange("double-blank-lines");
    expect(plugin.settings.cardAnswerCutoffMode).toBe("double-blank-lines");

    tab.display();
    expect(getDropdown(findSetting(container, "Card answer cutoff mode")).value).toBe("double-blank-lines");
  });

  it("saves and rehydrates the new sync option toggles", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();

    const syncTagsToggle = getToggle(findSetting(container, "Sync Obsidian tags to Anki"));
    const keepPureTagLinesToggle = getToggle(findSetting(container, "Keep pure tag lines in card body"));

    expect(syncTagsToggle.value).toBe(true);
    expect(keepPureTagLinesToggle.value).toBe(true);

    await syncTagsToggle.triggerChange(false);
    await keepPureTagLinesToggle.triggerChange(false);

    expect(plugin.settings.syncObsidianTagsToAnki).toBe(false);
    expect(plugin.settings.keepPureTagLinesInCardBody).toBe(false);

    tab.display();

    expect(getToggle(findSetting(container, "Sync Obsidian tags to Anki")).value).toBe(false);
    expect(getToggle(findSetting(container, "Keep pure tag lines in card body")).value).toBe(false);
  });

  it("trims the backlink label on save and falls back to the default label when blank", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();

    const labelInput = getText(findSetting(container, "Obsidian backlink label"));
    expect(labelInput.value).toBe("Open in Obsidian");

    await labelInput.triggerChange("  Open note  ");
    expect(plugin.settings.obsidianBacklinkLabel).toBe("Open note");

    await labelInput.triggerChange("   ");
    expect(plugin.settings.obsidianBacklinkLabel).toBe("Open in Obsidian");
  });

  it("saves and rehydrates the backlink placement dropdown", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();

    const placementDropdown = getDropdown(findSetting(container, "Obsidian backlink placement"));
    expect(placementDropdown.value).toBe("answer-last-line");
    expect(placementDropdown.options.map((option: { value: string }) => option.value)).toEqual([
      "question-last-line",
      "answer-first-line",
      "answer-last-line",
    ]);

    await placementDropdown.triggerChange("question-last-line");
    expect(plugin.settings.obsidianBacklinkPlacement).toBe("question-last-line");

    tab.display();
    expect(getDropdown(findSetting(container, "Obsidian backlink placement")).value).toBe("question-last-line");
  });

  it("removes the old folder textareas and hides the folder tree in all mode", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await flushAsync();

    expect(querySetting(container, "Include folders")).toBeUndefined();
    expect(querySetting(container, "Exclude folders")).toBeUndefined();
    expect(findSetting(container, "Run scope")).toBeDefined();
    expect(queryCheckboxByPath(container, "notes")).toBeUndefined();
  });

  it("loads the current folder tree when the settings page first opens", async () => {
    const plugin = new FakePlugin();
    plugin.settings = {
      ...plugin.settings,
      scopeMode: "include",
    };
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await flushAsync();
    tab.display();

    expect(plugin.listFolderTreeCalls).toBe(1);
    expect(getCheckboxByPath(tab.containerEl as unknown as FakeContainerElInstance, "notes")).toBeDefined();
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

  it("reloads folder tree after the settings tab is reopened and shows newly created folders", async () => {
    const plugin = new FakePlugin();
    plugin.settings = {
      ...plugin.settings,
      scopeMode: "include",
    };
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await flushAsync();
    tab.display();

    expect(plugin.listFolderTreeCalls).toBe(1);
    expect(queryCheckboxByPath(container, "notes/new-folder")).toBeUndefined();

    plugin.folderTree = [
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
          {
            path: "notes/new-folder",
            name: "new-folder",
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

    tab.hide();
    tab.display();
    await flushAsync();
    tab.display();

    expect(plugin.listFolderTreeCalls).toBe(2);

    await getFolderToggle(container, "notes").trigger("click");

    const newFolderCheckbox = getCheckboxByPath(container, "notes/new-folder");
    const newFolderRow = getFolderRow(container, "notes/new-folder");

    expect(newFolderCheckbox.checked).toBe(false);
    expect(newFolderRow.dataset.folderDepth).toBe("1");
    expect(newFolderRow.style.paddingLeft).toBe("18px");
  });

  it("keeps existing folder selections after reloading the folder tree on reopen", async () => {
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
    await getFolderToggle(container, "notes").trigger("click");

    expect(getCheckboxByPath(container, "notes/sub").checked).toBe(true);
    expect(getCheckboxByPath(container, "notes").indeterminate).toBe(true);

    plugin.folderTree = [
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
          {
            path: "notes/new-folder",
            name: "new-folder",
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

    tab.hide();
    tab.display();
    await flushAsync();
    tab.display();
    await getFolderToggle(container, "notes").trigger("click");

    expect(plugin.settings.includeFolders).toEqual(["notes/sub"]);
    expect(getCheckboxByPath(container, "notes/sub").checked).toBe(true);
    expect(getCheckboxByPath(container, "notes").indeterminate).toBe(true);
    expect(getCheckboxByPath(container, "notes/new-folder").checked).toBe(false);
  });

  it("switches scope mode and saves compressed folder selections from the tree", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await flushAsync();
    await getDropdown(findSetting(container, "Run scope")).triggerChange("include");
    await flushAsync();

    const parentCheckbox = getCheckboxByPath(container, "notes");
    parentCheckbox.checked = true;
    await parentCheckbox.trigger("change");
    await flushAsync();

    expect(plugin.settings.includeFolders).toEqual(["notes"]);

    await getDropdown(findSetting(container, "Run scope")).triggerChange("all");
    await flushAsync();

    expect(queryCheckboxByPath(container, "notes")).toBeUndefined();
  });

  it("saves and rehydrates module 5 deck settings", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();

    expect(container.textNodes).toContain("Default deck");
    expect(container.textNodes).toContain("File-level custom deck");
    expect(container.textNodes).toContain("Advanced: folder mapping");
    expect(container.textNodes).toContain("Final priority");

    await getToggle(findSetting(container, "Enable file-level custom deck")).triggerChange(true);
    await flushAsync();

    await getText(findSetting(container, "Deck marker name")).triggerChange("MY DECK");
    await getText(findSetting(container, "Default deck template")).triggerChange("vault::filename");
    await getDropdown(findSetting(container, "Template insert location")).triggerChange("yaml");
    await getDropdown(findSetting(container, "Folder mapping mode")).triggerChange("folder-and-file");
    await getText(findSetting(container, "Default deck")).triggerChange("Deck::Default");
    await flushAsync();

    expect(plugin.settings.fileDeckEnabled).toBe(true);
    expect(plugin.settings.fileDeckMarker).toBe("MY DECK");
    expect(plugin.settings.fileDeckTemplate).toBe("vault::filename");
    expect(plugin.settings.fileDeckInsertLocation).toBe("yaml");
    expect(plugin.settings.folderDeckMode).toBe("folder-and-file");
    expect(plugin.settings.defaultDeck).toBe("Deck::Default");

    tab.display();

    expect(getToggle(findSetting(container, "Enable file-level custom deck")).value).toBe(true);
    expect(getText(findSetting(container, "Deck marker name")).value).toBe("MY DECK");
    expect(getText(findSetting(container, "Default deck template")).value).toBe("vault::filename");
    expect(getDropdown(findSetting(container, "Template insert location")).value).toBe("yaml");
    expect(getDropdown(findSetting(container, "Folder mapping mode")).value).toBe("folder-and-file");
    expect(getText(findSetting(container, "Default deck")).value).toBe("Deck::Default");
  });

  it("exposes the deck template insertion action when file deck mode is enabled", async () => {
    const plugin = new FakePlugin();
    plugin.settings = {
      ...plugin.settings,
      fileDeckEnabled: true,
    };
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);
    const container = tab.containerEl as unknown as FakeContainerElInstance;

    tab.display();
    await getButton(findSetting(container, "Insert deck template into the current file")).click();

    expect(plugin.insertDeckTemplateCalls).toBe(1);
  });
});
