export type CardType = "basic" | "cloze" | "semantic-qa";

export function isClozeCardType(cardType: CardType): cardType is "cloze" {
  return cardType === "cloze";
}

export function isBasicLikeCardType(cardType: CardType): cardType is "basic" | "semantic-qa" {
  return cardType !== "cloze";
}

export interface RenderedFields {
  title: string;
  body: string;
}

export interface MediaAsset {
  kind: "image" | "audio";
  fileName: string;
  absolutePath: string;
  altText?: string;
}