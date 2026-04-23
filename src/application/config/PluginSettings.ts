import type { NoteModelFieldMapping } from "@/application/config/NoteModelFieldMapping";
import { PluginUserError } from "@/application/errors/PluginUserError";

export type ScopeMode = "all" | "include" | "exclude";
export type FileDeckInsertLocation = "yaml" | "body";
export type FolderDeckMode = "off" | "folder" | "folder-and-file";
export type CardAnswerCutoffMode = "heading-block" | "double-blank-lines";

export interface PluginSettings {
  qaHeadingLevel: number;
  clozeHeadingLevel: number;
  cardAnswerCutoffMode: CardAnswerCutoffMode;
  qaGroupMarker: string;
  qaNoteType: string;
  clozeNoteType: string;
  semanticQaMarker: string;
  semanticQaNoteType: string;
  noteFieldMappings: Record<string, NoteModelFieldMapping>;
  defaultDeck: string;
  fileDeckEnabled: boolean;
  fileDeckMarker: string;
  fileDeckTemplate: string;
  fileDeckInsertLocation: FileDeckInsertLocation;
  folderDeckMode: FolderDeckMode;
  scopeMode: ScopeMode;
  includeFolders: string[];
  excludeFolders: string[];
  addObsidianBacklink: boolean;
  convertHighlightsToCloze: boolean;
  ankiConnectUrl: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  qaHeadingLevel: 4,
  clozeHeadingLevel: 5,
  cardAnswerCutoffMode: "heading-block",
  qaGroupMarker: "#anki-list",
  qaNoteType: "Basic",
  clozeNoteType: "Cloze",
  semanticQaMarker: "#anki-list-qa",
  semanticQaNoteType: "Semantic QA",
  noteFieldMappings: {},
  defaultDeck: "Obsidian",
  fileDeckEnabled: false,
  fileDeckMarker: "TARGET DECK",
  fileDeckTemplate: "obsidian::filename",
  fileDeckInsertLocation: "body",
  folderDeckMode: "off",
  scopeMode: "all",
  includeFolders: [],
  excludeFolders: [],
  addObsidianBacklink: true,
  convertHighlightsToCloze: true,
  ankiConnectUrl: "http://127.0.0.1:8765",
};

export const SEMANTIC_QA_MARKER_REGEXP = /^#[^\s#]+$/;

export function isValidHashtagMarker(marker: string): boolean {
  return SEMANTIC_QA_MARKER_REGEXP.test(marker);
}

export function isValidSemanticQaMarker(marker: string): boolean {
  return isValidHashtagMarker(marker);
}

export function validatePluginSettings(settings: PluginSettings): void {
  const headingLevels = [settings.qaHeadingLevel, settings.clozeHeadingLevel];

  for (const level of headingLevels) {
    if (!Number.isInteger(level) || level < 1 || level > 6) {
      throw new PluginUserError("errors.settings.headingLevelsRange");
    }
  }

  if (settings.qaHeadingLevel === settings.clozeHeadingLevel) {
    throw new PluginUserError("errors.settings.headingLevelsDifferent");
  }

  if (settings.cardAnswerCutoffMode !== "heading-block" && settings.cardAnswerCutoffMode !== "double-blank-lines") {
    throw new PluginUserError("errors.settings.cardAnswerCutoffModeInvalid");
  }

  if (!settings.qaNoteType.trim()) {
    throw new PluginUserError("errors.settings.qaNoteTypeRequired");
  }

  if (!settings.qaGroupMarker.trim()) {
    throw new PluginUserError("errors.settings.qaGroupMarkerRequired");
  }

  if (!isValidHashtagMarker(settings.qaGroupMarker.trim())) {
    throw new PluginUserError("errors.settings.qaGroupMarkerInvalid");
  }

  if (!settings.clozeNoteType.trim()) {
    throw new PluginUserError("errors.settings.clozeNoteTypeRequired");
  }

  if (!settings.semanticQaMarker.trim()) {
    throw new PluginUserError("errors.settings.semanticQaMarkerRequired");
  }

  if (!isValidSemanticQaMarker(settings.semanticQaMarker.trim())) {
    throw new PluginUserError("errors.settings.semanticQaMarkerInvalid");
  }

  if (settings.qaGroupMarker.trim() === settings.semanticQaMarker.trim()) {
    throw new PluginUserError("errors.settings.qaGroupMarkerConflict");
  }

  if (!settings.semanticQaNoteType.trim()) {
    throw new PluginUserError("errors.settings.semanticQaNoteTypeRequired");
  }

  validateNoteFieldMappings(settings.noteFieldMappings);

  if (!settings.defaultDeck.trim()) {
    throw new PluginUserError("errors.settings.defaultDeckRequired");
  }

  if (typeof settings.fileDeckEnabled !== "boolean") {
    throw new PluginUserError("errors.settings.fileDeckEnabledBoolean");
  }

  if (typeof settings.fileDeckMarker !== "string") {
    throw new PluginUserError("errors.settings.fileDeckMarkerString");
  }

  if (typeof settings.fileDeckTemplate !== "string") {
    throw new PluginUserError("errors.settings.fileDeckTemplateString");
  }

  if (settings.fileDeckInsertLocation !== "yaml" && settings.fileDeckInsertLocation !== "body") {
    throw new PluginUserError("errors.settings.fileDeckInsertLocationInvalid");
  }

  if (settings.folderDeckMode !== "off" && settings.folderDeckMode !== "folder" && settings.folderDeckMode !== "folder-and-file") {
    throw new PluginUserError("errors.settings.folderDeckModeInvalid");
  }

  if (settings.scopeMode !== "all" && settings.scopeMode !== "include" && settings.scopeMode !== "exclude") {
    throw new PluginUserError("errors.settings.scopeModeInvalid");
  }

  validateFolderList(settings.includeFolders, "include");
  validateFolderList(settings.excludeFolders, "exclude");

  if (!settings.ankiConnectUrl.trim()) {
    throw new PluginUserError("errors.settings.ankiConnectUrlRequired");
  }
}

function validateFolderList(folderList: string[], label: "include" | "exclude"): void {
  if (!Array.isArray(folderList)) {
    throw new PluginUserError(label === "include" ? "errors.settings.includeFoldersArray" : "errors.settings.excludeFoldersArray");
  }

  for (const folder of folderList) {
    if (typeof folder !== "string") {
      throw new PluginUserError(label === "include" ? "errors.settings.includeFoldersStrings" : "errors.settings.excludeFoldersStrings");
    }
  }
}

function validateNoteFieldMappings(noteFieldMappings: Record<string, NoteModelFieldMapping>): void {
  if (!noteFieldMappings || typeof noteFieldMappings !== "object" || Array.isArray(noteFieldMappings)) {
    throw new PluginUserError("errors.settings.noteFieldMappingsObject");
  }

  for (const mapping of Object.values(noteFieldMappings)) {
    if (mapping.cardType !== "basic" && mapping.cardType !== "cloze" && mapping.cardType !== "semantic-qa") {
      throw new PluginUserError("errors.settings.noteFieldMappingsCardType");
    }

    if (!mapping.modelName.trim()) {
      throw new PluginUserError("errors.settings.noteFieldMappingsModelName");
    }

    if (!Array.isArray(mapping.loadedFieldNames)) {
      throw new PluginUserError("errors.settings.noteFieldMappingsLoadedFieldNames");
    }

    if (!Number.isFinite(mapping.loadedAt)) {
      throw new PluginUserError("errors.settings.noteFieldMappingsLoadedAt");
    }
  }
}