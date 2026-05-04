import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { DEFAULT_SETTINGS, normalizePluginSettings } from "@/application/config/PluginSettings";

const QA_GROUP_USER_MODEL_NAME = "问答题（多级列表）";

const {
  FakeButtonComponent,
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

  class HoistedFakeClassList {
    private readonly values = new Set<string>();

    add(...tokens: string[]): void {
      for (const token of tokens) {
        if (token) {
          this.values.add(token);
        }
      }
    }

    remove(...tokens: string[]): void {
      for (const token of tokens) {
        this.values.delete(token);
      }
    }

    contains(token: string): boolean {
      return this.values.has(token);
    }

    toString(): string {
      return [...this.values].join(" ");
    }
  }

  class HoistedFakeElement {
    public readonly children: HoistedFakeElement[] = [];
    public readonly classList = new HoistedFakeClassList();
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

    private createChild(tag: string, options?: { text?: string }): HoistedFakeElement {
      const child = new HoistedFakeElement(this.root, tag, this);
      if (options?.text) {
        child.text = options.text;
        child.textContent = options.text;
      }

      this.children.push(child);
      return child;
    }

    createEl(tag: string, options?: { text?: string }): HoistedFakeElement {
      return this.createChild(tag, options);
    }

    createDiv(options?: { text?: string }): HoistedFakeElement {
      return this.createChild("div", options);
    }

    createSpan(options?: { text?: string }): HoistedFakeElement {
      return this.createChild("span", options);
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
    public readonly buttonEl: HoistedFakeElement;
    private onClickHandler?: () => void | Promise<void>;

    constructor(containerEl?: HoistedFakeElement) {
      this.buttonEl = containerEl?.createEl("button") ?? new HoistedFakeElement(new HoistedFakeContainerEl(), "button", null);
    }

    setButtonText(text: string): this {
      this.text = text;
      this.buttonEl.text = text;
      this.buttonEl.textContent = text;
      return this;
    }

    setCta(): this {
      this.buttonEl.classList.add("mod-cta");
      return this;
    }

    setDisabled(disabled: boolean): this {
      this.buttonEl.disabled = disabled;
      return this;
    }

    onClick(callback: () => void | Promise<void>): this {
      this.onClickHandler = callback;
      this.buttonEl.addEventListener("click", callback);
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
    public readonly toggleEl = new HoistedFakeElement(new HoistedFakeContainerEl(), "div", null);
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
    public readonly settingEl: HoistedFakeElement;
    public readonly infoEl: HoistedFakeElement;
    public readonly nameEl: HoistedFakeElement;
    public readonly descEl: HoistedFakeElement;
    public readonly controlEl: HoistedFakeElement;
    public controls: Array<
      HoistedFakeButtonComponent | HoistedFakeDropdownComponent | HoistedFakeTextComponent | HoistedFakeToggleComponent
    > = [];

    constructor(containerEl: HoistedFakeElement) {
      this.settingEl = new HoistedFakeElement(containerEl.root, "div", containerEl);
      this.infoEl = new HoistedFakeElement(containerEl.root, "div", this.settingEl);
      this.nameEl = new HoistedFakeElement(containerEl.root, "div", this.infoEl);
      this.descEl = new HoistedFakeElement(containerEl.root, "div", this.infoEl);
      this.controlEl = new HoistedFakeElement(containerEl.root, "div", this.settingEl);

      this.settingEl.children.push(this.infoEl, this.controlEl);
      this.infoEl.children.push(this.nameEl, this.descEl);
      containerEl.children.push(this.settingEl);
      containerEl.root.settings.push(this);
      containerEl.ownedSettings.push(this);
    }

    setName(name: string): this {
      this.name = name;
      this.nameEl.text = name;
      this.nameEl.textContent = name;
      return this;
    }

    setDesc(desc: unknown): this {
      this.desc = desc;
      if (typeof desc === "string") {
        this.descEl.text = desc;
        this.descEl.textContent = desc;
      }
      return this;
    }

    setHeading(): this {
      this.settingEl.classList.add("is-heading");
      return this;
    }

    setClass(className: string): this {
      this.settingEl.classList.add(className);
      return this;
    }

    addButton(callback: (button: HoistedFakeButtonComponent) => void): this {
      const button = new HoistedFakeButtonComponent(this.controlEl);
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
  ButtonComponent: FakeButtonComponent,
  getLanguage: getLanguageMock,
  PluginSettingTab: FakePluginSettingTab,
  Setting: FakeSetting,
}));

import { AnkiHeadingSyncSettingTab } from "./PluginSettingTab";

type FakeContainer = InstanceType<typeof FakePluginSettingTab>["containerEl"];
type FakeSettingInstance = InstanceType<typeof FakeSetting>;
type FakeButtonInstance = { click(): Promise<void>; buttonEl: FakeElementInstance };
type FakeToggleInstance = { value: boolean; triggerChange(value: boolean): Promise<void>; toggleEl: FakeElementInstance };
type FakeElementInstance = InstanceType<typeof FakeElement>;
type QueryRoot = FakeContainer | FakeElementInstance | HTMLElement;

class FakePlugin {
  public readonly app = {
    workspace: {
      activeWindow: typeof window === "undefined" ? undefined : window,
    },
  };
  public readonly updateCalls: Array<Record<string, unknown>> = [];
  public readonly fieldNamesByModelName: Record<string, string[]> = {};
  public listNoteModelsCalls = 0;
  public getModelFieldNamesByModelNamesCalls = 0;
  public getNoteModelDetailsCalls = 0;
  public listFolderTreeCalls = 0;
  public insertDeckTemplateCalls = 0;
  public listNoteModelsError: Error | null = null;
  public noteModels = ["Basic", "Custom Basic", "Cloze", "Custom Cloze", QA_GROUP_USER_MODEL_NAME];
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

  updateSettings(partialSettings: Record<string, unknown>): Promise<void> {
    this.updateCalls.push(partialSettings);
    this.settings = normalizePluginSettings({
      ...this.settings,
      ...partialSettings,
      cardTypeConfigs: (partialSettings.cardTypeConfigs as typeof this.settings.cardTypeConfigs | undefined) ?? this.settings.cardTypeConfigs,
      noteFieldMappings: (partialSettings.noteFieldMappings as typeof this.settings.noteFieldMappings | undefined) ?? this.settings.noteFieldMappings,
    });

    return Promise.resolve();
  }

  listNoteModels(): Promise<string[]> {
    this.listNoteModelsCalls += 1;
    if (this.listNoteModelsError) {
      return Promise.reject(this.listNoteModelsError);
    }

    return Promise.resolve([...this.noteModels]);
  }

  getModelFieldNamesByModelNames(modelNames: string[]): Promise<Record<string, string[]>> {
    this.getModelFieldNamesByModelNamesCalls += 1;

    const fieldNamesByModelName = modelNames.reduce<Record<string, string[]>>((resolvedFieldNamesByModelName, modelName) => {
      resolvedFieldNamesByModelName[modelName] = this.getFieldNamesForModel(modelName);
      return resolvedFieldNamesByModelName;
    }, {});

    return Promise.resolve(fieldNamesByModelName);
  }

  getNoteModelDetails(modelName: string): Promise<{ fieldNames: string[] }> {
    this.getNoteModelDetailsCalls += 1;
    return Promise.resolve({
      fieldNames: this.getFieldNamesForModel(modelName),
    });
  }

  listFolderTree(): Promise<typeof this.folderTree> {
    this.listFolderTreeCalls += 1;
    return Promise.resolve(this.folderTree);
  }

  insertDeckTemplateToCurrentFile(): Promise<void> {
    this.insertDeckTemplateCalls += 1;
    return Promise.resolve();
  }

  private getFieldNamesForModel(modelName: string): string[] {
    if (this.fieldNamesByModelName[modelName]) {
      return this.fieldNamesByModelName[modelName];
    }

    if (modelName.includes("Cloze")) {
      return ["Text", "Extra", "Hint"];
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

function getButton(setting: FakeSettingInstance): FakeButtonInstance {
  const button = setting.controls.find((control) => typeof control === "object" && control !== null && "click" in control && "buttonEl" in control);
  if (!button) {
    throw new Error(`Button not found for setting: ${setting.name}`);
  }

  return button as FakeButtonInstance;
}

function collectTexts(container: QueryRoot): string[] {
  return findElements(container, () => true)
    .map((element) => element.textContent || element.text)
    .filter((text): text is string => Boolean(text));
}

function collectSettingNames(container: QueryRoot): string[] {
  return asFakeContainer(container).settings.map((setting) => setting.name);
}

function collectOwnedSettingNames(container: FakeElementInstance): string[] {
  return container.ownedSettings.map((setting) => setting.name);
}

function collectOwnedSettingDescs(container: FakeElementInstance): string[] {
  return container.ownedSettings
    .map((setting) => setting.desc)
    .filter((desc): desc is string => typeof desc === "string");
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
  if (!queryByDataset(tab.containerEl, "settingsCardBody", cardId).classList.contains("ahs-is-hidden")) {
    return;
  }

  await queryByDataset(tab.containerEl, "settingsCardToggle", cardId).trigger("click");
}

function isCardExpanded(tab: AnkiHeadingSyncSettingTab, cardId: string): boolean {
  return !queryByDataset(tab.containerEl, "settingsCardBody", cardId).classList.contains("ahs-is-hidden");
}

type TestActiveWindow = {
  setTimeout: (callback: () => void, delay?: number) => number;
  clearTimeout: (timer: number) => void;
};

type TestWindow = {
  activeWindow: TestActiveWindow;
  ResizeObserver: typeof ResizeObserver;
};

type ScheduledTestTimer = {
  callback: () => void;
  dueAt: number;
};

type TestTimerController = {
  setTimeout: (callback: () => void, delay?: number) => number;
  clearTimeout: (timer: number) => void;
  advanceBy: (duration: number) => void;
};

let testTimerController: TestTimerController | undefined;

function createTestTimerController(): TestTimerController {
  let currentTime = 0;
  let nextTimer = 1;
  const timers = new Map<number, ScheduledTestTimer>();

  return {
    setTimeout(callback, delay = 0): number {
      const timer = nextTimer;
      nextTimer += 1;
      timers.set(timer, {
        callback,
        dueAt: currentTime + delay,
      });
      return timer;
    },
    clearTimeout(timer): void {
      timers.delete(timer);
    },
    advanceBy(duration): void {
      const targetTime = currentTime + duration;

      while (true) {
        const nextDueTimer = [...timers.entries()]
          .filter(([, scheduledTimer]) => scheduledTimer.dueAt <= targetTime)
          .sort(([, left], [, right]) => left.dueAt - right.dueAt)[0];

        if (!nextDueTimer) {
          break;
        }

        const [timer, scheduledTimer] = nextDueTimer;
        timers.delete(timer);
        currentTime = scheduledTimer.dueAt;
        scheduledTimer.callback();
      }

      currentTime = targetTime;
    },
  };
}

function advanceTestTimersByTime(duration: number): void {
  if (!testTimerController) {
    throw new Error("Test timer controller is not initialized.");
  }

  testTimerController.advanceBy(duration);
}

function createTestWindow(): TestWindow {
  const timerController = createTestTimerController();
  testTimerController = timerController;

  const activeWindow: TestActiveWindow = {
    setTimeout: (callback, delay) => timerController.setTimeout(callback, delay),
    clearTimeout: (timer) => timerController.clearTimeout(timer),
  };

  return {
    activeWindow,
    ResizeObserver: FakeResizeObserver as unknown as typeof ResizeObserver,
  };
}

describe("PluginSettingTab", () => {
  beforeEach(() => {
    getLanguageMock.mockReturnValue("zh");
    vi.useRealTimers();
    resetResizeObserverInstances();
    vi.stubGlobal("navigator", { language: "zh" });
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("window", createTestWindow());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    testTimerController = undefined;
  });

  it("renders five cards collapsed by default", () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    expect(tab.containerEl.classList.contains("anki-heading-sync-settings")).toBe(true);
    expect(queryByDataset(tab.containerEl, "settingsPageHeader", "true")).toBeDefined();
    const cards = queryAllByDataset(tab.containerEl, "settingsCard");
    expect(cards).toHaveLength(5);
    expect(isCardExpanded(tab, "sync-content")).toBe(false);
    expect(isCardExpanded(tab, "card-types")).toBe(false);
    expect(isCardExpanded(tab, "commands")).toBe(false);
    expect(isCardExpanded(tab, "scope")).toBe(false);
    expect(isCardExpanded(tab, "deck")).toBe(false);

    expect(cards.map((card) => card.dataset.settingsCard)).toEqual(["card-types", "sync-content", "deck", "scope", "commands"]);

    for (const cardId of ["card-types", "sync-content", "deck", "scope", "commands"] as const) {
      expect(queryByDataset(tab.containerEl, "settingsCardToggle", cardId).textContent.startsWith("▸ ")).toBe(true);
    }
  });

  it("expands only the clicked card while others remain collapsed", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");

    expect(isCardExpanded(tab, "scope")).toBe(true);
    expect(isCardExpanded(tab, "card-types")).toBe(false);
    expect(isCardExpanded(tab, "sync-content")).toBe(false);
    expect(isCardExpanded(tab, "deck")).toBe(false);
    expect(isCardExpanded(tab, "commands")).toBe(false);

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");

    expect(isCardExpanded(tab, "scope")).toBe(false);
  });

  it("applies sticky styles to the opaque page header gap, mask, and card headers", () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();

    const pageHeader = queryByDataset(tab.containerEl, "settingsPageHeader", "true");
    const pageHeaderMask = queryByDataset(pageHeader, "settingsPageHeaderMask", "true");
    expect(pageHeader.classList.contains("ahs-settings-page-header")).toBe(true);
    expect(collectTexts(pageHeader)).toContain("Anki Heading Sync");

    expect(pageHeaderMask.classList.contains("ahs-settings-page-header-mask")).toBe(true);

    expect(getStyleProperty(tab.containerEl, "--ahs-settings-page-header-height")).toBe("64px");
    expect(getStyleProperty(tab.containerEl, "--ahs-settings-sticky-card-gap")).toBe("8px");

    for (const cardId of ["card-types", "sync-content", "deck", "scope", "commands"] as const) {
      const header = queryByDataset(tab.containerEl, "settingsCardToggle", cardId);
      expect(header.classList.contains("ahs-settings-card-toggle")).toBe(true);
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

  it("renders card 1 as four readable card type blocks", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    expect(queryByDataset(tab.containerEl, "cardTypeList", "true")).toBeDefined();
    expect(findElements(tab.containerEl, (element) => element.tag === "th")).toHaveLength(0);
    expect(() => findSetting(tab.containerEl, "AnkiConnect URL")).toThrow("Setting not found");

    const rowLabels = findElements(tab.containerEl, (element) => element.dataset.cardTypeConfig !== undefined)
      .map((row) => collectTexts(row).find((text) => text.includes("（")));
    expect(rowLabels).toEqual([
      "问答题（常规段落形式）",
      "问答题（多级列表形式）",
      "填空题（逐个挖空）",
      "填空题（全部挖空）",
    ]);

    expect(queryByDataset(tab.containerEl, "cardTypeSharedHint", "cloze-all").textContent).toContain("复用“填空题（逐个挖空）”当前选择的 Anki 笔记模板和主字段");
    expect(() => queryByDataset(tab.containerEl, "cardTypeNoteType", "cloze-all")).toThrow();
    expect(() => queryByDataset(tab.containerEl, "cardTypeQuestionField", "cloze-all")).toThrow();
  });

  it("does not render the legacy card-types description copy", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    expect(collectTexts(tab.containerEl)).not.toContain("直接编辑识别规则，修改后自动保存。");
  });

  it("renders sync-content section titles and settings in the new grouped order", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "sync-content");

    expect(queryByDataset(tab.containerEl, "settingsCardToggle", "sync-content").textContent).toContain("卡片正文同步内容");
    expect(collectTexts(tab.containerEl)).not.toContain("这些选项只影响卡片渲染内容，修改后仅刷新这一张卡片。");

    const sectionTitles = queryAllByDataset(tab.containerEl, "syncContentSectionTitle")
      .map((element) => element.textContent || element.text)
      .filter((text): text is string => text.length > 0);
    expect(sectionTitles).toEqual([
      "1. 确定「卡片正文」范围",
      "2. 确定是否增加回链，方便从 Anki「卡片级跳转」回 Obsidian",
      "3. 确定是否读取「标签」",
      "4. 「填空题」专项",
    ]);

    const syncContentSettingNames = collectSettingNames(tab.containerEl).filter((name) => [
      "卡片正文截止模式",
      "添加 Obsidian 回链",
      "Obsidian 回链显示名称",
      "Obsidian 回链放置位置",
      "同步 Obsidian 标签到 Anki",
      "在卡片正文中保留纯标签行",
      "高亮转填空题",
    ].includes(name));

    expect(syncContentSettingNames).toEqual([
      "卡片正文截止模式",
      "添加 Obsidian 回链",
      "Obsidian 回链显示名称",
      "Obsidian 回链放置位置",
      "同步 Obsidian 标签到 Anki",
      "在卡片正文中保留纯标签行",
      "高亮转填空题",
    ]);
    expect(findSetting(tab.containerEl, "高亮转填空题")).toBeDefined();
    expect(() => findSetting(tab.containerEl, "高亮转 Cloze")).toThrow("Setting not found");
  });

  it("keeps saving highlights-to-cloze through the same internal config field", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "sync-content");

    const highlightsSetting = findSetting(tab.containerEl, "高亮转填空题");
    await getToggle(highlightsSetting).triggerChange(false);

    expect(plugin.settings.convertHighlightsToCloze).toBe(false);
    expect(plugin.updateCalls).toContainEqual({ convertHighlightsToCloze: false });
  });

  it("uses native Obsidian CTA buttons only for settings actions", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      scopeMode: "include",
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    await expandCard(tab, "scope");
    await flushPromises();

    expect(queryByDataset(tab.containerEl, "cardTypesRefresh", "true").classList.contains("mod-cta")).toBe(true);
    expect(queryByDataset(tab.containerEl, "scopeRefreshFolders", "true").classList.contains("mod-cta")).toBe(true);

    const cardHeaderButton = queryByDataset(tab.containerEl, "settingsCardToggle", "card-types");
    expect(cardHeaderButton.classList.contains("mod-cta")).toBe(false);

    const folderToggleButton = queryByDataset(tab.containerEl, "folderToggle", "notes");
    expect(folderToggleButton.classList.contains("mod-cta")).toBe(false);

    await expandCard(tab, "deck");
    const fileDeckSetting = findSetting(tab.containerEl, "开启文件级自定义牌组");
    await getToggle(fileDeckSetting).triggerChange(true);

    const insertTemplateSetting = findSetting(tab.containerEl, "向当前文件插入牌组模板");
    const insertTemplateButton = getButton(insertTemplateSetting);
    expect(insertTemplateButton.buttonEl.classList.contains("mod-cta")).toBe(true);

    await insertTemplateButton.click();
    expect(plugin.insertDeckTemplateCalls).toBe(1);
  });

  it("keeps settings toggles on the native Obsidian toggle styling path", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "sync-content");
    await expandCard(tab, "deck");

    const toggleSettings = [
      findSetting(tab.containerEl, "添加 Obsidian 回链"),
      findSetting(tab.containerEl, "同步 Obsidian 标签到 Anki"),
      findSetting(tab.containerEl, "在卡片正文中保留纯标签行"),
      findSetting(tab.containerEl, "高亮转填空题"),
      findSetting(tab.containerEl, "开启文件级自定义牌组"),
    ];

    for (const setting of toggleSettings) {
      const toggle = getToggle(setting);
      expect(toggle.toggleEl.classList.contains("ahs-theme-toggle")).toBe(false);
      expect(toggle.toggleEl.dataset.ahsToggleState).toBeUndefined();
    }

    const highlightsToggle = getToggle(findSetting(tab.containerEl, "高亮转填空题"));
    const nextValue = !highlightsToggle.value;
    await highlightsToggle.triggerChange(nextValue);

    expect(plugin.settings.convertHighlightsToCloze).toBe(nextValue);
    expect(highlightsToggle.toggleEl.dataset.ahsToggleState).toBeUndefined();
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
    expect(queryByDataset(tab.containerEl, "qaGroupFirstQuestionField", "qa-group").value).toBe("问题01");
    expect(queryByDataset(tab.containerEl, "qaGroupFirstAnswerField", "qa-group").value).toBe("答案01");
    qaGroupTitleField.value = "标题";
    await qaGroupTitleField.trigger("change");
    expect(queryByDataset(tab.containerEl, "qaGroupSlotSummary", "qa-group").textContent).toBe("已配置2组");
    expect(plugin.settings.noteFieldMappings[createNoteFieldMappingKey("qa-group", plugin.settings.cardTypeConfigs["qa-group"].noteType)]).toEqual(expect.objectContaining({
      titleField: "标题",
      derivation: {
        mode: "first-pair",
        firstQuestionField: "问题01",
        firstAnswerField: "答案01",
      },
      slots: [
        { index: 1, questionField: "问题01", answerField: "答案01" },
        { index: 2, questionField: "问题02", answerField: "答案02" },
      ],
      warnings: [],
    }));
  });

  it("debounces text input saves instead of saving every keystroke", async () => {
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

    advanceTestTimersByTime(499);
    await flushPromises();
    expect(plugin.updateCalls).toHaveLength(0);

    advanceTestTimersByTime(1);
    await flushPromises();
    expect(plugin.settings.cardTypeConfigs.cloze.extraMarker).toBe("#cloze-ab");
    expect(plugin.updateCalls).toHaveLength(1);
  });

  it("flushes pending text saves when the settings tab hides", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    const markerInput = queryByDataset(tab.containerEl, "cardTypeMarker", "cloze");
    markerInput.value = "#cloze-hidden";
    await markerInput.trigger("input");

    expect(plugin.updateCalls).toHaveLength(0);

    tab.hide();
    await flushPromises();

    expect(plugin.settings.cardTypeConfigs.cloze.extraMarker).toBe("#cloze-hidden");
    expect(plugin.updateCalls).toHaveLength(1);

    advanceTestTimersByTime(500);
    await flushPromises();

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

    const clozeMarker = queryByDataset(tab.containerEl, "cardTypeMarker", "cloze");
    clozeMarker.value = "";
    await clozeMarker.trigger("input");
    advanceTestTimersByTime(500);
    await flushPromises();

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
    expect(isCardExpanded(tab, "scope")).toBe(true);
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    expect(isCardExpanded(tab, "scope")).toBe(false);
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
    expect(collectTexts(tab.containerEl).some((text) => text.includes("已获取 5 个笔记模板，已选择并配置 3 个卡片模式。"))).toBe(true);
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
      QA_GROUP_USER_MODEL_NAME,
    ].sort((left, right) => left.localeCompare(right)));
    expect(plugin.updateCalls.some((call) => Array.isArray(call["ankiNoteTypeCache"]))).toBe(true);
    const { ankiModelFieldCache } = plugin.settings;
    expect(ankiModelFieldCache.Basic?.fieldNames).toEqual(["Front", "Back", "Extra"]);
    expect(typeof ankiModelFieldCache.Basic?.loadedAt).toBe("number");
    expect(ankiModelFieldCache["Custom Basic"]?.fieldNames).toEqual(["Title", "Body", "Hint"]);
    expect(typeof ankiModelFieldCache["Custom Basic"]?.loadedAt).toBe("number");
    expect(ankiModelFieldCache.Cloze?.fieldNames).toEqual(["Text", "Extra", "Hint"]);
    expect(typeof ankiModelFieldCache.Cloze?.loadedAt).toBe("number");
    expect(plugin.updateCalls.some((call) => {
      const ankiModelFieldCache = call["ankiModelFieldCache"];
      return typeof ankiModelFieldCache === "object" && ankiModelFieldCache !== null;
    })).toBe(true);

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
    expect(collectTexts(tab.containerEl).some((text) => text.includes("已获取 3 个笔记模板，已选择并配置 3 个卡片模式。"))).toBe(true);
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

    expect(collectTexts(tab.containerEl).some((text) => text.includes("当前使用缓存的 3 个笔记模板，已选择并配置 3 个卡片模式。"))).toBe(true);

    const clozeToggle = queryByDataset(tab.containerEl, "cardTypeEnabled", "cloze");
    clozeToggle.checked = true;
    await clozeToggle.trigger("change");

    expect(collectTexts(tab.containerEl).some((text) => text.includes("当前使用缓存的 3 个笔记模板，已选择并配置 4 个卡片模式。"))).toBe(true);
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
    expect(plugin.settings.noteFieldMappings[createNoteFieldMappingKey("basic", "Basic")]).toEqual(expect.objectContaining({
      titleField: "Front",
      bodyField: "Back",
      loadedFieldNames: ["Front", "Back", "Extra"],
    }));
    expect(plugin.getNoteModelDetailsCalls).toBe(0);
  });

  it("extends saved qa-group slots after field refresh only when derivation metadata exists", async () => {
    const plugin = new FakePlugin();
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
      noteFieldMappings: {
        ...plugin.settings.noteFieldMappings,
        [createNoteFieldMappingKey("qa-group", QA_GROUP_USER_MODEL_NAME)]: {
          cardType: "qa-group",
          modelName: QA_GROUP_USER_MODEL_NAME,
          loadedFieldNames: ["题目", "问题01", "答案01", "问题02"],
          titleField: "题目",
          derivation: {
            mode: "first-pair",
            firstQuestionField: "问题01",
            firstAnswerField: "答案01",
          },
          slots: [
            { index: 1, questionField: "问题01", answerField: "答案01" },
          ],
          warnings: [],
          loadedAt: 1,
        },
      },
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");

    const mappingKey = createNoteFieldMappingKey("qa-group", QA_GROUP_USER_MODEL_NAME);
    expect(queryByDataset(tab.containerEl, "qaGroupSlotSummary", "qa-group").textContent).toBe("已配置1组");

    plugin.fieldNamesByModelName[QA_GROUP_USER_MODEL_NAME] = ["题目", "问题01", "答案01", "问题02", "答案02", "问题03", "答案03"];
    await queryByDataset(tab.containerEl, "cardTypesRefresh", "true").trigger("click");
    await flushPromises();

    expect(plugin.settings.noteFieldMappings[mappingKey]).toEqual(expect.objectContaining({
      derivation: {
        mode: "first-pair",
        firstQuestionField: "问题01",
        firstAnswerField: "答案01",
      },
      slots: [
        { index: 1, questionField: "问题01", answerField: "答案01" },
        { index: 2, questionField: "问题02", answerField: "答案02" },
        { index: 3, questionField: "问题03", answerField: "答案03" },
      ],
    }));
    expect(queryByDataset(tab.containerEl, "qaGroupSlotSummary", "qa-group").textContent).toBe("已配置3组");
  });

  it("keeps the saved qa-group title field and slots when reading Anki fields again", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      ankiNoteTypeCache: [QA_GROUP_USER_MODEL_NAME],
      ankiModelFieldCache: {
        [QA_GROUP_USER_MODEL_NAME]: {
          fieldNames: ["题目", "问题01", "答案01", "Titre", "QPerso", "APerso"],
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
      noteFieldMappings: {
        ...plugin.settings.noteFieldMappings,
        [createNoteFieldMappingKey("qa-group", QA_GROUP_USER_MODEL_NAME)]: {
          cardType: "qa-group",
          modelName: QA_GROUP_USER_MODEL_NAME,
          loadedFieldNames: ["Titre", "QPerso", "APerso"],
          titleField: "Titre",
          slots: [
            { index: 1, questionField: "QPerso", answerField: "APerso" },
          ],
          warnings: [],
          loadedAt: 1,
        },
      },
    });
    plugin.fieldNamesByModelName[QA_GROUP_USER_MODEL_NAME] = ["题目", "问题01", "答案01", "Titre", "QPerso", "APerso"];
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await expandCard(tab, "card-types");
    await queryByDataset(tab.containerEl, "cardTypesRefresh", "true").trigger("click");
    await flushPromises();

    const mappingKey = createNoteFieldMappingKey("qa-group", QA_GROUP_USER_MODEL_NAME);
    expect(plugin.settings.noteFieldMappings[mappingKey]).toEqual(expect.objectContaining({
      titleField: "Titre",
      slots: [
        { index: 1, questionField: "QPerso", answerField: "APerso" },
      ],
      loadedFieldNames: ["题目", "问题01", "答案01", "Titre", "QPerso", "APerso"],
    }));
    expect(queryByDataset(tab.containerEl, "qaGroupTitleField", "qa-group").value).toBe("Titre");
    expect(queryByDataset(tab.containerEl, "qaGroupFirstQuestionField", "qa-group").value).toBe("QPerso");
    expect(queryByDataset(tab.containerEl, "qaGroupFirstAnswerField", "qa-group").value).toBe("APerso");
    expect(queryByDataset(tab.containerEl, "qaGroupSlotSummary", "qa-group").textContent).toBe("已配置1组");
  });

  it("renders the scope card with renamed copy and aligned folder tree rows", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      scopeMode: "include",
      includeFolders: ["notes/sub"],
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    expect(queryByDataset(tab.containerEl, "settingsCardToggle", "scope").textContent).toContain("插件运行范围");

    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    await flushPromises();

    expect(findSetting(tab.containerEl, "插件运行范围")).toBeDefined();
    expect(() => findSetting(tab.containerEl, "运行范围")).toThrow("Setting not found");
    expect(collectTexts(tab.containerEl)).not.toContain("保留现有作用范围和文件夹树逻辑；文件夹树按需加载，并支持局部刷新。");

    const parentRow = queryByDataset(tab.containerEl, "folderRow", "notes");
    const parentToggle = queryByDataset(tab.containerEl, "folderToggle", "notes");
    const childRow = queryByDataset(tab.containerEl, "folderRow", "notes/sub");
    const childToggle = queryByDataset(tab.containerEl, "folderToggle", "notes/sub");
    const childCheckbox = queryByDataset(tab.containerEl, "folderPath", "notes/sub");
    const childLabel = queryByDataset(tab.containerEl, "folderPathLabel", "notes/sub");

    expect(parentToggle.textContent).toBe("▾");
    expect(parentRow.classList.contains("ahs-settings-folder-row")).toBe(true);
    expect(getStyleProperty(childRow, "--ahs-folder-depth-indent")).toBe("18px");
    expect(childToggle.classList.contains("ahs-settings-folder-toggle")).toBe(true);
    expect(childToggle.classList.contains("ahs-settings-folder-toggle-spacer")).toBe(true);
    expect(childCheckbox).toBeDefined();
    expect(childLabel.classList.contains("ahs-settings-folder-label")).toBe(true);
    expect(childLabel.classList.contains("ahs-settings-fluid-ellipsis")).toBe(true);
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
    expect(queryByDataset(tab.containerEl, "folderRow", "notes")).toBeDefined();
    expect(queryByDataset(tab.containerEl, "folderToggle", "notes")).toBeDefined();
    expect(queryByDataset(tab.containerEl, "folderPathLabel", "notes")).toBeDefined();

    await queryByDataset(tab.containerEl, "folderToggle", "notes").trigger("click");
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);

    const childCheckbox = queryByDataset(tab.containerEl, "folderPath", "notes/sub");
    childCheckbox.checked = true;
    await childCheckbox.trigger("change");
    expect(plugin.settings.includeFolders).toContain("notes/sub");
    expect(getEmptyCallCount(tab.containerEl)).toBe(initialEmptyCount);
  });

  it("renders folder deck mode override controls for checked include rows when folder mapping is enabled", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      scopeMode: "include",
      includeFolders: ["notes/sub"],
      folderDeckMode: "folder",
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    await flushPromises();

    const overrideCheckbox = queryByDataset(tab.containerEl, "folderDeckModeOverride", "notes/sub");
    const childLabel = queryByDataset(tab.containerEl, "folderPathLabel", "notes/sub");
    const overrideAttributes = overrideCheckbox as unknown as { title?: string; "aria-label"?: string };
    const labelParent = (childLabel as unknown as { parent?: { children?: unknown[] } }).parent;
    const overrideParent = (overrideCheckbox as unknown as { parent?: { children?: unknown[] } }).parent;
    expect(overrideCheckbox.classList.contains("ahs-settings-folder-override-checkbox")).toBe(true);
    expect(overrideAttributes.title).toBe("当前全局为「文件夹」，勾选后此文件夹改用「文件夹及文件名」作为牌组名");
    expect(overrideAttributes["aria-label"]).toBe("切换 sub 的文件夹牌组映射模式");
    expect(overrideParent).toBe(labelParent);
    expect(labelParent?.children?.[0]).toBe(childLabel);
    expect(labelParent?.children?.[1]).toBe(overrideCheckbox);
    expect(() => queryByDataset(tab.containerEl, "folderDeckModeOverrideHint", "notes/sub")).toThrow();
  });

  it("toggling a folder deck mode override only updates alternateFolderDeckModeFolders and shows the hint", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      scopeMode: "include",
      includeFolders: ["notes/sub"],
      folderDeckMode: "folder",
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    await flushPromises();

    const overrideCheckbox = queryByDataset(tab.containerEl, "folderDeckModeOverride", "notes/sub");
    overrideCheckbox.checked = true;
    await overrideCheckbox.trigger("change");

    expect(plugin.settings.includeFolders).toEqual(["notes/sub"]);
    expect(plugin.settings.alternateFolderDeckModeFolders).toEqual(["notes/sub"]);
    expect(plugin.updateCalls).toContainEqual({
      alternateFolderDeckModeFolders: ["notes/sub"],
    });
    const childLabel = queryByDataset(tab.containerEl, "folderPathLabel", "notes/sub");
    const rerenderedOverrideCheckbox = queryByDataset(tab.containerEl, "folderDeckModeOverride", "notes/sub");
    const hint = queryByDataset(tab.containerEl, "folderDeckModeOverrideHint", "notes/sub");
    const inlineParent = (childLabel as unknown as { parent?: { children?: unknown[] } }).parent;
    expect(hint.classList.contains("ahs-settings-folder-override-hint")).toBe(true);
    expect((hint as unknown as { parent?: unknown }).parent).toBe(inlineParent);
    expect(inlineParent?.children?.[0]).toBe(childLabel);
    expect(inlineParent?.children?.[1]).toBe(rerenderedOverrideCheckbox);
    expect(inlineParent?.children?.[2]).toBe(hint);
    expect(hint.textContent).toContain("文件夹及文件名");
  });

  it("cleans folder deck mode overrides for an unchecked include folder and its descendants", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      scopeMode: "include",
      includeFolders: ["notes"],
      folderDeckMode: "folder",
      alternateFolderDeckModeFolders: ["notes", "notes/sub"],
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    await flushPromises();

    const notesCheckbox = queryByDataset(tab.containerEl, "folderPath", "notes");
    notesCheckbox.checked = false;
    await notesCheckbox.trigger("change");

    expect(plugin.settings.includeFolders).toEqual([]);
    expect(plugin.settings.alternateFolderDeckModeFolders).toEqual([]);
  });

  it("hides folder deck mode override controls when folder mapping is off", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      scopeMode: "include",
      includeFolders: ["notes/sub"],
      folderDeckMode: "off",
      alternateFolderDeckModeFolders: ["notes/sub"],
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    await flushPromises();

    expect(() => queryByDataset(tab.containerEl, "folderDeckModeOverride", "notes/sub")).toThrow();
    expect(plugin.settings.alternateFolderDeckModeFolders).toEqual(["notes/sub"]);
  });

  it("shows an explicit warning when include mode has no selected folders", async () => {
    const plugin = new FakePlugin();
    plugin.settings = normalizePluginSettings({
      ...plugin.settings,
      scopeMode: "include",
      includeFolders: [],
    });
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await queryByDataset(tab.containerEl, "settingsCardToggle", "scope").trigger("click");
    await flushPromises();

    expect(queryByDataset(tab.containerEl, "scopeWarning", "unconfigured").textContent).toContain("至少选择一个文件夹后才能同步");
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

  it("renders the deck card with regrouped sections and normalized Chinese copy", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    expect(queryByDataset(tab.containerEl, "settingsCardToggle", "deck").textContent).toContain("卡片牌组设置");
    expect(queryByDataset(tab.containerEl, "settingsCardToggle", "deck").textContent).not.toContain("Deck 与牌组规则");

    await queryByDataset(tab.containerEl, "settingsCardToggle", "deck").trigger("click");

    const deckBody = queryByDataset(tab.containerEl, "settingsCardBody", "deck");
    const sectionTitles = queryAllByDataset(deckBody, "deckSectionTitle")
      .map((element) => element.textContent || element.text)
      .filter((text): text is string => text.length > 0);
    expect(sectionTitles).toEqual([
      "1，推荐用「文件夹及文件名」作为「Anki牌组」",
      "2，可打开「文件级自定义牌组」，作为个性化定制",
      "3，默认牌组作为兜底",
    ]);

    const section1 = queryByDataset(deckBody, "deckSection", "folder-mapping");
    const section2 = queryByDataset(deckBody, "deckSection", "file-deck");
    const section3 = queryByDataset(deckBody, "deckSection", "default-deck");

    expect(collectTexts(deckBody)).not.toContain("保留现有 deck 行为；切换文件级 deck 开关时只刷新这一张卡片。");
    expect(collectTexts(deckBody)).toContain("若均不打开「文件夹及文件名」及「文件级」牌组，则以「默认牌组名称」作为 Anki 的牌组名。");
    expect(collectTexts(deckBody)).toContain("最终牌组优先级：文件级自定义牌组 > 文件夹映射牌组 > 默认牌组。");

    const exampleBlock = queryByDataset(section1, "deckExampleBlock", "true");
    const exampleRows = queryAllByDataset(exampleBlock, "deckExampleRow");
    expect(collectTexts(exampleBlock)).toContain("示例：");
    expect(exampleRows).toHaveLength(2);
    expect(exampleBlock.classList.contains("ahs-settings-deck-example-block")).toBe(true);
    expect(exampleRows[0]?.classList.contains("ahs-settings-helper-text")).toBe(true);

    const fallbackHelper = queryByDataset(section3, "deckHelperText", "fallback");
    const priorityFooter = queryByDataset(deckBody, "deckPriorityFooter", "true");
    expect(fallbackHelper.classList.contains("ahs-settings-helper-text")).toBe(true);
    expect(priorityFooter.classList.contains("ahs-settings-helper-text")).toBe(true);
    expect(collectTexts(section3)).not.toContain("最终牌组优先级：文件级自定义牌组 > 文件夹映射牌组 > 默认牌组。");

    expect(collectOwnedSettingNames(section1)).toEqual(["文件夹映射模式"]);
    expect(collectOwnedSettingNames(section2)).toEqual(["开启文件级自定义牌组"]);
    expect(collectOwnedSettingNames(section3)).toEqual(["默认牌组"]);

    const visibleDeckCopy = [
      ...collectTexts(deckBody),
      ...collectOwnedSettingNames(section1),
      ...collectOwnedSettingNames(section2),
      ...collectOwnedSettingNames(section3),
      ...collectOwnedSettingDescs(section1),
      ...collectOwnedSettingDescs(section2),
      ...collectOwnedSettingDescs(section3),
    ].join("\n");
    expect(visibleDeckCopy).not.toContain("文件级 deck");
    expect(visibleDeckCopy).not.toContain("deck 模板");
    expect(visibleDeckCopy).not.toContain("deck 声明");
    expect(visibleDeckCopy).not.toContain("最终 deck 优先级");
    expect(visibleDeckCopy).not.toContain("Deck 与牌组规则");
    expect(findSetting(tab.containerEl, "默认牌组")).toBeDefined();
    expect(findSetting(tab.containerEl, "文件夹映射模式")).toBeDefined();
    expect(findSetting(tab.containerEl, "开启文件级自定义牌组")).toBeDefined();
  });

  it("keeps file-level custom deck controls in section 2 when enabled", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await queryByDataset(tab.containerEl, "settingsCardToggle", "deck").trigger("click");

    const fileDeckSetting = findSetting(tab.containerEl, "开启文件级自定义牌组");
    await getToggle(fileDeckSetting).triggerChange(true);

    const deckBody = queryByDataset(tab.containerEl, "settingsCardBody", "deck");
    const section2 = queryByDataset(deckBody, "deckSection", "file-deck");
    expect(collectOwnedSettingNames(section2)).toEqual([
      "开启文件级自定义牌组",
      "牌组识别名",
      "默认牌组模板",
      "模板插入位置",
      "向当前文件插入牌组模板",
    ]);
  });

  it("does not show the maintenance-only rebuild index command in the command guide", async () => {
    const plugin = new FakePlugin();
    const tab = new AnkiHeadingSyncSettingTab(plugin as never);

    tab.display();
    await queryByDataset(tab.containerEl, "settingsCardToggle", "commands").trigger("click");

    const commandsBody = queryByDataset(tab.containerEl, "settingsCardBody", "commands");
    const commandCopy = collectTexts(commandsBody).join("\n");
    expect(commandCopy).toContain("同步当前文件到 Anki");
    expect(commandCopy).toContain("同步全库到 Anki");
    expect(commandCopy).toContain("清空当前文件已同步卡片");
    expect(commandCopy).toContain("清理空牌组");
    expect(commandCopy).not.toContain("重建卡片索引");
    expect(commandCopy).not.toContain("只重建本地卡片索引，不创建或更新远端笔记。");
  });
});
