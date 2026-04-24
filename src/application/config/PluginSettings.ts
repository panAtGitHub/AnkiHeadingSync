import type { NoteModelFieldMapping } from "@/application/config/NoteModelFieldMapping";
import { QA_GROUP_MODEL_NAME } from "@/application/config/ManagedNoteModels";
import { PluginUserError } from "@/application/errors/PluginUserError";

export type ScopeMode = "all" | "include" | "exclude";
export type FileDeckInsertLocation = "yaml" | "body";
export type FolderDeckMode = "off" | "folder" | "folder-and-file";
export type CardAnswerCutoffMode = "heading-block" | "double-blank-lines";
export type ObsidianBacklinkPlacement = "question-last-line" | "answer-first-line" | "answer-last-line";
export const CARD_TYPE_CONFIG_IDS = ["basic", "qa-group", "cloze", "semantic-qa"] as const;
export type CardTypeConfigId = (typeof CARD_TYPE_CONFIG_IDS)[number];

export interface CardTypeConfig {
  enabled: boolean;
  headingLevel: number;
  extraMarker: string;
  noteType: string;
}

export type CardTypeConfigs = Record<CardTypeConfigId, CardTypeConfig>;

export interface AnkiModelFieldCacheEntry {
  fieldNames: string[];
  loadedAt: number;
}

export type AnkiModelFieldCache = Record<string, AnkiModelFieldCacheEntry>;

export const DEFAULT_OBSIDIAN_BACKLINK_LABEL = "Open in Obsidian";

const DEFAULT_BASIC_HEADING_LEVEL = 4;
const DEFAULT_CLOZE_HEADING_LEVEL = 5;
const DEFAULT_BASIC_NOTE_TYPE = "Basic";
const DEFAULT_CLOZE_NOTE_TYPE = "Cloze";
const DEFAULT_SEMANTIC_QA_NOTE_TYPE = "Semantic QA";
const DEFAULT_QA_GROUP_MARKER = "#anki-list";
const DEFAULT_SEMANTIC_QA_MARKER = "#anki-list-qa";

export interface PluginSettings {
  qaHeadingLevel: number;
  clozeHeadingLevel: number;
  cardAnswerCutoffMode: CardAnswerCutoffMode;
  qaGroupMarker: string;
  qaNoteType: string;
  clozeNoteType: string;
  semanticQaMarker: string;
  semanticQaNoteType: string;
  cardTypeConfigs: CardTypeConfigs;
  noteFieldMappings: Record<string, NoteModelFieldMapping>;
  ankiNoteTypeCache: string[];
  ankiModelFieldCache: AnkiModelFieldCache;
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
  obsidianBacklinkLabel: string;
  obsidianBacklinkPlacement: ObsidianBacklinkPlacement;
  convertHighlightsToCloze: boolean;
  syncObsidianTagsToAnki: boolean;
  keepPureTagLinesInCardBody: boolean;
  ankiConnectUrl: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  qaHeadingLevel: DEFAULT_BASIC_HEADING_LEVEL,
  clozeHeadingLevel: DEFAULT_CLOZE_HEADING_LEVEL,
  cardAnswerCutoffMode: "heading-block",
  qaGroupMarker: DEFAULT_QA_GROUP_MARKER,
  qaNoteType: DEFAULT_BASIC_NOTE_TYPE,
  clozeNoteType: DEFAULT_CLOZE_NOTE_TYPE,
  semanticQaMarker: DEFAULT_SEMANTIC_QA_MARKER,
  semanticQaNoteType: DEFAULT_SEMANTIC_QA_NOTE_TYPE,
  cardTypeConfigs: createDefaultCardTypeConfigs(),
  noteFieldMappings: {},
  ankiNoteTypeCache: [],
  ankiModelFieldCache: {},
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
  obsidianBacklinkLabel: DEFAULT_OBSIDIAN_BACKLINK_LABEL,
  obsidianBacklinkPlacement: "answer-last-line",
  convertHighlightsToCloze: true,
  syncObsidianTagsToAnki: true,
  keepPureTagLinesInCardBody: true,
  ankiConnectUrl: "http://127.0.0.1:8765",
};

