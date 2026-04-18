import type { PluginSettings } from "@/application/config/PluginSettings";
import { DEFAULT_SETTINGS } from "@/application/config/PluginSettings";
import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { AddAnkiNoteInput, AnkiGateway, AnkiNoteSummary, ChangeDeckInput, UpdateAnkiNoteInput } from "@/application/ports/AnkiGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import { MarkdownWriteConflictError } from "@/application/ports/VaultGateway";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import type { SourceFile } from "@/domain/card/entities/SourceFile";
import type { MediaAsset } from "@/domain/card/entities/RenderedFields";
import { createEmptyPluginState, type PluginState } from "@/domain/manual-sync/entities/PluginState";

export class InMemoryPluginStateRepository implements PluginStateRepository {
  public savedState: PluginState | null = null;

  constructor(private state: PluginState = createEmptyPluginState()) {}

  async load(): Promise<PluginState> {
    return this.state;
  }

  async save(state: PluginState): Promise<void> {
    this.state = state;
    this.savedState = state;
  }
}

export class FakeManualSyncVaultGateway implements ManualSyncVaultGateway {
  public readCalls: string[] = [];
  public replaceCalls: Array<{ path: string; expectedContent: string; nextContent: string }> = [];
  public conflictPaths = new Set<string>();
  public errorPaths = new Map<string, Error>();

  private readonly files = new Map<string, { content: string; mtime: number; size: number }>();

  constructor(initialFiles: Record<string, string> = {}) {
    let nextMtime = 1;
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, { content, mtime: nextMtime, size: content.length });
      nextMtime += 1;
    }
  }

  async listMarkdownFileRefs() {
    return Array.from(this.files.entries()).map(([path, file]) => ({
      path,
      basename: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
      mtime: file.mtime,
      size: file.size,
    }));
  }

  async listFolderTree(): Promise<FolderTreeNode[]> {
    const rootMap = new Map<string, FolderTreeNode>();

    for (const path of this.files.keys()) {
      const segments = path.split("/");
      segments.pop();

      let currentPath = "";
      let siblings = rootMap;
      for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const existing = siblings.get(currentPath);
        if (existing) {
          siblings = new Map(existing.children.map((child) => [child.path, child]));
          continue;
        }

        const nextNode: FolderTreeNode = {
          path: currentPath,
          name: segment,
          children: [],
        };
        siblings.set(currentPath, nextNode);
        siblings = new Map();
      }
    }

    return buildFolderTree(Array.from(this.files.keys()));
  }

  async readMarkdownFile(path: string): Promise<SourceFile | null> {
    this.readCalls.push(path);
    const file = this.files.get(path);
    if (!file) {
      return null;
    }

    return {
      path,
      basename: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
      content: file.content,
    };
  }

  async replaceMarkdownFile(path: string, expectedContent: string, nextContent: string): Promise<void> {
    this.replaceCalls.push({ path, expectedContent, nextContent });

    if (this.errorPaths.has(path)) {
      throw this.errorPaths.get(path);
    }

    if (this.conflictPaths.has(path)) {
      throw new MarkdownWriteConflictError(path);
    }

    const current = this.files.get(path);
    if (!current || current.content !== expectedContent) {
      throw new MarkdownWriteConflictError(path);
    }

    this.files.set(path, {
      content: nextContent,
      mtime: current.mtime + 1,
      size: nextContent.length,
    });
  }

  resolveWikiLink(rawTarget: string) {
    return { url: `obsidian://open?vault=Vault&file=${rawTarget}`, displayText: rawTarget };
  }

  resolveEmbed() {
    return null;
  }

  createBacklink(location: { filePath: string; headingText: string }) {
    return `obsidian://open?vault=Vault&file=${location.filePath}#${location.headingText}`;
  }

  getFileContent(path: string): string | undefined {
    return this.files.get(path)?.content;
  }
}

