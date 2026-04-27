import { describe, expect, it } from "vitest";

import { collectClozeNumbers } from "./collectClozeNumbers";

describe("collectClozeNumbers", () => {
  it("collects sequential automatic cloze numbers", () => {
    expect([...collectClozeNumbers({
      bodyMarkdown: "{甲} {乙} {丙}",
      clozeMode: "sequential",
      convertHighlightsToCloze: false,
    })]).toEqual([1, 2, 3]);
  });

  it("collects all-mode automatic cloze numbers as c1 only", () => {
    expect([...collectClozeNumbers({
      bodyMarkdown: "{甲} {乙} {丙}",
      clozeMode: "all",
      convertHighlightsToCloze: false,
    })]).toEqual([1]);
  });

  it("keeps explicit and native cloze numbers while auto-filling the remaining clozes", () => {
    expect([...collectClozeNumbers({
      bodyMarkdown: "{c2:手写} {自动} {{c3::原生}}",
      clozeMode: "all",
      convertHighlightsToCloze: false,
    })].sort((left, right) => left - right)).toEqual([1, 2, 3]);
  });

  it("counts converted highlights with the current cloze mode", () => {
    expect([...collectClozeNumbers({
      bodyMarkdown: "==甲== ==乙==",
      clozeMode: "sequential",
      convertHighlightsToCloze: true,
    })]).toEqual([1, 2]);
  });

  it("ignores cloze-like syntax inside inline code", () => {
    expect([...collectClozeNumbers({
      bodyMarkdown: "`{甲}` `==乙==` {丙}",
      clozeMode: "sequential",
      convertHighlightsToCloze: true,
    })]).toEqual([1]);
  });

  it("ignores cloze-like syntax inside fenced code", () => {
    expect([...collectClozeNumbers({
      bodyMarkdown: [
        "```md",
        "{甲}",
        "==乙==",
        "{{c3::丙}}",
        "```",
        "{丁}",
      ].join("\n"),
      clozeMode: "sequential",
      convertHighlightsToCloze: true,
    })]).toEqual([1]);
  });
});