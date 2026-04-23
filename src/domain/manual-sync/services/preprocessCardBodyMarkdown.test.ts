import { describe, expect, it } from "vitest";

import { isPureTagLine, preprocessCardBodyMarkdown } from "./preprocessCardBodyMarkdown";

describe("preprocessCardBodyMarkdown", () => {
  it("deletes pure tag lines anywhere in the body and merges extra blank lines", () => {
    expect(preprocessCardBodyMarkdown([
      "第一段",
      "",
      "#项目A #重点/案例",
      "",
      "",
      "第二段",
      "#3地区",
      "",
      "第三段",
    ].join("\n"), false)).toBe([
      "第一段",
      "",
      "第二段",
      "",
      "第三段",
    ].join("\n"));
  });

  it("preserves inline tags and prose lines with tags", () => {
    expect(preprocessCardBodyMarkdown([
      "这是 #3地区 的案例",
      "标签：#项目A",
      "## 标题 #项目A",
    ].join("\n"), false)).toBe([
      "这是 #3地区 的案例",
      "标签：#项目A",
      "## 标题 #项目A",
    ].join("\n"));
  });

  it("keeps the original body when the setting is enabled", () => {
    const markdown = [
      "#项目A #重点/案例",
      "",
      "正文",
    ].join("\n");

    expect(preprocessCardBodyMarkdown(markdown, true)).toBe(markdown);
  });

  it("recognizes only whole pure-tag lines", () => {
    expect(isPureTagLine("  #3地区 #📖/一人公司  ")).toBe(true);
    expect(isPureTagLine("标签：#3地区")).toBe(false);
    expect(isPureTagLine("这是 #3地区 的案例")).toBe(false);
    expect(isPureTagLine("#3地区，#案例")).toBe(false);
  });
});