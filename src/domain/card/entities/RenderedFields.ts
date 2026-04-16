export type CardType = "basic" | "cloze";

export interface BasicRenderedFields {
  kind: "basic";
  values: {
    front: string;
    back: string;
  };
}

export interface ClozeRenderedFields {
  kind: "cloze";
  values: {
    text: string;
    extra: string;
  };
}

export type RenderedFields = BasicRenderedFields | ClozeRenderedFields;

export interface MediaAsset {
  kind: "image" | "audio";
  fileName: string;
  absolutePath: string;
  altText?: string;
}