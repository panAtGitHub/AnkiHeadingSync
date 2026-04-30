import type { PluginSettings } from "@/application/config/PluginSettings";
import { DEFAULT_SETTINGS } from "@/application/config/PluginSettings";
import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { AddAnkiNoteInput, AnkiGroupGateway, AnkiNoteDetails, AnkiNoteSummary, ChangeDeckInput, DeckStat, SyncAnkiNoteTagsInput, UpdateAnkiNoteInput, UpdateAnkiNoteModelInput } from "@/application/ports/AnkiGateway";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { PluginStateRepository } from "@/application/ports/PluginStateRepository";
import { MarkdownWriteConflictError } from "@/application/ports/VaultGateway";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import type { SourceFile } from "@/domain/card/entities/SourceFile";
import type { MediaAsset } from "@/domain/card/entities/RenderedFields";
import { createEmptyPluginState, type PluginState } from "@/domain/manual-sync/entities/PluginState";

export const QA_GROUP_USER_NOTE_TYPE = "问答题（多级列表）";

export class InMemoryPluginStateRepository implements PluginStateRepository {
  public savedState: PluginState | null = null;

  constructor(private state: PluginState = createEmptyPluginState()) {}

  load(): Promise<PluginState> {
    return Promise.resolve(this.state);
  }

