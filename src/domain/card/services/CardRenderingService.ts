import MarkdownIt from "markdown-it";

import type { RenderResourceResolver } from "@/domain/card/ports/RenderResourceResolver";
import { hashString } from "@/domain/shared/hash";

import type { Card } from "../entities/Card";
import type { CardDraft } from "../entities/CardDraft";
import type { MediaAsset, RenderedFields } from "../entities/RenderedFields";
import { CardIdentityPolicy } from "../policies/CardIdentityPolicy";
import { createContentHash } from "../value-objects/ContentHash";
import { createNoteModelName } from "../value-objects/NoteModelName";
import { DeckResolutionService } from "./DeckResolutionService";

const markdown = new MarkdownIt({
  breaks: true,
  html: true,
  linkify: true,
});

const INLINE_CODE_PATTERN = /`[^`\n]+`/g;
const FENCED_CODE_PATTERN = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const DISPLAY_MATH_PATTERN = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g;
const INLINE_MATH_PATTERN = /(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$/g;
const ANKI_MATH_PATTERN = /(\\\[[\s\S]*?\\\])|(\\\([\s\S]*?\\\))/g;
const HIGHLIGHT_PATTERN = /==(.+?)==/g;
const CLOZE_PATTERN = /(?:(?<!{){(?:c?(\d+)[:|])?(?!{))((?:[^\n][\n]?)+?)(?:(?<!})}(?!}))/g;
const EMBED_PATTERN = /!\[\[([^\]]+)\]\]/g;
const WIKILINK_PATTERN = /(?<!!)\[\[([^\]]+)\]\]/g;

export interface CardRenderingContext {
  defaultDeck: string;
  qaNoteType: string;
  clozeNoteType: string;
  addObsidianBacklink: boolean;
  convertHighlightsToCloze: boolean;
  resourceResolver: RenderResourceResolver;
}

interface RenderResult {
  html: string;
  media: MediaAsset[];
}

export class CardRenderingService {
  constructor(
    private readonly identityPolicy = new CardIdentityPolicy(),
    private readonly deckResolutionService = new DeckResolutionService(),
  ) {}

  render(draft: CardDraft, context: CardRenderingContext): Card {
    const deck = this.deckResolutionService.resolve(draft.deckHint, context.defaultDeck);
    const noteModel = createNoteModelName(draft.type === "basic" ? context.qaNoteType : context.clozeNoteType);
    const headingResult = this.renderMarkdown(draft.heading, draft, context, false, true);
    const bodyResult = this.renderMarkdown(draft.bodyMarkdown, draft, context, draft.type === "cloze", false);
    const backlinkHtml = context.addObsidianBacklink
      ? `<p><a class="anki-heading-sync-backlink" href="${escapeHtml(context.resourceResolver.createBacklink(draft.source))}">Open in Obsidian</a></p>`
      : "";

    const renderedFields: RenderedFields =
      draft.type === "basic"
        ? {
            kind: "basic",
            values: {
              front: headingResult.html,
              back: bodyResult.html + backlinkHtml,
            },
          }
        : {
            kind: "cloze",
            values: {
              text: bodyResult.html,
              extra: headingResult.html + backlinkHtml,
            },
          };

    const fields = { ...renderedFields.values };
    const contentHash = createContentHash(
      hashString(
        JSON.stringify({
          deck,
          fields,
          heading: draft.heading,
          noteModel,
          sourcePath: draft.source.filePath,
          type: draft.type,
        }),
      ),
    );

    return {
      key: this.identityPolicy.create(draft.source, draft.type),
      source: draft.source,
      type: draft.type,
      heading: draft.heading,
      bodyMarkdown: draft.bodyMarkdown,
      deck,
      noteModel,
      tags: [],
      renderedFields,
      fields,
      contentHash,
      media: dedupeMedia([...headingResult.media, ...bodyResult.media]),
    };
  }

  private renderMarkdown(
    markdownText: string,
    draft: CardDraft,
    context: CardRenderingContext,
    cloze: boolean,
    inline: boolean,
  ): RenderResult {
    const protectedBlocks = protectSegments(markdownText, FENCED_CODE_PATTERN, "FENCED_CODE");
    const protectedInline = protectSegments(protectedBlocks.text, INLINE_CODE_PATTERN, "INLINE_CODE");
    let transformed = protectedInline.text;
    const media: MediaAsset[] = [];
    let nextClozeIndex = 1;

    transformed = transformed.replace(DISPLAY_MATH_PATTERN, (_match, content: string) => `\\[${content.trim()}\\]`);
    transformed = transformed.replace(INLINE_MATH_PATTERN, (_match, content: string) => `\\(${content.trim()}\\)`);

    if (cloze && context.convertHighlightsToCloze) {
      transformed = transformed.replace(HIGHLIGHT_PATTERN, "{$1}");
    }

    if (cloze) {
      transformed = transformed.replace(CLOZE_PATTERN, (_match, explicitIndex: string | undefined, content: string) => {
        const clozeIndex = explicitIndex ? Number(explicitIndex) : nextClozeIndex++;
        return `{{c${clozeIndex}::${content}}}`;
      });
    }

    transformed = transformed.replace(EMBED_PATTERN, (_match, rawTarget: string) => {
      const resolvedEmbed = context.resourceResolver.resolveEmbed(rawTarget, draft.source.filePath);

      if (!resolvedEmbed) {
        return _match;
      }

      media.push({
        kind: resolvedEmbed.kind,
        fileName: resolvedEmbed.fileName,
        absolutePath: resolvedEmbed.absolutePath,
        altText: resolvedEmbed.altText,
      });

      if (resolvedEmbed.kind === "audio") {
        return `[sound:${resolvedEmbed.fileName}]`;
      }

      return `<img src="${escapeHtml(resolvedEmbed.fileName)}" alt="${escapeHtml(resolvedEmbed.altText ?? resolvedEmbed.fileName)}">`;
    });

    transformed = transformed.replace(WIKILINK_PATTERN, (_match, rawTarget: string) => {
      const resolvedLink = context.resourceResolver.resolveWikiLink(rawTarget, draft.source.filePath);

      if (!resolvedLink) {
        return _match;
      }

      return `<a href="${escapeHtml(resolvedLink.url)}">${escapeHtml(resolvedLink.displayText)}</a>`;
    });

    transformed = transformed.replace(HIGHLIGHT_PATTERN, "<mark>$1</mark>");
    const protectedMath = protectSegments(transformed, ANKI_MATH_PATTERN, "MATH");
    transformed = protectedMath.text;
    transformed = protectedInline.restore(transformed);
    transformed = protectedBlocks.restore(transformed);

    const renderedHtml = (inline ? markdown.renderInline(transformed) : markdown.render(transformed)).trim();

    return {
      html: protectedMath.restore(renderedHtml, escapeHtml),
      media,
    };
  }
}

function protectSegments(
  text: string,
  pattern: RegExp,
  prefix: string,
): { text: string; restore: (value: string, formatter?: (segment: string) => string) => string } {
  const matches: string[] = [];
  const nextText = text.replace(pattern, (segment) => {
    const token = `@@${prefix}_${matches.length}@@`;
    matches.push(segment);
    return token;
  });

  return {
    text: nextText,
    restore: (value: string, formatter = (segment: string) => segment) =>
      matches.reduce((current, segment, index) => current.split(`@@${prefix}_${index}@@`).join(formatter(segment)), value),
  };
}

function dedupeMedia(media: MediaAsset[]): MediaAsset[] {
  const seen = new Set<string>();

  return media.filter((asset) => {
    const key = `${asset.kind}:${asset.absolutePath}:${asset.fileName}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}