import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNoteFieldMappingKey } from "@/application/config/NoteModelFieldMapping";
import { DEFAULT_SETTINGS } from "@/application/config/PluginSettings";

const {
  FakeButtonComponent,
  FakeDropdownComponent,
  FakePluginSettingTab,
  FakeSetting,
} = vi.hoisted(() => {
  class HoistedFakeContainerEl {
    settings: HoistedFakeSetting[] = [];
    textNodes: string[] = [];

    empty(): void {
      this.settings = [];
      this.textNodes = [];
    }

    createEl(_tag: string, options?: { text?: string }): HoistedFakeContainerEl {
      if (options?.text) {
        this.textNodes.push(options.text);
      }

      return this;
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
    public desc = "";
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

    setDesc(desc: string): this {
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
    FakeContainerEl: HoistedFakeContainerEl,
    FakeDropdownComponent: HoistedFakeDropdownComponent,
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

class FakePlugin {
  public readonly app = {};
  public settings = {
    ...DEFAULT_SETTINGS,
    qaNoteType: "Custom Basic",
    noteFieldMappings: {},
  };

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
}

function findSetting(containerEl: FakeContainerElInstance, name: string): FakeSettingInstance {
  const setting = containerEl.settings.find((candidate: FakeSettingInstance) => candidate.name === name);

  if (!setting) {
    throw new Error(`Setting not found: ${name}`);
  }

  return setting;
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
});