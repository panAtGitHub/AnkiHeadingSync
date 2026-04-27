import { describe, expect, it } from "vitest";

import { PluginUserError } from "@/application/errors/PluginUserError";

import {
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
      derivation: {
        mode: "first-pair",
        firstQuestionField: "问题01",
        firstAnswerField: "答案01",
      },
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

    const mapping = service.suggest("QA Group List", ["Stem", "S01_Q", "S01_A", "S02_Q", "S02_A"]);

    expect(mapping.titleField).toBe("Stem");
    expect(mapping.slots).toEqual([
      { index: 1, questionField: "S01_Q", answerField: "S01_A" },
      { index: 2, questionField: "S02_Q", answerField: "S02_A" },
    ]);
  });

  it("derives slots from a selected first pair and stops at the first missing pair", () => {
    const service = new QaGroupFieldMappingService();
    const mapping = service.createMappingFromSelection(
      "问答题（多级列表）",
      ["题目", "问题01", "答案01", "问题02"],
      {
        titleField: "题目",
        firstQuestionField: "问题01",
        firstAnswerField: "答案01",
      },
      1,
    );

    expect(mapping.slots).toEqual([
      { index: 1, questionField: "问题01", answerField: "答案01" },
    ]);
    expect(mapping.derivation).toEqual({
      mode: "first-pair",
      firstQuestionField: "问题01",
      firstAnswerField: "答案01",
    });
    expect(mapping.warnings).toEqual([]);
    expect(mapping.acceptedWarnings).toBeUndefined();
  });

  it("keeps a single slot when the selected first pair does not contain numbers", () => {
    const service = new QaGroupFieldMappingService();

    const mapping = service.createMappingFromSelection(
      "Custom QA Group",
      ["题目", "Question", "Answer"],
      {
        titleField: "题目",
        firstQuestionField: "Question",
        firstAnswerField: "Answer",
      },
      1,
    );

    expect(mapping.slots).toEqual([
      { index: 1, questionField: "Question", answerField: "Answer" },
    ]);
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

  it("rejects selected first pairs whose numbers do not line up", () => {
    const service = new QaGroupFieldMappingService();

    const error = expectPluginUserError(() => {
      service.createMappingFromSelection(
        "问答题（多级列表）",
        ["题目", "问题01", "答案02"],
        {
          titleField: "题目",
          firstQuestionField: "问题01",
          firstAnswerField: "答案02",
        },
      );
    });

    expect(error.userMessage.key).toBe("errors.noteFieldMapping.qaGroupFirstPairNumberMismatch");
  });
});
