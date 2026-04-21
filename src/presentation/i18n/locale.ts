import { getLanguage } from "obsidian";

export type PluginLocale = "en" | "zh";

export function resolvePluginLocale(): PluginLocale {
  return getLanguage() === "zh" ? "zh" : "en";
}

export function formatList(locale: PluginLocale, items: string[]): string {
  return items.join(locale === "zh" ? "、" : ", ");
}