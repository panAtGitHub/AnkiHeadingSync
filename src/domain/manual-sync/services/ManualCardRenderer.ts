import MarkdownIt from "markdown-it";

import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";
import type { PlannedCard } from "@/domain/manual-sync/value-objects/ManualSyncPlan";
import type { MediaAsset } from "@/domain/card/entities/RenderedFields";
import type { RenderedSyncCard } from "@/domain/manual-sync/entities/RenderedSyncCard";
import { applyObsidianBacklinkPlacement, renderObsidianBacklinkAnchor } from "@/domain/shared/renderObsidianBacklink";

import { preprocessCardBodyMarkdown } from "./preprocessCardBodyMarkdown";
import { renderObsidianTagChipsInHtml } from "./renderObsidianTagChips";

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

export interface ManualCardRenderContext {
  addObsidianBacklink: boolean;
  obsidianBacklinkLabel: string;
  obsidianBacklinkPlacement: "question-last-line" | "answer-first-line" | "answer-last-line";
  convertHighlightsToCloze: boolean;
  keepPureTagLinesInCardBody: boolean;
  resourceResolver: ManualSyncVaultGateway;
}

interface RenderResult {
  html: string;
  media: MediaAsset[];
}

export class ManualCardRenderer {
  render(plannedCard: PlannedCard, context: ManualCardRenderContext): RenderedSyncCard {
    const headingResult = this.renderMarkdown(plannedCard.card.heading, plannedCard, context, false, true);
    const bodyResult = this.renderMarkdown(
      plannedCard.card.bodyMarkdown,
      plannedCard,
      context,
      plannedCard.card.cardType === "cloze",
      false,
    );
    const backlinkAnchor = context.addObsidianBacklink
      ? renderObsidianBacklinkAnchor({
          href: context.resourceResolver.createBacklink({
          filePath: plannedCard.card.filePath,
          sourceContent: plannedCard.card.sourceContent,
          headingLine: plannedCard.card.blockStartLine,
          blockStartLine: plannedCard.card.blockStartLine,
          bodyStartLine: plannedCard.card.bodyStartLine,
          blockEndLine: plannedCard.card.blockEndLine,
          contentEndLine: plannedCard.card.contentEndLine,
          markerLine: plannedCard.card.markerLine,
          headingLevel: plannedCard.card.headingLevel,
          headingText: plannedCard.card.backlinkHeadingText,
          }),
          label: context.obsidianBacklinkLabel,
        })
      : "";
    const renderedFields = backlinkAnchor
      ? applyObsidianBacklinkPlacement(
          {
            title: headingResult.html,
            body: bodyResult.html,
          },
          backlinkAnchor,
          context.obsidianBacklinkPlacement,
        )
      : {
          title: headingResult.html,
          body: bodyResult.html,
        };

    return {
      card: plannedCard.card,
      noteId: plannedCard.noteId,
      deck: plannedCard.deck,
      noteModel: plannedCard.noteModel,
      renderConfigHash: plannedCard.renderConfigHash,
      renderedFields,
      media: dedupeMedia([...headingResult.media, ...bodyResult.media]),
    };
  }

  private renderMarkdown(
    markdownText: string,
    plannedCard: PlannedCard,
    context: ManualCardRenderContext,
    cloze: boolean,
    inline: boolean,
  ): RenderResult {
    const sourceMarkdown = inline ? markdownText : preprocessCardBodyMarkdown(markdownText, context.keepPureTagLinesInCardBody);
    const protectedBlocks = protectSegments(sourceMarkdown, FENCED_CODE_PATTERN, "FENCED_CODE");
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
      const resolvedEmbed = context.resourceResolver.resolveEmbed(rawTarget, plannedCard.card.filePath);

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
      const resolvedLink = context.resourceResolver.resolveWikiLink(rawTarget, plannedCard.card.filePath);

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
    const restoredHtml = protectedMath.restore(renderedHtml, escapeHtml);

    return {
      html: inline ? restoredHtml : renderObsidianTagChipsInHtml(restoredHtml),
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