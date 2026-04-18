export interface AhsMarker {
  cardId: string;
  noteId?: number;
  raw: string;
  lineIndex: number;
}

export type MarkerState = "missing" | "card-only" | "card-and-note";