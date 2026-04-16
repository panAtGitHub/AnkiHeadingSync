export type CardType = "basic" | "cloze";

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