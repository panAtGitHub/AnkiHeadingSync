import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { DEFAULT_SETTINGS, normalizePluginSettings } from "@/application/config/PluginSettings";

const QA_GROUP_USER_MODEL_NAME = "问答题（多级列表）";

const {
  FakeElement,
  FakePluginSettingTab,
  FakeSetting,
  FakeResizeObserver,
  getLanguageMock,
  getResizeObserverInstances,
  resetResizeObserverInstances,
} = vi.hoisted(() => {
  const hoistedGetLanguage = vi.fn(() => "zh");
  const hoistedResizeObserverInstances: HoistedFakeResizeObserver[] = [];

  class HoistedFakeStyle {
    [key: string]: unknown;

    setProperty(name: string, value: string): void {
      this[name] = value;
    }

    getPropertyValue(name: string): string {
      const value = this[name];
      return typeof value === "string" ? value : "";
    }

    removeProperty(name: string): string {
      const value = this.getPropertyValue(name);
      delete this[name];
      return value;
    }
  }

  class HoistedFakeElement {
    public readonly children: HoistedFakeElement[] = [];
    public readonly dataset: Record<string, string> = {};
    public readonly style = new HoistedFakeStyle();
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
    private rectHeight = 0;

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

    setBoundingClientRect(rect: { height?: number }): void {
      if (typeof rect.height === "number") {
        this.rectHeight = rect.height;
      }
    }

    getBoundingClientRect(): DOMRect {
      return {
        bottom: this.rectHeight,
        height: this.rectHeight,
        left: 0,
        right: 0,
        toJSON: () => ({}),
        top: 0,
        width: 0,
        x: 0,
        y: 0,
      } as DOMRect;
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

  class HoistedFakeResizeObserver {
    public readonly observedElements: HoistedFakeElement[] = [];
    public disconnected = false;

    constructor(
      private readonly callback: (
        entries: Array<{ target: HoistedFakeElement }>,
        observer: HoistedFakeResizeObserver,
      ) => void,
    ) {
      hoistedResizeObserverInstances.push(this);
    }

    observe(target: HoistedFakeElement): void {
      this.observedElements.push(target);
    }

    disconnect(): void {
      this.disconnected = true;
    }

    trigger(): void {
      this.callback(this.observedElements.map((target) => ({ target })), this);
    }
  }

  return {
    FakeButtonComponent: HoistedFakeButtonComponent,
    FakeDropdownComponent: HoistedFakeDropdownComponent,
    FakeElement: HoistedFakeElement,
    FakePluginSettingTab: HoistedFakePluginSettingTab,
    FakeResizeObserver: HoistedFakeResizeObserver,
    FakeSetting: HoistedFakeSetting,
    getLanguageMock: hoistedGetLanguage,
    getResizeObserverInstances: () => hoistedResizeObserverInstances,
    resetResizeObserverInstances: () => {
      hoistedResizeObserverInstances.length = 0;
    },
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
type FakeElementInstance = InstanceType<typeof FakeElement>;
type QueryRoot = FakeContainer | FakeElementInstance | HTMLElement;

class FakePlugin {
  public readonly app = {};
  public readonly updateCalls: Array<Record<string, unknown>> = [];
  public readonly fieldNamesByModelName: Record<string, string[]> = {};
  public listNoteModelsCalls = 0;
  public getModelFieldNamesByModelNamesCalls = 0;
  public getNoteModelDetailsCalls = 0;
  public listFolderTreeCalls = 0;
  public insertDeckTemplateCalls = 0;
  public listNoteModelsError: Error | null = null;
  public noteModels = ["Basic", "Custom Basic", "Cloze", "Custom Cloze", "Semantic QA", QA_GROUP_USER_MODEL_NAME];
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
    if (this.listNoteModelsError) {
      throw this.listNoteModelsError;
    }

    return [...this.noteModels];
  }

  async getModelFieldNamesByModelNames(modelNames: string[]): Promise<Record<string, string[]>> {
    this.getModelFieldNamesByModelNamesCalls += 1;

    return modelNames.reduce<Record<string, string[]>>((fieldNamesByModelName, modelName) => {
      fieldNamesByModelName[modelName] = this.getFieldNamesForModel(modelName);
      return fieldNamesByModelName;
    }, {});
  }

  async getNoteModelDetails(modelName: string): Promise<{ fieldNames: string[]; isCloze: boolean }> {
    this.getNoteModelDetailsCalls += 1;
    return {
      fieldNames: this.getFieldNamesForModel(modelName),
      isCloze: modelName.includes("Cloze"),
    };
  }

  async listFolderTree(): Promise<typeof this.folderTree> {
    this.listFolderTreeCalls += 1;
    return this.folderTree;
  }

  async insertDeckTemplateToCurrentFile(): Promise<void> {
    this.insertDeckTemplateCalls += 1;
  }

  private getFieldNamesForModel(modelName: string): string[] {
    if (this.fieldNamesByModelName[modelName]) {
      return this.fieldNamesByModelName[modelName];
    }

    if (modelName.includes("Cloze")) {
      return ["Text", "Extra", "Hint"];
    }

    if (modelName === "Semantic QA") {
      return ["Title", "Body", "Source"];
    }

    if (modelName === "Basic") {
      return ["Front", "Back", "Extra"];
    }

    if (modelName === QA_GROUP_USER_MODEL_NAME) {
      return ["题目", "标题", "问题01", "答案01", "问题02", "答案02"];
    }

    return ["Title", "Body", "Hint"];
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

function collectOptionValues(selectEl: FakeElementInstance): string[] {
  return selectEl.children
    .filter((element) => element.tag === "option")
    .map((element) => element.value);
}

function getStyleProperty(element: { style: { getPropertyValue?: (name: string) => string } }, property: string): string {
  const style = element.style as { getPropertyValue?: (name: string) => string; [key: string]: unknown };

  if (typeof style.getPropertyValue === "function") {
    return style.getPropertyValue(property);
  }

  const value = style[property];
  return typeof value === "string" ? value : "";
}

function getEmptyCallCount(container: QueryRoot): number {
  return asFakeContainer(container).emptyCallCount;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function expandCard(tab: AnkiHeadingSyncSettingTab, cardId: string): Promise<void> {
  if (queryByDataset(tab.containerEl, "settingsCardBody", cardId).style.display === "block") {
    return;
  }

  await queryByDataset(tab.containerEl, "settingsCardToggle", cardId).trigger("click");
}

describe("PluginSettingTab", () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    getLanguageMock.mockReturnValue("zh");
    vi.useRealTimers();
    resetResizeObserverInstances();
    Reflect.set(globalThis, "ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (typeof originalResizeObserver === "undefined") {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
      return;
    }

    Reflect.set(globalThis, "ResizeObserver", originalResizeObserver);
  });

  it("renders five cards collapsed by default", () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    expect(queryByDataset(tab.containerEl, "settingsPageHeader", "true")).toBeDefined();
    const cards = queryAllByDataset(tab.containerEl, "settingsCard");
    expect(cards).toHaveLength(5);
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "sync-content").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "card-types").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "commands").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "scope").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "deck").style.display).toBe("none");

    for (const cardId of ["card-types", "sync-content", "scope", "deck", "commands"] as const) {
      expect(queryByDataset(tab.containerEl, "settingsCardToggle", cardId).textContent.startsWith("▸ ")).toBe(true);
    }
  });

  it("expands only the clicked card while others remain collapsed", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");

    expect(queryByDataset(tab.containerEl, "settingsCardBody", "scope").style.display).toBe("block");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "card-types").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "sync-content").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "deck").style.display).toBe("none");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "commands").style.display).toBe("none");

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");

    expect(queryByDataset(tab.containerEl, "settingsCardBody", "scope").style.display).toBe("none");
  });

  it("applies sticky styles to the opaque page header gap, mask, and card headers", () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    const pageHeader = queryByDataset(tab.containerEl, "settingsPageHeader", "true");
    const pageHeaderMask = queryByDataset(pageHeader, "settingsPageHeaderMask", "true");
    expect(pageHeader.style.position).toBe("sticky");
    expect(pageHeader.style.top).toBe("0px");
    expect(pageHeader.style.zIndex).toBe("300");
    expect(pageHeader.style.width).toBe("100%");
    expect(pageHeader.style.boxSizing).toBe("border-box");
    expect(pageHeader.style.marginBottom).toBe("0");
    expect(pageHeader.style.paddingBottom).toBe("calc(12px + var(--ahs-settings-sticky-card-gap, 8px))");
    expect(pageHeader.style.backgroundColor).toBe("var(--modal-background, var(--background-primary))");
    expect(pageHeader.style.boxShadow).toBe("none");
    expect(collectTexts(pageHeader)).toContain("Anki Heading Sync");

    expect(pageHeaderMask.style.position).toBe("absolute");
    expect(pageHeaderMask.style.top).toBe("-128px");
    expect(pageHeaderMask.style.left).toBe("-24px");
    expect(pageHeaderMask.style.right).toBe("-24px");
    expect(pageHeaderMask.style.bottom).toBe("0px");
    expect(pageHeaderMask.style.backgroundColor).toBe("var(--modal-background, var(--background-primary))");

    expect(getStyleProperty(tab.containerEl, "--ahs-settings-page-header-height")).toBe("64px");
    expect(getStyleProperty(tab.containerEl, "--ahs-settings-sticky-card-gap")).toBe("8px");

    for (const cardId of ["card-types", "sync-content", "scope", "deck", "commands"] as const) {
      const header = queryByDataset(tab.containerEl, "settingsCardToggle", cardId);
      expect(header.style.position).toBe("sticky");
      expect(header.style.top).toBe("var(--ahs-settings-page-header-height, 64px)");
      expect(header.style.zIndex).toBe("200");
      expect(header.style.display).toBe("flex");
      expect(header.style.width).toBe("100%");
      expect(header.style.backgroundColor).toBe("var(--modal-background, var(--background-primary))");
      expect(header.style.fontSize).toBe("1.5em");
      expect(header.style.fontWeight).toBe("600");
      expect(header.style.border).toBe("2px solid var(--background-modifier-border)");
      expect(header.style.boxShadow).toBe("none");
    }
  });

  it("updates the page header height variable from ResizeObserver and disconnects it on hide", () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    const pageHeader = queryByDataset(tab.containerEl, "settingsPageHeader", "true");
    pageHeader.setBoundingClientRect({ height: 72 });

    const resizeObserver = getResizeObserverInstances().at(0);
    expect(resizeObserver).toBeDefined();
    resizeObserver?.trigger();

    expect(getStyleProperty(tab.containerEl, "--ahs-settings-page-header-height")).toBe("72px");

    tab.hide();

    expect(resizeObserver?.disconnected).toBe(true);
  });

  it("renders card 1 as three readable card type blocks", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    expect(queryByDataset(tab.containerEl, "cardTypeList", "true")).toBeDefined();
    expect(findElements(tab.containerEl, (element) => element.tag === "th")).toHaveLength(0);
    expect(() => findSetting(tab.containerEl, "AnkiConnect URL")).toThrow("Setting not found");

    const rowLabels = findElements(tab.containerEl, (element) => element.dataset.cardTypeConfig !== undefined)
      .map((row) => collectTexts(row).find((text) => text.includes("题")));
    expect(rowLabels).toEqual([
      "问答题（常规段落形式）",
      "问答题（多级列表形式）",
      "填空题",
    ]);
    expect(() => queryByDataset(tab.containerEl, "cardTypeMarker", "semantic-qa")).toThrow("Element not found");
  });

  it("does not render the legacy card-types description copy", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    expect(collectTexts(tab.containerEl)).not.toContain("直接编辑识别规则，修改后自动保存。");
  });

  it("auto saves toggle, heading, note type and field mapping edits", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
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

    const qaGroupNoteType = queryByDataset(tab.containerEl, "cardTypeNoteType", "qa-group");
    qaGroupNoteType.value = QA_GROUP_USER_MODEL_NAME;
    await qaGroupNoteType.trigger("change");
    expect(plugin.settings.cardTypeConfigs["qa-group"].noteType).toBe(QA_GROUP_USER_MODEL_NAME);

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

    const qaGroupTitleField = queryByDataset(tab.containerEl, "qaGroupTitleField", "qa-group");
    expect(qaGroupTitleField.value).toBe("题目");
    qaGroupTitleField.value = "标题";
    await qaGroupTitleField.trigger("change");
    expect(queryByDataset(tab.containerEl, "qaGroupSlotSummary", "qa-group").textContent).toBe("已识别 2 组");
    expect(plugin.settings.noteFieldMappings[createNoteFieldMappingKey("qa-group", plugin.settings.cardTypeConfigs["qa-group"].noteType)]).toEqual(expect.objectContaining({
      titleField: "标题",
      slots: [
        { index: 1, questionField: "问题01", answerField: "答案01" },
        { index: 2, questionField: "问题02", answerField: "答案02" },
      ],
      warnings: [],
    }));
  });

  it("debounces text input saves instead of saving every keystroke", async () => {
    vi.useFakeTimers();
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    const markerInput = queryByDataset(tab.containerEl, "cardTypeMarker", "cloze");
    markerInput.value = "#cloze-a";
    await markerInput.trigger("input");
    markerInput.value = "#cloze-ab";
    await markerInput.trigger("input");

    expect(plugin.updateCalls).toHaveLength(0);

    vi.advanceTimersByTime(499);
    await flushPromises();
    expect(plugin.updateCalls).toHaveLength(0);

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(plugin.settings.cardTypeConfigs.cloze.extraMarker).toBe("#cloze-ab");
    expect(plugin.updateCalls).toHaveLength(1);
  });

  it("blocks conflicting default rows and shows the error in card 1", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    const clozeHeading = queryByDataset(tab.containerEl, "cardTypeHeading", "cloze");
    clozeHeading.value = "4";
    await clozeHeading.trigger("change");

    vi.useFakeTimers();
    const clozeMarker = queryByDataset(tab.containerEl, "cardTypeMarker", "cloze");
    clozeMarker.value = "";
    await clozeMarker.trigger("input");
    vi.advanceTimersByTime(500);
    await flushPromises();
    vi.useRealTimers();

    expect(plugin.settings.cardTypeConfigs.cloze.headingLevel).toBe(4);
    expect(plugin.settings.cardTypeConfigs.cloze.extraMarker).toBe("#anki-cloze");
    expect(collectTexts(tab.containerEl).some((text) => text.includes("同一个 H4 只能有一个启用的默认卡片类型"))).toBe(true);
  });

  it("expanding and collapsing cards does not rebuild the whole settings page", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    const initialEmptyCount = getEmptyCallCount(tab.containerEl);

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "scope").style.display).toBe("block");
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    expect(queryByDataset(tab.containerEl, "settingsCardBody", "scope").style.display).toBe("none");
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);
  });

  it("loading Anki config refreshes only card 1 instead of rebuilding the whole page", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    const initialEmptyCount = getEmptyCallCount(tab.containerEl);

    await queryByDataset(tab.containerEl, "cardTypesRefresh", "true").trigger("click");
    await flushPromises();

    expect(plugin.listNoteModelsCalls).toBe(1);
    expect(plugin.getModelFieldNamesByModelNamesCalls).toBe(1);
    expect(plugin.getNoteModelDetailsCalls).toBe(0);
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);
    expect(collectTexts(tab.containerEl).some((text) => text.includes("已获取 6 个笔记模板，已选择并配置 2 个卡片模式。"))).toBe(true);
  });

  it("persists loaded Anki note types and uses the cache before the next manual refresh", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    await queryByDataset(tab.containerEl, "cardTypesRefresh", "true").trigger("click");
    await flushPromises();

    expect(plugin.settings.ankiNoteTypeCache).toEqual([
      "Basic",
      "Cloze",
      "Custom Basic",
      "Custom Cloze",
      "Semantic QA",
      QA_GROUP_USER_MODEL_NAME,
    ].sort((left, right) => left.localeCompare(right)));
    expect(plugin.updateCalls.some((call) => Array.isArray(call.ankiNoteTypeCache))).toBe(true);
    expect(plugin.settings.ankiModelFieldCache).toEqual(expect.objectContaining({
      Basic: {
        fieldNames: ["Front", "Back", "Extra"],
        loadedAt: expect.any(Number),
      },
      "Custom Basic": {
        fieldNames: ["Title", "Body", "Hint"],
        loadedAt: expect.any(Number),
      },
      Cloze: {
        fieldNames: ["Text", "Extra", "Hint"],
        loadedAt: expect.any(Number),
      },
    }));
    expect(plugin.updateCalls.some((call) => typeof call.ankiModelFieldCache === "object" && call.ankiModelFieldCache !== null)).toBe(true);

    const cachedPlugin = new FakePlugin();
    cachedPlugin.settings = normalizePluginSettings({
      ...cachedPlugin.settings,
      ankiNoteTypeCache: ["Basic", "Cached Basic", "Cached Cloze"],
      ankiModelFieldCache: {
        "Cached Basic": {
          fieldNames: ["Front", "Back", "Hint"],
          loadedAt: 123,
        },
      },
      cardTypeConfigs: {
        ...cachedPlugin.settings.cardTypeConfigs,
        basic: {
          ...cachedPlugin.settings.cardTypeConfigs.basic,
          noteType: "Cached Basic",
        },
      },
    });
    cachedPlugin.noteModels = ["Basic", "Cached Basic", "Cached Cloze"];
    const cachedTab = new AnkiHeadingSyncSettingTab(cachedPlugin as never);

    cachedTab.display();
    await expandCard(cachedTab, "card-types");
    await flushPromises();

    const basicNoteTypeSelect = queryByDataset(cachedTab.containerEl, "cardTypeNoteType", "basic");
    expect(collectOptionValues(basicNoteTypeSelect)).toEqual(["Basic", "Cached Basic", "Cached Cloze"]);
    const basicQuestionFieldSelect = queryByDataset(cachedTab.containerEl, "cardTypeQuestionField", "basic");
    const basicAnswerFieldSelect = queryByDataset(cachedTab.containerEl, "cardTypeAnswerField", "basic");
    expect(collectOptionValues(basicQuestionFieldSelect)).toEqual(["", "Front", "Back", "Hint"]);
    expect(collectOptionValues(basicAnswerFieldSelect)).toEqual(["", "Front", "Back", "Hint"]);
    expect(cachedPlugin.listNoteModelsCalls).toBe(1);
    expect(cachedPlugin.getModelFieldNamesByModelNamesCalls).toBe(0);
    expect(cachedPlugin.getNoteModelDetailsCalls).toBe(0);
    expect(collectTexts(cachedTab.containerEl).some((text) => text.includes("当前使用缓存的 3 个笔记模板，已选择并配置 1 个卡片模式。"))).toBe(true);
  });

  it("shows cache-empty status and skips background checking when there is no cached note type", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    expect(plugin.listNoteModelsCalls).toBe(0);
    expect(plugin.getModelFieldNamesByModelNamesCalls).toBe(0);
    expect(collectTexts(tab.containerEl).some((text) => text.includes("当前没有已缓存的 Anki 笔记模板"))).toBe(true);
  });

  it("warns when the live note type list differs from the cached list without loading fields", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      ankiNoteTypeCache: ["Basic", "Cached Basic", "Cached Cloze"],
      ankiModelFieldCache: {
        "Cached Basic": {
          fieldNames: ["Front", "Back", "Hint"],
          loadedAt: 123,
        },
      },
      cardTypeConfigs: {
        ...plugin.settings.cardTypeConfigs,
        basic: {
          ...plugin.settings.cardTypeConfigs.basic,
          noteType: "Cached Basic",
        },
      },
    });
    plugin.noteModels = ["Basic", "Cached Basic", "Cached Cloze", "Live Only"];
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    await flushPromises();

    expect(plugin.listNoteModelsCalls).toBe(1);
    expect(plugin.getModelFieldNamesByModelNamesCalls).toBe(0);
    expect(plugin.getNoteModelDetailsCalls).toBe(0);
    expect(collectTexts(tab.containerEl).some((text) => text.includes("和本页缓存的 3 个模板不一致"))).toBe(true);
  });

  it("shows cache-check failure while keeping cached dropdowns when the lightweight check fails", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      ankiNoteTypeCache: ["Basic", "Cached Basic"],
      ankiModelFieldCache: {
        "Cached Basic": {
          fieldNames: ["Front", "Back", "Hint"],
          loadedAt: 123,
        },
      },
      cardTypeConfigs: {
        ...plugin.settings.cardTypeConfigs,
        basic: {
          ...plugin.settings.cardTypeConfigs.basic,
          noteType: "Cached Basic",
        },
      },
    });
    plugin.listNoteModelsError = new Error("offline");
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    await flushPromises();

    expect(plugin.listNoteModelsCalls).toBe(1);
    expect(plugin.getModelFieldNamesByModelNamesCalls).toBe(0);
    expect(collectTexts(tab.containerEl).some((text) => text.includes("后台检查最新模板列表失败"))).toBe(true);
    expect(collectOptionValues(queryByDataset(tab.containerEl, "cardTypeNoteType", "basic"))).toEqual(["Basic", "Cached Basic"]);
  });

  it("manual refresh overrides the stale-cache warning with the latest loaded summary", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      ankiNoteTypeCache: ["Basic", "Cached Basic"],
      ankiModelFieldCache: {
        "Cached Basic": {
          fieldNames: ["Front", "Back", "Hint"],
          loadedAt: 123,
        },
      },
      cardTypeConfigs: {
        ...plugin.settings.cardTypeConfigs,
        basic: {
          ...plugin.settings.cardTypeConfigs.basic,
          noteType: "Cached Basic",
        },
      },
    });
    plugin.noteModels = ["Basic", "Cached Basic", "Custom Cloze"];
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    await flushPromises();
    expect(collectTexts(tab.containerEl).some((text) => text.includes("和本页缓存的 2 个模板不一致"))).toBe(true);

    await queryByDataset(tab.containerEl, "cardTypesRefresh", "true").trigger("click");
    await flushPromises();

    expect(plugin.listNoteModelsCalls).toBe(2);
    expect(plugin.getModelFieldNamesByModelNamesCalls).toBe(1);
    expect(collectTexts(tab.containerEl).some((text) => text.includes("已获取 3 个笔记模板，已选择并配置 2 个卡片模式。"))).toBe(true);
    expect(collectTexts(tab.containerEl).some((text) => text.includes("和本页缓存的 2 个模板不一致"))).toBe(false);
  });

  it("counts only enabled visible card types with cached fields in the status summary", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      ankiNoteTypeCache: ["Basic", "Custom Cloze", QA_GROUP_USER_MODEL_NAME],
      ankiModelFieldCache: {
        Basic: {
          fieldNames: ["Front", "Back", "Extra"],
          loadedAt: 100,
        },
        "Custom Cloze": {
          fieldNames: ["Text", "Extra", "Hint"],
          loadedAt: 100,
        },
        [QA_GROUP_USER_MODEL_NAME]: {
          fieldNames: ["题目", "标题", "问题01", "答案01"],
          loadedAt: 100,
        },
      },
      cardTypeConfigs: {
        ...plugin.settings.cardTypeConfigs,
        basic: {
          ...plugin.settings.cardTypeConfigs.basic,
          enabled: true,
          noteType: "Basic",
        },
        "qa-group": {
          ...plugin.settings.cardTypeConfigs["qa-group"],
          enabled: true,
          noteType: QA_GROUP_USER_MODEL_NAME,
        },
        cloze: {
          ...plugin.settings.cardTypeConfigs.cloze,
          enabled: false,
          noteType: "Custom Cloze",
        },
      },
    });
    plugin.noteModels = ["Basic", "Custom Cloze", QA_GROUP_USER_MODEL_NAME];
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    await flushPromises();

    expect(collectTexts(tab.containerEl).some((text) => text.includes("当前使用缓存的 3 个笔记模板，已选择并配置 2 个卡片模式。"))).toBe(true);

    const clozeToggle = queryByDataset(tab.containerEl, "cardTypeEnabled", "cloze");
    clozeToggle.checked = true;
    await clozeToggle.trigger("change");

    expect(collectTexts(tab.containerEl).some((text) => text.includes("当前使用缓存的 3 个笔记模板，已选择并配置 3 个卡片模式。"))).toBe(true);
  });

  it("excludes enabled card types without cached fields from the configured count", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      ankiNoteTypeCache: ["Basic", "Custom Cloze", QA_GROUP_USER_MODEL_NAME],
      ankiModelFieldCache: {
        Basic: {
          fieldNames: ["Front", "Back", "Extra"],
          loadedAt: 100,
        },
        [QA_GROUP_USER_MODEL_NAME]: {
          fieldNames: ["题目", "标题", "问题01", "答案01"],
          loadedAt: 100,
        },
      },
      cardTypeConfigs: {
        ...plugin.settings.cardTypeConfigs,
        basic: {
          ...plugin.settings.cardTypeConfigs.basic,
          enabled: true,
          noteType: "Basic",
        },
        "qa-group": {
          ...plugin.settings.cardTypeConfigs["qa-group"],
          enabled: true,
          noteType: QA_GROUP_USER_MODEL_NAME,
        },
        cloze: {
          ...plugin.settings.cardTypeConfigs.cloze,
          enabled: true,
          noteType: "Custom Cloze",
        },
      },
    });
    plugin.noteModels = ["Basic", "Custom Cloze", QA_GROUP_USER_MODEL_NAME];
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    await flushPromises();

    expect(collectTexts(tab.containerEl).some((text) => text.includes("当前使用缓存的 3 个笔记模板，已选择并配置 2 个卡片模式。"))).toBe(true);
  });

  it("switching note type immediately reuses cached field names", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      ankiNoteTypeCache: ["Basic", "Custom Basic"],
      ankiModelFieldCache: {
        Basic: {
          fieldNames: ["Front", "Back", "Extra"],
          loadedAt: 100,
        },
        "Custom Basic": {
          fieldNames: ["Title", "Body", "Hint"],
          loadedAt: 200,
        },
      },
      cardTypeConfigs: {
        ...plugin.settings.cardTypeConfigs,
        basic: {
          ...plugin.settings.cardTypeConfigs.basic,
          noteType: "Custom Basic",
        },
      },
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    const basicNoteTypeSelect = queryByDataset(tab.containerEl, "cardTypeNoteType", "basic");
    basicNoteTypeSelect.value = "Basic";
    await basicNoteTypeSelect.trigger("change");
    await flushPromises();

    const basicQuestionFieldSelect = queryByDataset(tab.containerEl, "cardTypeQuestionField", "basic");
    const basicAnswerFieldSelect = queryByDataset(tab.containerEl, "cardTypeAnswerField", "basic");
    expect(collectOptionValues(basicQuestionFieldSelect)).toEqual(["", "Front", "Back", "Extra"]);
    expect(collectOptionValues(basicAnswerFieldSelect)).toEqual(["", "Front", "Back", "Extra"]);
    expect(plugin.getNoteModelDetailsCalls).toBe(0);
  });

  it("shows qa-group warnings, saves acceptance, and resets acceptance after field refresh changes warnings", async () => {
    const plugin = new FakePlugin();
    plugin.fieldNamesByModelName[QA_GROUP_USER_MODEL_NAME] = ["题目", "问题01", "答案01", "问题02"];
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      ankiNoteTypeCache: [QA_GROUP_USER_MODEL_NAME],
      ankiModelFieldCache: {
        [QA_GROUP_USER_MODEL_NAME]: {
          fieldNames: ["题目", "问题01", "答案01", "问题02"],
          loadedAt: 100,
        },
      },
      cardTypeConfigs: {
        ...plugin.settings.cardTypeConfigs,
        "qa-group": {
          ...plugin.settings.cardTypeConfigs["qa-group"],
          noteType: QA_GROUP_USER_MODEL_NAME,
        },
      },
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    expect(queryByDataset(tab.containerEl, "qaGroupWarning", "qa-group").textContent).toContain("第 02 组缺少答案字段");
    const acceptWarning = queryByDataset(tab.containerEl, "qaGroupWarningAccept", "qa-group");
    acceptWarning.checked = true;
    await acceptWarning.trigger("change");

    const mappingKey = createNoteFieldMappingKey("qa-group", QA_GROUP_USER_MODEL_NAME);
    expect(plugin.settings.noteFieldMappings[mappingKey]).toEqual(expect.objectContaining({
      acceptedWarnings: expect.any(Array),
    }));

    plugin.fieldNamesByModelName[QA_GROUP_USER_MODEL_NAME] = ["题目", "问题01", "答案01", "问题02", "答案02", "问题03"];
    await queryByDataset(tab.containerEl, "cardTypesRefresh", "true").trigger("click");
    await flushPromises();

    expect(plugin.settings.noteFieldMappings[mappingKey]).toEqual(expect.objectContaining({
      warnings: expect.any(Array),
      acceptedWarnings: undefined,
    }));
    expect(queryByDataset(tab.containerEl, "qaGroupWarning", "qa-group").textContent).toContain("第 03 组缺少答案字段");
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