export class FakeManualSyncAnkiGateway implements AnkiGateway {
  public ensuredDecks: string[][] = [];
  public addedNotes: AddAnkiNoteInput[] = [];
  public updatedNotes: UpdateAnkiNoteInput[] = [];
  public changedDecks: ChangeDeckInput[] = [];
  public storedMedia: MediaAsset[] = [];
  public noteSummariesById = new Map<number, AnkiNoteSummary>();
  public modelDetailsByName: Record<string, NoteModelDetails> = {
    Basic: { fieldNames: ["Front", "Back"], isCloze: false },
    Cloze: { fieldNames: ["Text", "Extra"], isCloze: true },
  };

  private nextNoteId = 9000;

  async ensureDeckExists(deckName: string): Promise<void> {
    await this.ensureDecks([deckName]);
  }

  async ensureDecks(deckNames: string[]): Promise<void> {
    this.ensuredDecks.push(deckNames);
  }

  async listNoteModels(): Promise<string[]> {
    return Object.keys(this.modelDetailsByName);
  }

  async getModelDetails(modelName: string): Promise<NoteModelDetails> {
    return this.modelDetailsByName[modelName] ?? { fieldNames: ["Front", "Back"], isCloze: false };
  }

  async getNoteSummaries(noteIds: number[]): Promise<AnkiNoteSummary[]> {
    return noteIds.flatMap((noteId) => {
      const summary = this.noteSummariesById.get(noteId);
      return summary ? [summary] : [];
    });
  }

  async addNote(input: AddAnkiNoteInput): Promise<number> {
    const [noteId] = await this.addNotes([input]);
    return noteId;
  }

  async addNotes(inputs: AddAnkiNoteInput[]): Promise<number[]> {
    return inputs.map((input) => {
      this.addedNotes.push(input);
      this.nextNoteId += 1;
      return this.nextNoteId;
    });
  }

  async updateNote(input: UpdateAnkiNoteInput): Promise<void> {
    await this.updateNotes([input]);
  }

  async updateNotes(inputs: UpdateAnkiNoteInput[]): Promise<void> {
    this.updatedNotes.push(...inputs);
  }

  async changeDecks(inputs: ChangeDeckInput[]): Promise<void> {
    this.changedDecks.push(...inputs);
  }

  async storeMedia(asset: MediaAsset): Promise<void> {
    await this.storeMediaFiles([asset]);
  }

  async storeMediaFiles(assets: MediaAsset[]): Promise<void> {
    this.storedMedia.push(...assets);
  }
}

export function createModule3Settings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    fileDeckEnabled: true,
    fileDeckMarker: "TARGET DECK",
    fileDeckTemplate: "obsidian::filename",
    fileDeckInsertLocation: "body",
    folderDeckMode: "folder",
    noteFieldMappings: {
      "basic:Basic": {
        cardType: "basic",
        modelName: "Basic",
        loadedFieldNames: ["Front", "Back"],
        titleField: "Front",
        bodyField: "Back",
        loadedAt: 1,
      },
      "cloze:Cloze": {
        cardType: "cloze",
        modelName: "Cloze",
        loadedFieldNames: ["Text", "Extra"],
        mainField: "Text",
        loadedAt: 1,
      },
    },
    ...overrides,
  };
}

function buildFolderTree(filePaths: string[]): FolderTreeNode[] {
  const root: FolderTreeNode = {
    path: "",
    name: "",
    children: [],
  };
  const nodeByPath = new Map<string, FolderTreeNode>([["", root]]);

  for (const filePath of filePaths) {
    const folderSegments = filePath.split("/").slice(0, -1);
    let currentPath = "";

    for (const segment of folderSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (nodeByPath.has(currentPath)) {
        continue;
      }

      const node: FolderTreeNode = {
        path: currentPath,
        name: segment,
        children: [],
      };
      nodeByPath.set(currentPath, node);

      const parentPath = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";
      nodeByPath.get(parentPath)?.children.push(node);
    }
  }

  return root.children;
}