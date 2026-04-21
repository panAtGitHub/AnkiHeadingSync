import { resolvePluginLocale, formatList, type PluginLocale } from "./locale";
import { en } from "./messages/en";
import { zh } from "./messages/zh";

type PrimitiveMessageValue = string | number | boolean | undefined;
type MessageParamValue = PrimitiveMessageValue | PrimitiveMessageValue[];

type NestedTranslationKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedTranslationKeys<T[K]>}`
}[keyof T & string];

export type TranslationKey = NestedTranslationKeys<typeof en>;
export type MessageParams = Record<string, MessageParamValue>;

function lookupMessage(dictionary: Record<string, unknown>, key: TranslationKey): string | undefined {
  const segments = key.split(".");
  let current: unknown = dictionary;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params: MessageParams | undefined, locale: PluginLocale): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      return "";
    }

    if (Array.isArray(value)) {
      return formatList(locale, value.filter((entry): entry is PrimitiveMessageValue => entry !== undefined).map((entry) => String(entry)));
    }

    return String(value);
  });
}

export function t(key: TranslationKey, params?: MessageParams): string {
  const locale = resolvePluginLocale();
  const dictionary = locale === "zh" ? zh : en;
  const template = lookupMessage(dictionary as Record<string, unknown>, key)
    ?? lookupMessage(en as Record<string, unknown>, key)
    ?? key;

  return interpolate(template, params, locale);
}

export { formatList, resolvePluginLocale, type PluginLocale };