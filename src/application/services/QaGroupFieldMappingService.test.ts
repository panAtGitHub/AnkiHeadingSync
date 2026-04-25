import { describe, expect, it } from "vitest";

import { PluginUserError } from "@/application/errors/PluginUserError";

import {
  areQaGroupWarningsAccepted,
  parseQaGroupFieldWarning,
  QaGroupFieldMappingService,
} from "./QaGroupFieldMappingService";

function expectPluginUserError(action: () => void): PluginUserError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PluginUserError);
    return error as PluginUserError;
  }

  throw new Error("Expected PluginUserError");
}

describe("QaGroupFieldMappingService", () => {
  it("detects a preferred title field and continuous Chinese QA slots", () => {
    const service = new QaGroupFieldMappingService();

    const mapping = service.suggest("问答题（多级列表）", ["题目", "问题01", "答案01", "问题02", "答案02"], 123);

    expect(mapping).toEqual({
      cardType: "qa-group",
      modelName: "问答题（多级列表）",
      loadedFieldNames: ["题目", "问题01", "答案01", "问题02", "答案02"],
      titleField: "题目",
      slots: [
        {
          index: 1,
          questionField: "问题01",
          answerField: "答案01",
        },
        {
          index: 2,
          questionField: "问题02",
          answerField: "答案02",
        },
      ],
      warnings: [],
      acceptedWarnings: undefined,
      loadedAt: 123,
    });
  });

  it("keeps a user-selected title field when it still exists", () => {
    const service = new QaGroupFieldMappingService();

    const mapping = service.suggest("问答题（多级列表）", ["题目", "标题", "问题01", "答案01"], 123, undefined, "标题");

    expect(mapping.titleField).toBe("标题");
  });

  it("supports the legacy Stem plus Sxx_Q/Sxx_A shape as a normal user template", () => {
    const service = new QaGroupFieldMappingService();

    const mapping = service.suggest("ObsiAnki QA Group 12", ["Stem", "S01_Q", "S01_A", "S02_Q", "S02_A"]);

    expect(mapping.titleField).toBe("Stem");
    expect(mapping.slots).toEqual([
      { index: 1, questionField: "S01_Q", answerField: "S01_A" },
      { index: 2, questionField: "S02_Q", answerField: "S02_A" },
    ]);
  });

  it("records warnings for incomplete tail slots and preserves accepted warnings only when they still match", () => {
    const service = new QaGroupFieldMappingService();
    const mapping = service.suggest("问答题（多级列表）", ["题目", "问题01", "答案01", "问题02"], 1);

    expect(mapping.slots).toEqual([
      { index: 1, questionField: "问题01", answerField: "答案01" },
    ]);
    expect(mapping.warnings).toHaveLength(1);
    expect(parseQaGroupFieldWarning(mapping.warnings[0] ?? "")).toEqual({
      kind: "missing-answer",
      index: 2,
      questionField: "问题02",
      answerField: "答案02",
    });
    expect(mapping.acceptedWarnings).toBeUndefined();

    const accepted = service.suggest("问答题（多级列表）", ["题目", "问题01", "答案01", "问题02"], 1, mapping.warnings);
    expect(accepted.acceptedWarnings).toEqual(accepted.warnings);
    expect(areQaGroupWarningsAccepted(accepted.warnings, accepted.acceptedWarnings)).toBe(true);

    const reset = service.suggest("问答题（多级列表）", ["题目", "问题01", "答案01", "问题02", "答案03"], 1, mapping.warnings);
    expect(reset.acceptedWarnings).toBeUndefined();
  });

  it("leaves the title field unset when no preferred title field exists", () => {
    const service = new QaGroupFieldMappingService();

    const mapping = service.suggest("问答题（多级列表）", ["问题01", "答案01"]);

    expect(mapping.titleField).toBeUndefined();
    expect(mapping.slots).toEqual([
      { index: 1, questionField: "问题01", answerField: "答案01" },
    ]);

    const error = expectPluginUserError(() => service.validateMapping(mapping, mapping.loadedFieldNames));
    expect(error.userMessage.key).toBe("errors.noteFieldMapping.qaGroupMissingTitle");
  });

  it("throws when the first detected slot does not start from one", () => {
    const service = new QaGroupFieldMappingService();

    const error = expectPluginUserError(() => service.suggest("问答题（多级列表）", ["题目", "问题02", "答案02"]));

    expect(error.userMessage.key).toBe("errors.noteFieldMapping.qaGroupNonContinuousSlots");
    expect(error.userMessage.params).toEqual({
      modelName: "问答题（多级列表）",
      firstIndex: 2,
    });
  });
});