  save(state: PluginState): Promise<void> {
    this.state = state;
    this.savedState = state;
    return Promise.resolve();
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

  listMarkdownFileRefs(): Promise<Array<{ path: string; basename: string; mtime: number; size: number }>> {
    return Promise.resolve(Array.from(this.files.entries()).map(([path, file]) => ({
      path,
      basename: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
      mtime: file.mtime,
      size: file.size,
    })));
  }

  listFolderTree(): Promise<FolderTreeNode[]> {
    return Promise.resolve(buildFolderTree(Array.from(this.files.keys())));
  }

  readMarkdownFile(path: string): Promise<SourceFile | null> {
    this.readCalls.push(path);
    const file = this.files.get(path);
    if (!file) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      path,
      basename: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
      content: file.content,
      tags: [],
    });
  }

  replaceMarkdownFile(path: string, expectedContent: string, nextContent: string): Promise<void> {
    this.replaceCalls.push({ path, expectedContent, nextContent });

    const pathError = this.errorPaths.get(path);
    if (pathError) {
      return Promise.reject(pathError);
    }

    if (this.conflictPaths.has(path)) {
      return Promise.reject(new MarkdownWriteConflictError(path));
    }

    const current = this.files.get(path);
    if (!current || current.content !== expectedContent) {
      return Promise.reject(new MarkdownWriteConflictError(path));
    }

    this.files.set(path, {
      content: nextContent,
      mtime: current.mtime + 1,
      size: nextContent.length,
    });

    return Promise.resolve();
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

export class FakeManualSyncAnkiGateway implements AnkiGroupGateway {
  public operationLog: string[] = [];
  public ensuredDecks: string[][] = [];
  public addedNotes: AddAnkiNoteInput[] = [];
  public deletedNotes: number[][] = [];
  public updatedNotes: UpdateAnkiNoteInput[] = [];
  public updatedNoteModels: UpdateAnkiNoteModelInput[] = [];
  public syncedNoteTags: SyncAnkiNoteTagsInput[] = [];
  public changedDecks: ChangeDeckInput[] = [];
  public deletedDecks: string[][] = [];
  public storedMedia: MediaAsset[] = [];
  public noteSummariesById = new Map<number, AnkiNoteSummary>();
  public noteDetailsById = new Map<number, AnkiNoteDetails>();
  public deckStatsByName = new Map<string, DeckStat>();
  public listedDeckNames: string[] | null = null;
  public foundNoteIds = new Map<string, number[]>();
  public modelDetailsByName: Record<string, NoteModelDetails> = {
    Basic: { fieldNames: ["Front", "Back"] },
    Cloze: { fieldNames: ["Text", "Extra"] },
    [QA_GROUP_USER_NOTE_TYPE]: {
      fieldNames: ["题目", "问题01", "答案01", "问题02", "答案02", "问题03", "答案03"],
    },
  };
  public addNotesErrorQueue: Error[] = [];
  public deleteNotesErrorQueue: Error[] = [];
  public updateNoteModelError: Error | null = null;

  private nextNoteId = 9000;

  async ensureDeckExists(deckName: string): Promise<void> {
    await this.ensureDecks([deckName]);
  }

  ensureDecks(deckNames: string[]): Promise<void> {
    this.operationLog.push("ensureDecks");
    this.ensuredDecks.push(deckNames);
    return Promise.resolve();
  }

  listNoteModels(): Promise<string[]> {
    return Promise.resolve(Object.keys(this.modelDetailsByName));
  }

  listDeckNames(): Promise<string[]> {
    return Promise.resolve(this.listedDeckNames ? [...this.listedDeckNames] : Array.from(this.deckStatsByName.keys()));
  }

  getModelDetails(modelName: string): Promise<NoteModelDetails> {
    return Promise.resolve(this.modelDetailsByName[modelName] ?? { fieldNames: ["Front", "Back"] });
  }

  getModelFieldNames(modelName: string): Promise<string[]> {
    return Promise.resolve(this.modelDetailsByName[modelName]?.fieldNames ?? []);
  }

  getModelFieldNamesByModelNames(modelNames: string[]): Promise<Record<string, string[]>> {
    const fieldNamesByModelName: Record<string, string[]> = {};

    for (const modelName of modelNames) {
      fieldNamesByModelName[modelName] = this.modelDetailsByName[modelName]?.fieldNames ?? [];
    }

    return Promise.resolve(fieldNamesByModelName);
  }

  findNoteIds(query: string): Promise<number[]> {
    return Promise.resolve([...(this.foundNoteIds.get(query) ?? [])]);
  }

  getNoteDetails(noteIds: number[]): Promise<AnkiNoteDetails[]> {
    return Promise.resolve(noteIds.flatMap((noteId) => {
      const detail = this.noteDetailsById.get(noteId);
      if (detail) {
        return [{ ...detail, cardIds: [...detail.cardIds], deckNames: detail.deckNames ? [...detail.deckNames] : undefined, tags: detail.tags ? [...detail.tags] : undefined, fields: { ...detail.fields } }];
      }

      const summary = this.noteSummariesById.get(noteId);
      return summary ? [{ ...summary, deckNames: summary.deckNames ? [...summary.deckNames] : undefined, tags: summary.tags ? [...summary.tags] : undefined, fields: {} }] : [];
    }));
  }

  getDeckStats(deckNames: string[]): Promise<DeckStat[]> {
    return Promise.resolve(deckNames.map((deckName) => this.deckStatsByName.get(deckName) ?? { deckName }));
  }

  getNoteSummaries(noteIds: number[]): Promise<AnkiNoteSummary[]> {
    return Promise.resolve(noteIds.flatMap((noteId) => {
      const summary = this.noteSummariesById.get(noteId);
      return summary ? [{ ...summary, deckNames: summary.deckNames ? [...summary.deckNames] : undefined, tags: summary.tags ? [...summary.tags] : undefined }] : [];
    }));
  }

  async addNote(input: AddAnkiNoteInput): Promise<number> {
    const [noteId] = await this.addNotes([input]);
    return noteId;
  }

  addNotes(inputs: AddAnkiNoteInput[]): Promise<number[]> {
    const noteIds: number[] = [];

    for (const input of inputs) {
      this.operationLog.push("addNotes");
      const pendingError = this.addNotesErrorQueue.shift();
      if (pendingError) {
        return Promise.reject(pendingError);
      }

      this.addedNotes.push(input);
      this.nextNoteId += 1;
      const noteId = this.nextNoteId;
      this.noteSummariesById.set(noteId, {
        noteId,
        modelName: input.modelName,
        cardIds: [],
        deckNames: [input.deckName],
        tags: [...input.tags],
      });
      this.noteDetailsById.set(noteId, {
        noteId,
        modelName: input.modelName,
        cardIds: [],
        deckNames: [input.deckName],
        tags: [...input.tags],
        fields: { ...input.fields },
      });
      noteIds.push(noteId);
    }

    return Promise.resolve(noteIds);
  }

  deleteNotes(noteIds: number[]): Promise<void> {
    this.operationLog.push("deleteNotes");
    this.deletedNotes.push(noteIds);

    for (const noteId of noteIds) {
      this.noteSummariesById.delete(noteId);
      this.noteDetailsById.delete(noteId);
    }

    const pendingError = this.deleteNotesErrorQueue.shift();
    if (pendingError) {
      return Promise.reject(pendingError);
    }

    return Promise.resolve();
  }

  async updateNote(input: UpdateAnkiNoteInput): Promise<void> {
    await this.updateNotes([input]);
  }

  updateNoteModel(input: UpdateAnkiNoteModelInput): Promise<void> {
    if (this.updateNoteModelError) {
      return Promise.reject(this.updateNoteModelError);
    }

    this.updatedNoteModels.push(input);

    const summary = this.noteSummariesById.get(input.noteId);
    if (summary) {
      this.noteSummariesById.set(input.noteId, {
        ...summary,
        modelName: input.modelName,
      });
    }

    const detail = this.noteDetailsById.get(input.noteId);
    if (detail) {
      this.noteDetailsById.set(input.noteId, {
        ...detail,
        modelName: input.modelName,
        fields: { ...input.fields },
      });
    }

    return Promise.resolve();
  }

  updateNotes(inputs: UpdateAnkiNoteInput[]): Promise<void> {
    this.updatedNotes.push(...inputs);
    return Promise.resolve();
  }

  syncNoteTags(inputs: SyncAnkiNoteTagsInput[]): Promise<void> {
    this.syncedNoteTags.push(...inputs);

    for (const input of inputs) {
      const summary = this.noteSummariesById.get(input.noteId);
      const detail = this.noteDetailsById.get(input.noteId);
      const currentTags = new Set([...(detail?.tags ?? summary?.tags ?? [])]);

      for (const tag of input.removeTags) {
        currentTags.delete(tag);
      }

      for (const tag of input.addTags) {
        currentTags.add(tag);
      }

      const nextTags = Array.from(currentTags);
      if (summary) {
        this.noteSummariesById.set(input.noteId, { ...summary, tags: nextTags });
      }

      if (detail) {
        this.noteDetailsById.set(input.noteId, { ...detail, tags: nextTags });
      }
    }

    return Promise.resolve();
  }

  changeDecks(inputs: ChangeDeckInput[]): Promise<void> {
    this.changedDecks.push(...inputs);
    return Promise.resolve();
  }

  deleteDecks(deckNames: string[]): Promise<void> {
    this.deletedDecks.push(deckNames);
    return Promise.resolve();
  }

  async storeMedia(asset: MediaAsset): Promise<void> {
    await this.storeMediaFiles([asset]);
  }

  storeMediaFiles(assets: MediaAsset[]): Promise<void> {
    this.storedMedia.push(...assets);
    return Promise.resolve();
  }
}

export function createModule3Settings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    qaNoteType: "Basic",
    clozeNoteType: "Cloze",
    cardTypeConfigs: {
      ...DEFAULT_SETTINGS.cardTypeConfigs,
      basic: {
        ...DEFAULT_SETTINGS.cardTypeConfigs.basic,
        noteType: "Basic",
      },
      "qa-group": {
        ...DEFAULT_SETTINGS.cardTypeConfigs["qa-group"],
        noteType: QA_GROUP_USER_NOTE_TYPE,
      },
      cloze: {
        ...DEFAULT_SETTINGS.cardTypeConfigs.cloze,
        noteType: "Cloze",
      },
    },
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
      [`qa-group:${QA_GROUP_USER_NOTE_TYPE}`]: {
        cardType: "qa-group",
        modelName: QA_GROUP_USER_NOTE_TYPE,
        loadedFieldNames: ["题目", "问题01", "答案01", "问题02", "答案02", "问题03", "答案03"],
        titleField: "题目",
        slots: [
          { index: 1, questionField: "问题01", answerField: "答案01" },
          { index: 2, questionField: "问题02", answerField: "答案02" },
          { index: 3, questionField: "问题03", answerField: "答案03" },
        ],
        warnings: [],
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