export const SEMANTIC_QA_MARKER_REGEXP = /^#[^\s#]+$/;

export function isValidHashtagMarker(marker: string): boolean {
  return SEMANTIC_QA_MARKER_REGEXP.test(marker);
}

export function isValidSemanticQaMarker(marker: string): boolean {
  return isValidHashtagMarker(marker);
}

export function normalizeObsidianBacklinkLabel(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return DEFAULT_OBSIDIAN_BACKLINK_LABEL;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : DEFAULT_OBSIDIAN_BACKLINK_LABEL;
}

export function normalizePluginSettings(settings: PluginSettings): PluginSettings {
  const cardTypeConfigs = mergeCardTypeConfigs(settings.cardTypeConfigs, settings);
  const legacySettings = deriveLegacySettings(cardTypeConfigs);

  return {
    ...settings,
    ...legacySettings,
    cardTypeConfigs,
    ankiNoteTypeCache: normalizeAnkiNoteTypeCache(settings.ankiNoteTypeCache),
    ankiModelFieldCache: normalizeAnkiModelFieldCache(settings.ankiModelFieldCache),
    obsidianBacklinkLabel: normalizeObsidianBacklinkLabel(settings.obsidianBacklinkLabel),
  };
}

export function mergePluginSettings(settings?: Partial<PluginSettings> | null): PluginSettings {
  const partialSettings = settings ?? {};
  const cardTypeConfigs = mergeCardTypeConfigs(partialSettings.cardTypeConfigs, partialSettings);

  return normalizePluginSettings({
    ...DEFAULT_SETTINGS,
    ...partialSettings,
    cardTypeConfigs,
    noteFieldMappings: partialSettings.noteFieldMappings ?? DEFAULT_SETTINGS.noteFieldMappings,
    ankiModelFieldCache: partialSettings.ankiModelFieldCache ?? DEFAULT_SETTINGS.ankiModelFieldCache,
    includeFolders: partialSettings.includeFolders ?? DEFAULT_SETTINGS.includeFolders,
    excludeFolders: partialSettings.excludeFolders ?? DEFAULT_SETTINGS.excludeFolders,
  });
}

