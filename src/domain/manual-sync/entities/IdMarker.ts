export interface IdMarker {
  noteId: number;
  raw: string;
  lineIndex: number;
}

export type IdMarkerState = "missing" | "present-valid" | "present-invalid";

export type NoteIdSource = "marker" | "state-recovery" | "pending-writeback";