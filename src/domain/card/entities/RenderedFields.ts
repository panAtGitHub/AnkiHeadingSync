export type CardType = "basic" | "cloze";

export function isClozeCardType(cardType: CardType): cardType is "cloze" {
  return cardType === "cloze";
}

export function isBasicLikeCardType(cardType: CardType): cardType is "basic" {
  return cardType === "basic";
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