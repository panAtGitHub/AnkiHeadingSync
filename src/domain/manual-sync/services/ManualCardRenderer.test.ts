import { describe, expect, it } from "vitest";

import { FakeManualSyncVaultGateway } from "@/test-support/manualSyncFakes";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";
import type { PlannedCard } from "@/domain/manual-sync/value-objects/ManualSyncPlan";

import { ManualCardRenderer, type ManualCardRenderContext } from "./ManualCardRenderer";

describe("ManualCardRenderer", () => {
  const renderer = new ManualCardRenderer();
  const resourceResolver = new FakeManualSyncVaultGateway();
  const baseContext: ManualCardRenderContext = {
    addObsidianBacklink: false,
    convertHighlightsToCloze: false,
    keepPureTagLinesInCardBody: true,
    resourceResolver,
  };

  it("wraps body tags as chips without touching the title field", () => {
    const rendered = renderer.render(createPlannedCard({
      heading: "标题 #标题标签",
      bodyMarkdown: [
        "第一段 #项目A",
        "#📖/一人公司 #3地区",
      ].join("\n"),
    }), baseContext);

    expect(rendered.renderedFields.title).toContain("标题 #标题标签");
    expect(rendered.renderedFields.title).not.toContain("ahs-ob-tag");
    expect(rendered.renderedFields.body).toContain('class="ahs-ob-tag"');
    expect(rendered.renderedFields.body).toContain('data-tag="项目A"');
    expect(rendered.renderedFields.body).toContain('data-tag="📖::一人公司"');
    expect(rendered.renderedFields.body).toContain('data-tag="3地区"');
    expect(rendered.renderedFields.body).not.toContain('style="');
  });

  it("deletes pure tag lines before rendering remaining inline tags as chips", () => {
    const rendered = renderer.render(createPlannedCard({
      bodyMarkdown: [
        "#项目A #重点/案例",
        "",
        "这是 #3地区 的案例",
      ].join("\n"),
    }), {
      ...baseContext,
      keepPureTagLinesInCardBody: false,
    });

    expect(rendered.renderedFields.body).not.toContain('data-tag="项目A"');
    expect(rendered.renderedFields.body).not.toContain('data-tag="重点::案例"');
    expect(rendered.renderedFields.body).toContain('data-tag="3地区"');
    expect(rendered.renderedFields.body).toContain("这是");
  });

  it("does not wrap tags inside inline code or fenced code blocks", () => {
    const rendered = renderer.render(createPlannedCard({
      bodyMarkdown: [
        "`#行内代码`",
        "",
        "```ts",
        "#代码块",
        "```",
        "",
        "正常 #标签",
      ].join("\n"),
    }), baseContext);

    expect(rendered.renderedFields.body).toContain("<code>#行内代码</code>");
    expect(rendered.renderedFields.body).toContain("#代码块");
    expect(rendered.renderedFields.body).toContain('data-tag="标签"');
    expect(rendered.renderedFields.body).not.toContain('data-tag="行内代码"');
    expect(rendered.renderedFields.body).not.toContain('data-tag="代码块"');
  });
});

function createPlannedCard(overrides: Partial<IndexedCard> = {}): PlannedCard {
  return {
    card: {
      noteId: overrides.noteId,
      syncKey: overrides.syncKey ?? "notes/example.md\u00001\u0000hash-1",
      idMarkerState: overrides.idMarkerState ?? "missing",
      noteIdSource: overrides.noteIdSource,
      filePath: overrides.filePath ?? "notes/example.md",
      cardType: overrides.cardType ?? "basic",
      heading: overrides.heading ?? "标题",
      backlinkHeadingText: overrides.backlinkHeadingText ?? overrides.heading ?? "标题",
      headingLevel: overrides.headingLevel ?? 2,
      bodyMarkdown: overrides.bodyMarkdown ?? "正文",
      blockStartOffset: overrides.blockStartOffset ?? 0,
      blockEndOffset: overrides.blockEndOffset ?? 20,
      blockStartLine: overrides.blockStartLine ?? 1,
      bodyStartLine: overrides.bodyStartLine ?? 2,
      blockEndLine: overrides.blockEndLine ?? 3,
      contentEndLine: overrides.contentEndLine ?? 3,
      markerLine: overrides.markerLine,
      markerIndent: overrides.markerIndent,
      rawBlockText: overrides.rawBlockText ?? "## 标题\n正文",
      rawBlockHash: overrides.rawBlockHash ?? "hash-1",
      deckHint: overrides.deckHint,
      deckHintSource: overrides.deckHintSource,
      deckWarnings: overrides.deckWarnings ?? [],
      tagsHint: overrides.tagsHint ?? [],
      sourceContent: overrides.sourceContent ?? "## 标题\n正文",
    },
    noteId: overrides.noteId,
    deck: "Default",
    noteModel: "Basic",
    renderConfigHash: "render-config",
  };
}
