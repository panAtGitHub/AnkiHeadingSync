export type NoteModelName = string & { readonly __brand: "NoteModelName" };

export function createNoteModelName(value: string): NoteModelName {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Note model name cannot be empty.");
  }

  return normalized as NoteModelName;
}