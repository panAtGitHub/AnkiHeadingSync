export interface PluginSettings {
  qaHeadingLevel: number;
  clozeHeadingLevel: number;
  qaNoteType: string;
  clozeNoteType: string;
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

  if (!settings.defaultDeck.trim()) {
    throw new Error("Default deck is required.");
  }

  if (!settings.ankiConnectUrl.trim()) {
    throw new Error("AnkiConnect URL is required.");
  }
}