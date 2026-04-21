import { formatList, resolvePluginLocale, t, type MessageParams, type TranslationKey } from "@/presentation/i18n";

export interface PluginUserMessage {
  key: TranslationKey;
  params?: MessageParams;
}

export interface RawUserMessage {
  rawMessage: string;
}

export type UserFacingMessage = PluginUserMessage | RawUserMessage;

export type PluginFileFailure =
  | ({ filePath: string } & PluginUserMessage)
  | { filePath: string; rawMessage: string };

interface PluginUserErrorDetails {
  failures?: PluginFileFailure[];
}

export class PluginUserError extends Error {
  readonly userMessage: PluginUserMessage;
  readonly details?: PluginUserErrorDetails;

  constructor(key: TranslationKey, params?: MessageParams, details?: PluginUserErrorDetails) {
    super(key);
    this.name = "PluginUserError";
    this.userMessage = { key, params };
    this.details = details;
  }
}

export function isPluginUserError(value: unknown): value is PluginUserError {
  return value instanceof PluginUserError;
}

export function renderUserFacingMessage(message: UserFacingMessage): string {
  if ("rawMessage" in message) {
    return message.rawMessage;
  }

  return t(message.key, message.params);
}

export function renderPluginFileFailure(failure: PluginFileFailure): string {
  if ("rawMessage" in failure) {
    return failure.rawMessage;
  }

  return t(failure.key, failure.params);
}

export function renderUserMessage(error: PluginUserError): string {
  const message = renderUserFacingMessage(error.userMessage);

  if (!error.details?.failures?.length) {
    return message;
  }

  const failureLines = error.details.failures
    .map((failure) => `${failure.filePath}: ${renderPluginFileFailure(failure)}`)
    .join("\n");

  return `${message}\n${failureLines}`;
}

export function toUserFacingMessage(error: unknown, fallbackKey: TranslationKey, fallbackParams?: MessageParams): UserFacingMessage {
  if (isPluginUserError(error)) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    return { rawMessage: error.message };
  }

  return { key: fallbackKey, params: fallbackParams };
}

export function renderUnknownUserFacingError(error: unknown, fallbackKey: TranslationKey): string {
  if (isPluginUserError(error)) {
    return renderUserMessage(error);
  }

  return renderUserFacingMessage(toUserFacingMessage(error, fallbackKey));
}

export function toPluginFileFailure(filePath: string, error: unknown): PluginFileFailure {
  if (isPluginUserError(error)) {
    return {
      filePath,
      ...error.userMessage,
    };
  }

  if (error instanceof Error) {
    return {
      filePath,
      rawMessage: error.message,
    };
  }

  return {
    filePath,
    rawMessage: String(error),
  };
}

export function renderPluginFileFailuresInline(failures: PluginFileFailure[]): string {
  const locale = resolvePluginLocale();
  return formatList(
    locale,
    failures.map((failure) => `${failure.filePath} (${renderPluginFileFailure(failure)})`),
  );
}