export function validatePluginSettings(settings: PluginSettings): void {
  validateCardTypeConfigs(settings.cardTypeConfigs);

  if (settings.cardAnswerCutoffMode !== "heading-block" && settings.cardAnswerCutoffMode !== "double-blank-lines") {
    throw new PluginUserError("errors.settings.cardAnswerCutoffModeInvalid");
  }

  validateNoteFieldMappings(settings.noteFieldMappings);
  validateAnkiNoteTypeCache(settings.ankiNoteTypeCache);
  validateAnkiModelFieldCache(settings.ankiModelFieldCache);

  if (!settings.defaultDeck.trim()) {
    throw new PluginUserError("errors.settings.defaultDeckRequired");
  }

  if (typeof settings.fileDeckEnabled !== "boolean") {
    throw new PluginUserError("errors.settings.fileDeckEnabledBoolean");
  }

  if (typeof settings.syncObsidianTagsToAnki !== "boolean") {
    throw new PluginUserError("errors.settings.syncObsidianTagsToAnkiBoolean");
  }

  if (typeof settings.keepPureTagLinesInCardBody !== "boolean") {
    throw new PluginUserError("errors.settings.keepPureTagLinesInCardBodyBoolean");
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

  if (
    settings.obsidianBacklinkPlacement !== "question-last-line"
    && settings.obsidianBacklinkPlacement !== "answer-first-line"
    && settings.obsidianBacklinkPlacement !== "answer-last-line"
  ) {
    throw new PluginUserError("errors.settings.obsidianBacklinkPlacementInvalid");
  }

  validateFolderList(settings.includeFolders, "include");
  validateFolderList(settings.excludeFolders, "exclude");

  if (!settings.ankiConnectUrl.trim()) {
    throw new PluginUserError("errors.settings.ankiConnectUrlRequired");
  }
}

function validateAnkiNoteTypeCache(ankiNoteTypeCache: string[]): void {
  if (!Array.isArray(ankiNoteTypeCache)) {
    throw new PluginUserError("errors.settings.ankiNoteTypeCacheArray");
  }

  for (const noteType of ankiNoteTypeCache) {
    if (typeof noteType !== "string") {
      throw new PluginUserError("errors.settings.ankiNoteTypeCacheStrings");
    }
  }
}

function validateAnkiModelFieldCache(ankiModelFieldCache: AnkiModelFieldCache): void {
  if (!ankiModelFieldCache || typeof ankiModelFieldCache !== "object" || Array.isArray(ankiModelFieldCache)) {
    throw new PluginUserError("errors.settings.ankiModelFieldCacheObject");
  }

  for (const cacheEntry of Object.values(ankiModelFieldCache)) {
    if (!cacheEntry || typeof cacheEntry !== "object" || Array.isArray(cacheEntry)) {
      throw new PluginUserError("errors.settings.ankiModelFieldCacheEntryObject");
    }

    if (!Array.isArray(cacheEntry.fieldNames)) {
      throw new PluginUserError("errors.settings.ankiModelFieldCacheFieldNamesArray");
    }

    for (const fieldName of cacheEntry.fieldNames) {
      if (typeof fieldName !== "string") {
        throw new PluginUserError("errors.settings.ankiModelFieldCacheFieldNamesStrings");
      }
    }

    if (!Number.isFinite(cacheEntry.loadedAt)) {
      throw new PluginUserError("errors.settings.ankiModelFieldCacheLoadedAt");
    }
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

export function validateCardTypeConfigs(cardTypeConfigs: CardTypeConfigs): void {
  if (!cardTypeConfigs || typeof cardTypeConfigs !== "object" || Array.isArray(cardTypeConfigs)) {
    throw new PluginUserError("errors.settings.cardTypeConfigsObject");
  }

  const emptyDefaultsByHeading = new Map<number, CardTypeConfigId[]>();

  for (const configId of CARD_TYPE_CONFIG_IDS) {
    const config = (cardTypeConfigs as Partial<CardTypeConfigs>)[configId];
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new PluginUserError("errors.settings.cardTypeConfigsObject");
    }

    if (typeof config.enabled !== "boolean") {
      throw new PluginUserError("errors.settings.cardTypeEnabledBoolean");
    }

    if (!Number.isInteger(config.headingLevel) || config.headingLevel < 1 || config.headingLevel > 6) {
      throw new PluginUserError("errors.settings.headingLevelsRange");
    }

    if (typeof config.extraMarker !== "string") {
      throw new PluginUserError("errors.settings.cardTypeExtraMarkerString");
    }

    if (configId === "basic" && !config.noteType.trim()) {
      throw new PluginUserError("errors.settings.qaNoteTypeRequired");
    }

    if (configId === "qa-group" && !config.noteType.trim()) {
      throw new PluginUserError("errors.settings.qaNoteTypeRequired");
    }

    if (configId === "cloze" && !config.noteType.trim()) {
      throw new PluginUserError("errors.settings.clozeNoteTypeRequired");
    }

    if (configId === "semantic-qa" && !config.noteType.trim()) {
      throw new PluginUserError("errors.settings.semanticQaNoteTypeRequired");
    }

    if (!config.enabled || config.extraMarker.trim().length > 0) {
      continue;
    }

    const defaults = emptyDefaultsByHeading.get(config.headingLevel) ?? [];
    defaults.push(configId);
    emptyDefaultsByHeading.set(config.headingLevel, defaults);
  }

  for (const [headingLevel, defaults] of emptyDefaultsByHeading.entries()) {
    if (defaults.length > 1) {
      throw new PluginUserError("errors.settings.cardTypeDefaultConflict", { headingLevel });
    }
  }
}

function validateNoteFieldMappings(noteFieldMappings: Record<string, NoteModelFieldMapping>): void {
  if (!noteFieldMappings || typeof noteFieldMappings !== "object" || Array.isArray(noteFieldMappings)) {
    throw new PluginUserError("errors.settings.noteFieldMappingsObject");
  }

  for (const mapping of Object.values(noteFieldMappings)) {
    if (mapping.cardType !== "basic" && mapping.cardType !== "qa-group" && mapping.cardType !== "cloze" && mapping.cardType !== "semantic-qa") {
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

function createDefaultCardTypeConfigs(): CardTypeConfigs {
  return {
    basic: {
      enabled: true,
      headingLevel: DEFAULT_BASIC_HEADING_LEVEL,
      extraMarker: "",
      noteType: DEFAULT_BASIC_NOTE_TYPE,
    },
    "qa-group": {
      enabled: true,
      headingLevel: DEFAULT_BASIC_HEADING_LEVEL,
      extraMarker: DEFAULT_QA_GROUP_MARKER,
      noteType: QA_GROUP_MODEL_NAME,
    },
    cloze: {
      enabled: true,
      headingLevel: DEFAULT_CLOZE_HEADING_LEVEL,
      extraMarker: "",
      noteType: DEFAULT_CLOZE_NOTE_TYPE,
    },
    "semantic-qa": {
      enabled: true,
      headingLevel: DEFAULT_BASIC_HEADING_LEVEL,
      extraMarker: DEFAULT_SEMANTIC_QA_MARKER,
      noteType: DEFAULT_SEMANTIC_QA_NOTE_TYPE,
    },
  };
}

function createLegacyBackfilledCardTypeConfigs(settings: Partial<PluginSettings>): CardTypeConfigs {
  const defaults = createDefaultCardTypeConfigs();

  return {
    basic: {
      ...defaults.basic,
      headingLevel: sanitizeHeadingLevel(settings.qaHeadingLevel, defaults.basic.headingLevel),
      noteType: sanitizeNoteType(settings.qaNoteType, defaults.basic.noteType),
    },
    "qa-group": {
      ...defaults["qa-group"],
      headingLevel: sanitizeHeadingLevel(settings.qaHeadingLevel, defaults["qa-group"].headingLevel),
      extraMarker: sanitizeMarker(settings.qaGroupMarker, defaults["qa-group"].extraMarker),
      noteType: sanitizeNoteType(settings.cardTypeConfigs?.["qa-group"]?.noteType ?? QA_GROUP_MODEL_NAME, defaults["qa-group"].noteType),
    },
    cloze: {
      ...defaults.cloze,
      headingLevel: sanitizeHeadingLevel(settings.clozeHeadingLevel, defaults.cloze.headingLevel),
      noteType: sanitizeNoteType(settings.clozeNoteType, defaults.cloze.noteType),
    },
    "semantic-qa": {
      ...defaults["semantic-qa"],
      headingLevel: sanitizeHeadingLevel(settings.qaHeadingLevel, defaults["semantic-qa"].headingLevel),
      extraMarker: sanitizeMarker(settings.semanticQaMarker, defaults["semantic-qa"].extraMarker),
      noteType: sanitizeNoteType(settings.semanticQaNoteType, defaults["semantic-qa"].noteType),
    },
  };
}

function mergeCardTypeConfigs(
  rawCardTypeConfigs: Partial<Record<CardTypeConfigId, Partial<CardTypeConfig>>> | null | undefined,
  legacySettings: Partial<PluginSettings>,
): CardTypeConfigs {
  const legacyBackfilledConfigs = createLegacyBackfilledCardTypeConfigs(legacySettings);
  const nextConfigs = {} as CardTypeConfigs;

  for (const configId of CARD_TYPE_CONFIG_IDS) {
    const rawConfig = rawCardTypeConfigs?.[configId];
    const fallbackConfig = legacyBackfilledConfigs[configId];
    const mergedConfig = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
      ? { ...fallbackConfig, ...rawConfig }
      : fallbackConfig;

    nextConfigs[configId] = {
      enabled: typeof mergedConfig.enabled === "boolean" ? mergedConfig.enabled : fallbackConfig.enabled,
      headingLevel: sanitizeHeadingLevel(mergedConfig.headingLevel, fallbackConfig.headingLevel),
      extraMarker: sanitizeMarker(mergedConfig.extraMarker, fallbackConfig.extraMarker),
      noteType: sanitizeNoteType(mergedConfig.noteType, fallbackConfig.noteType),
    };
  }

  return nextConfigs;
}

function deriveLegacySettings(cardTypeConfigs: CardTypeConfigs): Pick<PluginSettings, "qaHeadingLevel" | "clozeHeadingLevel" | "qaGroupMarker" | "qaNoteType" | "clozeNoteType" | "semanticQaMarker" | "semanticQaNoteType"> {
  return {
    qaHeadingLevel: cardTypeConfigs.basic.headingLevel,
    clozeHeadingLevel: cardTypeConfigs.cloze.headingLevel,
    qaGroupMarker: cardTypeConfigs["qa-group"].extraMarker,
    qaNoteType: cardTypeConfigs.basic.noteType,
    clozeNoteType: cardTypeConfigs.cloze.noteType,
    semanticQaMarker: cardTypeConfigs["semantic-qa"].extraMarker,
    semanticQaNoteType: cardTypeConfigs["semantic-qa"].noteType,
  };
}

function sanitizeHeadingLevel(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6 ? value : fallback;
}

function sanitizeMarker(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function sanitizeNoteType(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : fallback;
}

function normalizeAnkiNoteTypeCache(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const noteTypeSet = new Set<string>();
  for (const noteType of value) {
    if (typeof noteType !== "string") {
      continue;
    }

    const trimmedNoteType = noteType.trim();
    if (trimmedNoteType.length > 0) {
      noteTypeSet.add(trimmedNoteType);
    }
  }

  return [...noteTypeSet].sort((left, right) => left.localeCompare(right));
}

function normalizeAnkiModelFieldCache(value: unknown): AnkiModelFieldCache {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalizedEntries = Object.entries(value).flatMap(([modelName, cacheEntry]) => {
    const trimmedModelName = modelName.trim();
    if (trimmedModelName.length === 0 || !cacheEntry || typeof cacheEntry !== "object" || Array.isArray(cacheEntry)) {
      return [];
    }

    const entry = cacheEntry as Partial<AnkiModelFieldCacheEntry>;
    const loadedAt = typeof entry.loadedAt === "number" && Number.isFinite(entry.loadedAt) ? entry.loadedAt : 0;
    return [[trimmedModelName, {
      fieldNames: normalizeModelFieldNames(entry.fieldNames),
      loadedAt,
    }] as const];
  });

  normalizedEntries.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(normalizedEntries);
}

function normalizeModelFieldNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedFieldNames: string[] = [];
  const seenFieldNames = new Set<string>();

  for (const fieldName of value) {
    if (typeof fieldName !== "string") {
      continue;
    }

    const trimmedFieldName = fieldName.trim();
    if (trimmedFieldName.length === 0 || seenFieldNames.has(trimmedFieldName)) {
      continue;
    }

    seenFieldNames.add(trimmedFieldName);
    normalizedFieldNames.push(trimmedFieldName);
  }

  return normalizedFieldNames;
}
