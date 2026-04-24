import type { PluginSettings } from "@/application/config/PluginSettings";
import { DEFAULT_SETTINGS } from "@/application/config/PluginSettings";
import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { AddAnkiNoteInput, AnkiGroupGateway, AnkiModelTemplate, AnkiNoteDetails, AnkiNoteSummary, ChangeDeckInput, CreateAnkiModelInput, DeckStat, SyncAnkiNoteTagsInput, UpdateAnkiNoteInput } from "@/application/ports/AnkiGateway";
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
      tags: [],
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

export class FakeManualSyncAnkiGateway implements AnkiGroupGateway {
  public ensuredDecks: string[][] = [];
  public addedNotes: AddAnkiNoteInput[] = [];
  public deletedNotes: number[][] = [];
  public updatedNotes: UpdateAnkiNoteInput[] = [];
  public syncedNoteTags: SyncAnkiNoteTagsInput[] = [];
  public changedDecks: ChangeDeckInput[] = [];
  public deletedDecks: string[][] = [];
  public storedMedia: MediaAsset[] = [];
  public noteSummariesById = new Map<number, AnkiNoteSummary>();
  public noteDetailsById = new Map<number, AnkiNoteDetails>();
  public deckStatsByName = new Map<string, DeckStat>();
  public listedDeckNames: string[] | null = null;
  public createdModels: CreateAnkiModelInput[] = [];
  public addedModelFields: Array<{ modelName: string; fieldName: string }> = [];
  public addedModelTemplates: Array<{ modelName: string; template: AnkiModelTemplate }> = [];
  public updatedModelTemplates: Array<{ modelName: string; template: AnkiModelTemplate }> = [];
  public updatedModelStyling: Array<{ modelName: string; css: string }> = [];
  public foundNoteIds = new Map<string, number[]>();
  public modelDetailsByName: Record<string, NoteModelDetails> = {
    Basic: { fieldNames: ["Front", "Back"], isCloze: false },
    Cloze: { fieldNames: ["Text", "Extra"], isCloze: true },
    [QA_GROUP_USER_NOTE_TYPE]: {
      fieldNames: ["题目", "问题01", "答案01", "问题02", "答案02", "问题03", "答案03"],
      isCloze: false,
    },
  };
  public modelTemplatesByName: Record<string, Record<string, AnkiModelTemplate>> = {};
  public modelStylingByName: Record<string, string> = {};

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

  async listDeckNames(): Promise<string[]> {
    return this.listedDeckNames ? [...this.listedDeckNames] : Array.from(this.deckStatsByName.keys());
  }

  async getModelDetails(modelName: string): Promise<NoteModelDetails> {
    return this.modelDetailsByName[modelName] ?? { fieldNames: ["Front", "Back"], isCloze: false };
  }

  async getModelFieldNames(modelName: string): Promise<string[]> {
    return this.modelDetailsByName[modelName]?.fieldNames ?? [];
  }

  async getModelFieldNamesByModelNames(modelNames: string[]): Promise<Record<string, string[]>> {
    return Object.fromEntries(await Promise.all(modelNames.map(async (modelName) => [
      modelName,
      await this.getModelFieldNames(modelName),
    ])));
  }

  async getModelTemplates(modelName: string): Promise<Record<string, AnkiModelTemplate>> {
    return this.modelTemplatesByName[modelName] ?? {};
  }

  async getModelStyling(modelName: string): Promise<string> {
    return this.modelStylingByName[modelName] ?? "";
  }

  async createModel(input: CreateAnkiModelInput): Promise<void> {
    this.createdModels.push(input);
    this.modelDetailsByName[input.modelName] = {
      fieldNames: [...input.fieldNames],
      isCloze: Boolean(input.isCloze),
    };
    this.modelTemplatesByName[input.modelName] = Object.fromEntries(input.templates.map((template) => [template.name, { ...template }]));
    this.modelStylingByName[input.modelName] = input.css;
  }

  async addModelField(modelName: string, fieldName: string): Promise<void> {
    this.addedModelFields.push({ modelName, fieldName });
    const existing = this.modelDetailsByName[modelName] ?? { fieldNames: [], isCloze: false };
    if (!existing.fieldNames.includes(fieldName)) {
      existing.fieldNames.push(fieldName);
    }
    this.modelDetailsByName[modelName] = existing;
  }

  async addModelTemplate(modelName: string, template: AnkiModelTemplate): Promise<void> {
    this.addedModelTemplates.push({ modelName, template });
    this.modelTemplatesByName[modelName] = {
      ...(this.modelTemplatesByName[modelName] ?? {}),
      [template.name]: { ...template },
    };
  }

  async updateModelTemplate(modelName: string, template: AnkiModelTemplate): Promise<void> {
    this.updatedModelTemplates.push({ modelName, template });
    this.modelTemplatesByName[modelName] = {
      ...(this.modelTemplatesByName[modelName] ?? {}),
      [template.name]: { ...template },
    };
  }

  async updateModelStyling(modelName: string, css: string): Promise<void> {
    this.updatedModelStyling.push({ modelName, css });
    this.modelStylingByName[modelName] = css;
  }

  async findNoteIds(query: string): Promise<number[]> {
    return [...(this.foundNoteIds.get(query) ?? [])];
  }

  async getNoteDetails(noteIds: number[]): Promise<AnkiNoteDetails[]> {
    return noteIds.flatMap((noteId) => {
      const detail = this.noteDetailsById.get(noteId);
      if (detail) {
        return [{ ...detail, cardIds: [...detail.cardIds], deckNames: detail.deckNames ? [...detail.deckNames] : undefined, tags: detail.tags ? [...detail.tags] : undefined, fields: { ...detail.fields } }];
      }

      const summary = this.noteSummariesById.get(noteId);
      return summary ? [{ ...summary, deckNames: summary.deckNames ? [...summary.deckNames] : undefined, tags: summary.tags ? [...summary.tags] : undefined, fields: {} }] : [];
    });
  }

  async getDeckStats(deckNames: string[]): Promise<DeckStat[]> {
    return deckNames.map((deckName) => this.deckStatsByName.get(deckName) ?? { deckName });
  }

  async getNoteSummaries(noteIds: number[]): Promise<AnkiNoteSummary[]> {
    return noteIds.flatMap((noteId) => {
      const summary = this.noteSummariesById.get(noteId);
      return summary ? [{ ...summary, deckNames: summary.deckNames ? [...summary.deckNames] : undefined, tags: summary.tags ? [...summary.tags] : undefined }] : [];
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

  async deleteNotes(noteIds: number[]): Promise<void> {
    this.deletedNotes.push(noteIds);
  }

  async updateNote(input: UpdateAnkiNoteInput): Promise<void> {
    await this.updateNotes([input]);
  }

  async updateNotes(inputs: UpdateAnkiNoteInput[]): Promise<void> {
    this.updatedNotes.push(...inputs);
  }

  async syncNoteTags(inputs: SyncAnkiNoteTagsInput[]): Promise<void> {
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
  }

  async changeDecks(inputs: ChangeDeckInput[]): Promise<void> {
    this.changedDecks.push(...inputs);
  }

  async deleteDecks(deckNames: string[]): Promise<void> {
    this.deletedDecks.push(deckNames);
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
