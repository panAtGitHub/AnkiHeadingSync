export async function requestUrl(): Promise<never> {
  throw new Error("obsidian.requestUrl stub was called without a test mock.");
}

export class Plugin {
  public app: unknown;

  constructor(app: unknown = {}) {
    this.app = app;
  }

  addSettingTab(): void {}
}

export class PluginSettingTab {
  public containerEl = {
    empty() {},
    createEl() {
      return this;
    },
  };

  constructor(
    public readonly app: unknown,
    public readonly plugin: unknown,
  ) {}
}

export class Setting {
  constructor(containerEl: unknown) {
    void containerEl;
  }

  setName(): this {
    return this;
  }

  setDesc(): this {
    return this;
  }

  addText(): this {
    return this;
  }

  addTextArea(): this {
    return this;
  }

  addDropdown(): this {
    return this;
  }

  addToggle(): this {
    return this;
  }

  addButton(): this {
    return this;
  }
}

export class Notice {
  constructor(
    public readonly message: string,
    public readonly timeout?: number,
  ) {}
}

export class TFile {
  public readonly extension: string;
  public readonly basename: string;
  public readonly name: string;

  constructor(public readonly path: string) {
    const segments = path.split("/");
    this.name = segments[segments.length - 1] ?? path;
    const extensionIndex = this.name.lastIndexOf(".");
    this.extension = extensionIndex >= 0 ? this.name.slice(extensionIndex + 1) : "";
    this.basename = extensionIndex >= 0 ? this.name.slice(0, extensionIndex) : this.name;
  }
}

export class TFolder {
  public readonly name: string;

  constructor(
    public readonly path: string,
    public readonly children: Array<TFolder | TFile> = [],
  ) {
    const segments = path.split("/").filter(Boolean);
    this.name = segments[segments.length - 1] ?? "";
  }
}