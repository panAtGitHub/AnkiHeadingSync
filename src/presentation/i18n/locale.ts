export type PluginLocale = "en" | "zh";

export function resolvePluginLocale(languageCode = getPreferredLanguage()): PluginLocale {
  const normalizedLanguage = languageCode.toLowerCase();
  return normalizedLanguage === "zh" || normalizedLanguage.startsWith("zh-") ? "zh" : "en";
}

export function formatList(locale: PluginLocale, items: string[]): string {
  return items.join(locale === "zh" ? "、" : ", ");
}

function getPreferredLanguage(): string {
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    return navigator.language;
  }

  return "en";
}