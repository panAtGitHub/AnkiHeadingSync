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
    obsidianBacklinkLabel: "Open in Obsidian",
    obsidianBacklinkPlacement: "answer-last-line",
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

  it("keeps the default backlink behavior at the end of the answer body", () => {
    const rendered = renderer.render(createPlannedCard(), {
      ...baseContext,
      addObsidianBacklink: true,
    });

    expect(rendered.renderedFields.title).toBe("标题");
    expect(rendered.renderedFields.body).toContain('<p><a class="anki-heading-sync-backlink" href="obsidian://open?vault=Vault&amp;file=notes/example.md#标题">Open in Obsidian</a></p>');
  });

  it("escapes a custom backlink label", () => {
    const rendered = renderer.render(createPlannedCard({ heading: 'Title & "Quote"' }), {
      ...baseContext,
      addObsidianBacklink: true,
      obsidianBacklinkLabel: '<Open & "Obsidian">',
    });

    expect(rendered.renderedFields.body).toContain('&lt;Open &amp; &quot;Obsidian&quot;&gt;');
    expect(rendered.renderedFields.body).toContain('href="obsidian://open?vault=Vault&amp;file=notes/example.md#Title &amp; &quot;Quote&quot;"');
  });

  it("places the backlink on the last line of the question field when configured", () => {
    const rendered = renderer.render(createPlannedCard(), {
      ...baseContext,
      addObsidianBacklink: true,
      obsidianBacklinkPlacement: "question-last-line",
    });

    expect(rendered.renderedFields.title).toContain('<br><a class="anki-heading-sync-backlink"');
    expect(rendered.renderedFields.body).toBe('<p>正文</p>');
  });

  it("places the backlink at the first line of the answer body when configured", () => {
    const rendered = renderer.render(createPlannedCard(), {
      ...baseContext,
      addObsidianBacklink: true,
      obsidianBacklinkPlacement: "answer-first-line",
    });

    expect(rendered.renderedFields.body).toMatch(/^<p><a class="anki-heading-sync-backlink"/);
    expect(rendered.renderedFields.body).toContain('<p>正文</p>');
  });

  it("routes question-last-line backlinks through the title field for cloze cards", () => {
    const rendered = renderer.render(createPlannedCard({ cardType: "cloze" }), {
      ...baseContext,
      addObsidianBacklink: true,
      obsidianBacklinkPlacement: "question-last-line",
    });

    expect(rendered.renderedFields.title).toContain('anki-heading-sync-backlink');
    expect(rendered.renderedFields.body).not.toContain('anki-heading-sync-backlink');
  });

  it("numbers unnumbered clozes sequentially for the sequential variant", () => {
    const rendered = renderer.render(createPlannedCard({
      cardType: "cloze",
      clozeMode: "sequential",
      bodyMarkdown: "{甲} {乙} {丙}",
    }), baseContext);

    expect(rendered.renderedFields.body).toContain("{{c1::甲}} {{c2::乙}} {{c3::丙}}");
  });

  it("numbers unnumbered clozes as c1 for the all-cloze variant", () => {
    const rendered = renderer.render(createPlannedCard({
      cardType: "cloze",
      clozeMode: "all",
      bodyMarkdown: "{甲} {乙} {丙}",
    }), baseContext);

    expect(rendered.renderedFields.body).toContain("{{c1::甲}} {{c1::乙}} {{c1::丙}}");
  });

  it("preserves handwritten and native cloze numbers while auto-filling the remaining clozes", () => {
    const rendered = renderer.render(createPlannedCard({
      cardType: "cloze",
      clozeMode: "all",
      bodyMarkdown: "{c2:手写} {自动} {{c3::原生}}",
    }), baseContext);

    expect(rendered.renderedFields.body).toContain("{{c2::手写}}");
    expect(rendered.renderedFields.body).toContain("{{c1::自动}}");
    expect(rendered.renderedFields.body).toContain("{{c3::原生}}");
  });

  it("does not render backlinks when the toggle is disabled", () => {
    const rendered = renderer.render(createPlannedCard(), {
      ...baseContext,
      addObsidianBacklink: false,
      obsidianBacklinkLabel: "Custom Label",
      obsidianBacklinkPlacement: "question-last-line",
    });

    expect(rendered.renderedFields.title).not.toContain('anki-heading-sync-backlink');
    expect(rendered.renderedFields.body).not.toContain('anki-heading-sync-backlink');
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
      clozeMode: overrides.clozeMode,
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
