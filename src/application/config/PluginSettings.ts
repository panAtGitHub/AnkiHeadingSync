import type { NoteModelFieldMapping } from "@/application/config/NoteModelFieldMapping";

export interface PluginSettings {
  qaHeadingLevel: number;
  clozeHeadingLevel: number;
  qaNoteType: string;
  clozeNoteType: string;
  noteFieldMappings: Record<string, NoteModelFieldMapping>;
  defaultDeck: string;
  includeFolders: string[];
  excludeFolders: string[];
  addObsidianBacklink: boolean;
  convertHighlightsToCloze: boolean;
  ankiConnectUrl: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  qaHeadingLevel: 4,
  clozeHeadingLevel: 5,
  qaNoteType: "Basic",
  clozeNoteType: "Cloze",
  noteFieldMappings: {},
  defaultDeck: "Obsidian",
  includeFolders: [],
  excludeFolders: [],
  addObsidianBacklink: true,
  convertHighlightsToCloze: true,
  ankiConnectUrl: "http://127.0.0.1:8765",
};

export function validatePluginSettings(settings: PluginSettings): void {
  const headingLevels = [settings.qaHeadingLevel, settings.clozeHeadingLevel];

  for (const level of headingLevels) {
    if (!Number.isInteger(level) || level < 1 || level > 6) {
      throw new Error("Heading levels must be integers between 1 and 6.");
    }
  }

  if (settings.qaHeadingLevel === settings.clozeHeadingLevel) {
    throw new Error("QA and Cloze heading levels must be different.");
  }

  if (!settings.qaNoteType.trim()) {
    throw new Error("QA note type is required.");
  }

  if (!settings.clozeNoteType.trim()) {
    throw new Error("Cloze note type is required.");
  }

  validateNoteFieldMappings(settings.noteFieldMappings);

  if (!settings.defaultDeck.trim()) {
    throw new Error("Default deck is required.");
  }

  if (!settings.ankiConnectUrl.trim()) {
    throw new Error("AnkiConnect URL is required.");
  }
}

function validateNoteFieldMappings(noteFieldMappings: Record<string, NoteModelFieldMapping>): void {
  if (!noteFieldMappings || typeof noteFieldMappings !== "object" || Array.isArray(noteFieldMappings)) {
    throw new Error("Note field mappings must be an object.");
  }

  for (const mapping of Object.values(noteFieldMappings)) {
    if (mapping.cardType !== "basic" && mapping.cardType !== "cloze") {
      throw new Error("Note field mappings must use a supported card type.");
    }

    if (!mapping.modelName.trim()) {
      throw new Error("Note field mappings must include a model name.");
    }

    if (!Array.isArray(mapping.loadedFieldNames)) {
      throw new Error("Note field mappings must include loaded field names.");
    }

    if (!Number.isFinite(mapping.loadedAt)) {
      throw new Error("Note field mappings must include a loaded timestamp.");
    }
  }
}