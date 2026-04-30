import { getLanguage } from "obsidian";

export type PluginLocale = "en" | "zh";

export function resolvePluginLocale(languageCode = getLanguage()): PluginLocale {
  const normalizedLanguage = languageCode.toLowerCase();
  return normalizedLanguage === "zh" || normalizedLanguage.startsWith("zh-") ? "zh" : "en";
}

export function formatList(locale: PluginLocale, items: string[]): string {
  return items.join(locale === "zh" ? "、" : ", ");
}
