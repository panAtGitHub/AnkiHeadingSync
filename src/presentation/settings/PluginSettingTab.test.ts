import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QA_GROUP_MODEL_NAME } from "@/application/config/ManagedNoteModels";
import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { DEFAULT_SETTINGS, normalizePluginSettings } from "@/application/config/PluginSettings";

const {
  FakeElement,
  FakePluginSettingTab,
  FakeSetting,
  getLanguageMock,
} = vi.hoisted(() => {
  const hoistedGetLanguage = vi.fn(() => "zh");

  class HoistedFakeElement {
    public readonly children: HoistedFakeElement[] = [];
    public readonly dataset: Record<string, string> = {};
    public readonly style: Record<string, string> = {};
    public readonly ownedSettings: HoistedFakeSetting[] = [];
    public checked = false;
    public indeterminate = false;
    public disabled = false;
    public type = "";
    public value = "";
    public text = "";
    public textContent = "";
    public scrollTop = 0;

    private readonly listeners = new Map<string, Array<() => void | Promise<void>>>();

    constructor(
      public readonly root: HoistedFakeContainerEl,
      public readonly tag: string,
      public readonly parent: HoistedFakeElement | null = null,
    ) {}

    createEl(tag: string, options?: { text?: string }): HoistedFakeElement {
      const child = new HoistedFakeElement(this.root, tag, this);
      if (options?.text) {
        child.text = options.text;
        child.textContent = options.text;
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

    empty(): void {
      this.removeOwnedSettingsRecursively();
      this.children.length = 0;
      this.text = "";
      this.textContent = "";
    }

    setAttr(name: string, value: string | number): this {
      (this as Record<string, unknown>)[name] = value;
      return this;
    }

    private removeOwnedSettingsRecursively(): void {
      if (this.ownedSettings.length > 0) {
        this.root.settings = this.root.settings.filter((setting) => !this.ownedSettings.includes(setting));
        this.ownedSettings.length = 0;
      }

      for (const child of this.children) {
        child.removeOwnedSettingsRecursively();
      }
    }
  }

  class HoistedFakeContainerEl extends HoistedFakeElement {
    public settings: HoistedFakeSetting[] = [];
    public emptyCallCount = 0;

    constructor() {
      super(undefined as never, "root", null);
      (this as { root: HoistedFakeContainerEl }).root = this;
    }

    override empty(): void {
      this.emptyCallCount += 1;
      super.empty();
      this.settings = [];
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

    constructor(containerEl: HoistedFakeElement) {
      containerEl.root.settings.push(this);
      containerEl.ownedSettings.push(this);
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
    FakePluginSettingTab: HoistedFakePluginSettingTab,
    FakeSetting: HoistedFakeSetting,
    getLanguageMock: hoistedGetLanguage,
  };
});

vi.mock("obsidian", () => ({
  getLanguage: getLanguageMock,
  PluginSettingTab: FakePluginSettingTab,
  Setting: FakeSetting,
}));

import { AnkiHeadingSyncSettingTab } from "./PluginSettingTab";

type FakeContainer = InstanceType<typeof FakePluginSettingTab>["containerEl"];
type FakeSettingInstance = InstanceType<typeof FakeSetting>;
type FakeToggleInstance = { triggerChange(value: boolean): Promise<void> };
type QueryRoot = FakeContainer | HTMLElement;

class FakePlugin {
  public readonly app = {};
  public readonly updateCalls: Array<Record<string, unknown>> = [];
  public listNoteModelsCalls = 0;
  public listFolderTreeCalls = 0;
  public insertDeckTemplateCalls = 0;
  public settings = normalizePluginSettings({
    ...DEFAULT_SETTINGS,
    qaNoteType: "Custom Basic",
    clozeNoteType: "Custom Cloze",
    cardTypeConfigs: {
      ...DEFAULT_SETTINGS.cardTypeConfigs,
      basic: {
        ...DEFAULT_SETTINGS.cardTypeConfigs.basic,
        noteType: "Custom Basic",
      },
      cloze: {
        ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
        noteType: "Custom Cloze",
      },
    },
    noteFieldMappings: {},
  });
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
  ];

  async updateSettings(partialSettings: Record<string, unknown>): Promise<void> {
    this.updateCalls.push(partialSettings);
    this.settings = normalizePluginSettings({
      ...this.settings,
      ...partialSettings,
      cardTypeConfigs: (partialSettings.cardTypeConfigs as typeof this.settings.cardTypeConfigs | undefined) ?? this.settings.cardTypeConfigs,
      noteFieldMappings: (partialSettings.noteFieldMappings as typeof this.settings.noteFieldMappings | undefined) ?? this.settings.noteFieldMappings,
    });
  }

  async listNoteModels(): Promise<string[]> {
    this.listNoteModelsCalls += 1;
    return ["Basic", "Custom Basic", "Cloze", "Custom Cloze", "Semantic QA", QA_GROUP_MODEL_NAME];
  }

  async getNoteModelDetails(modelName: string): Promise<{ fieldNames: string[]; isCloze: boolean }> {
    if (modelName.includes("Cloze")) {
      return {
        fieldNames: ["Text", "Extra", "Hint"],
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

  async listFolderTree(): Promise<typeof this.folderTree> {
    this.listFolderTreeCalls += 1;
    return this.folderTree;
  }

  async insertDeckTemplateToCurrentFile(): Promise<void> {
    this.insertDeckTemplateCalls += 1;
  }
}

function asFakeContainer(container: QueryRoot): FakeContainer {
  return container as unknown as FakeContainer;
}

function findElement(container: QueryRoot, predicate: (element: InstanceType<typeof FakeElement>) => boolean): InstanceType<typeof FakeElement> | undefined {
  const stack = [...asFakeContainer(container).children];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) {
      continue;
    }

    if (predicate(current)) {
      return current;
    }

    stack.unshift(...current.children);
  }

  return undefined;
}

function findElements(container: QueryRoot, predicate: (element: InstanceType<typeof FakeElement>) => boolean): InstanceType<typeof FakeElement>[] {
  const matches: InstanceType<typeof FakeElement>[] = [];
  const stack = [...asFakeContainer(container).children];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) {
      continue;
    }

    if (predicate(current)) {
      matches.push(current);
    }

    stack.unshift(...current.children);
  }

  return matches;
}

function queryByDataset(container: QueryRoot, key: string, value: string): InstanceType<typeof FakeElement> {
  const element = findElement(container, (candidate) => candidate.dataset[key] === value);
  if (!element) {
    throw new Error(`Element not found for data-${key}=${value}`);
  }
  return element;
}

function queryAllByDataset(container: QueryRoot, key: string): InstanceType<typeof FakeElement>[] {
  return findElements(container, (candidate) => key in candidate.dataset);
}

function findSetting(container: QueryRoot, name: string): FakeSettingInstance {
  const setting = asFakeContainer(container).settings.find((candidate) => candidate.name === name);
  if (!setting) {
    throw new Error(`Setting not found: ${name}`);
  }
  return setting;
}

function getToggle(setting: FakeSettingInstance): FakeToggleInstance {
  const toggle = setting.controls.find((control) => typeof control === "object" && control !== null && "triggerChange" in control && "value" in control && typeof (control as { value?: unknown }).value === "boolean");
  if (!toggle) {
    throw new Error(`Toggle not found for setting: ${setting.name}`);
  }
  return toggle as FakeToggleInstance;
}

function collectTexts(container: QueryRoot): string[] {
  return findElements(container, () => true)
    .map((element) => element.textContent || element.text)
    .filter((text): text is string => Boolean(text));
}

function getEmptyCallCount(container: QueryRoot): number {
  return asFakeContainer(container).emptyCallCount;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PluginSettingTab", () => {
  beforeEach(() => {
    getLanguageMock.mockReturnValue("zh");
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders five cards with the required default expansion state", () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    const cards = queryAllByDataset(tab.containerEl, "settingsCard");
    expect(cards).toHaveLength(5);
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "card-types").style.display).toBe("block");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "commands").style.display).toBe("block");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "sync-content").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "scope").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "deck").style.display).toBe("none");
  });

  it("renders card 1 table with four rows and the required columns", () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    const headerTexts = findElements(tab.containerEl, (element) => element.tag === "th").map((element) => element.textContent);
    expect(headerTexts).toEqual(["启用", "卡片类型", "卡片标记", "额外标记", "Anki 笔记模板", "问题字段", "答案字段"]);

    const rowLabels = findElements(tab.containerEl, (element) => element.dataset.cardTypeConfig !== undefined).map((row) => row.children[1]?.textContent);
    expect(rowLabels).toEqual([
      "问答题（常规段落形式）",
      "问答题（多级列表形式）",
      "填空题",
      "语义问答题",
    ]);
  });

  it("auto saves toggle, heading, note type and field mapping edits", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await queryByDataset(tab.containerEl, "cardTypesRefresh", "true").trigger("click");
    await flushPromises();

    const basicToggle = queryByDataset(tab.containerEl, "cardTypeEnabled", "basic");
    basicToggle.checked = false;
    await basicToggle.trigger("change");
    expect(plugin.settings.cardTypeConfigs.basic.enabled).toBe(false);

    const clozeHeading = queryByDataset(tab.containerEl, "cardTypeHeading", "cloze");
    clozeHeading.value = "6";
    await clozeHeading.trigger("change");
    expect(plugin.settings.cardTypeConfigs.cloze.headingLevel).toBe(6);

    const basicNoteType = queryByDataset(tab.containerEl, "cardTypeNoteType", "basic");
    basicNoteType.value = "Basic";
    await basicNoteType.trigger("change");
    expect(plugin.settings.cardTypeConfigs.basic.noteType).toBe("Basic");

    await flushPromises();
    const basicQuestionField = queryByDataset(tab.containerEl, "cardTypeQuestionField", "basic");
    basicQuestionField.value = "Hint";
    await basicQuestionField.trigger("change");
    const basicAnswerField = queryByDataset(tab.containerEl, "cardTypeAnswerField", "basic");
    basicAnswerField.value = "Body";
    await basicAnswerField.trigger("change");

    expect(plugin.settings.noteFieldMappings[createNoteFieldMappingKey("basic", plugin.settings.cardTypeConfigs.basic.noteType)]).toEqual(expect.objectContaining({
      titleField: "Hint",
      bodyField: "Body",
    }));
  });

  it("debounces text input saves instead of saving every keystroke", async () => {
    vi.useFakeTimers();
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    const markerInput = queryByDataset(tab.containerEl, "cardTypeMarker", "semantic-qa");
    markerInput.value = "#semantic-a";
    await markerInput.trigger("input");
    markerInput.value = "#semantic-ab";
    await markerInput.trigger("input");

    expect(plugin.updateCalls).toHaveLength(0);

    vi.advanceTimersByTime(499);
    await flushPromises();
    expect(plugin.updateCalls).toHaveLength(0);

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(plugin.settings.cardTypeConfigs["semantic-qa"].extraMarker).toBe("#semantic-ab");
    expect(plugin.updateCalls).toHaveLength(1);
  });

  it("blocks conflicting default rows and shows the error in card 1", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    const clozeHeading = queryByDataset(tab.containerEl, "cardTypeHeading", "cloze");
    clozeHeading.value = "4";
    await clozeHeading.trigger("change");

    expect(plugin.settings.cardTypeConfigs.cloze.headingLevel).toBe(5);
    expect(collectTexts(tab.containerEl).some((text) => text.includes("同一个 H4 只能有一个启用的默认卡片类型"))).toBe(true);
  });

  it("expanding and collapsing cards does not rebuild the whole settings page", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    const initialEmptyCount = getEmptyCallCount(tab.containerEl);

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);
  });

  it("loading Anki config refreshes only card 1 instead of rebuilding the whole page", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    const initialEmptyCount = getEmptyCallCount(tab.containerEl);

    await queryByDataset(tab.containerEl, "cardTypesRefresh", "true").trigger("click");
    await flushPromises();

    expect(plugin.listNoteModelsCalls).toBe(1);
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);
  });

  it("folder tree expand and check refresh only the scope card", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      scopeMode: "include",
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    const initialEmptyCount = getEmptyCallCount(tab.containerEl);

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    await flushPromises();
    expect(plugin.listFolderTreeCalls).toBe(1);
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);

    await queryByDataset(tab.containerEl, "folderToggle", "notes").trigger("click");
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);

    const childCheckbox = queryByDataset(tab.containerEl, "folderPath", "notes/sub");
    childCheckbox.checked = true;
    await childCheckbox.trigger("change");
    expect(plugin.settings.includeFolders).toContain("notes/sub");
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);
  });

  it("toggling file deck mode refreshes only the deck card", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    const initialEmptyCount = getEmptyCallCount(tab.containerEl);

    await queryByDataset(tab.containerEl, "settingsCardToggle", "deck").trigger("click");
    const fileDeckSetting = findSetting(tab.containerEl, "开启文件级自定义牌组");
    await getToggle(fileDeckSetting).triggerChange(true);

    expect(plugin.settings.fileDeckEnabled).toBe(true);
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);
  });
});