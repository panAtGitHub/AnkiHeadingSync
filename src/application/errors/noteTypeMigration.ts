import { PluginUserError } from "@/application/errors/PluginUserError";

interface NoteTypeMigrationErrorInput {
  noteId: number;
  fromModel: string;
  toModel: string;
  error: unknown;
  location?: string;
}

export function createNoteTypeMigrationError(input: NoteTypeMigrationErrorInput): PluginUserError {
  const reason = normalizeNoteTypeMigrationReason(extractErrorMessage(input.error));

  return new PluginUserError(
    isUnsupportedNoteTypeMigrationError(input.error)
      ? "errors.noteTypeMigration.unsupported"
      : "errors.noteTypeMigration.failed",
    {
      noteId: input.noteId,
      fromModel: input.fromModel,
      toModel: input.toModel,
      reason,
      location: input.location ? ` (${input.location})` : "",
    },
  );
}

export function isUnsupportedNoteTypeMigrationError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes("updatenotemodel")
    && (
      message.includes("unsupported action")
      || message.includes("unknown action")
      || message.includes("not supported")
      || message.includes("unsupported")
    );
}

function normalizeNoteTypeMigrationReason(message: string): string {
  return message.replace(/^AnkiConnect updateNoteModel failed(?: for note \d+(?: to model .+?)?)?:\s*/i, "").trim();
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return String(error);
}