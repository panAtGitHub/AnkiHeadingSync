import type { QaGroupFieldDerivation, QaGroupFieldMapping, QaGroupSlotMapping } from "@/application/config/NoteModelFieldMapping";
import { PluginUserError } from "@/application/errors/PluginUserError";

type QaGroupFieldWarningKind = "missing-answer" | "missing-question";

interface QaGroupFieldWarningPayload {
  kind: QaGroupFieldWarningKind;
  index: number;
  questionField: string;
  answerField: string;
}

interface QaGroupFieldSelection {
  titleField?: string;
  firstQuestionField?: string;
  firstAnswerField?: string;
}

interface IndexedFieldSegment {
  prefix: string;
  digits: string;
  suffix: string;
  index: number;
}

const TITLE_FIELD_PRIORITY = ["题目", "标题", "正面", "Stem", "Title"] as const;
const QUESTION_FIELD_PATTERNS = [/^问题0*(\d+)$/i, /^Q0*(\d+)$/i, /^S0*(\d+)_Q$/i] as const;
const ANSWER_FIELD_PATTERNS = [/^答案0*(\d+)$/i, /^A0*(\d+)$/i, /^S0*(\d+)_A$/i] as const;

export class QaGroupFieldMappingService {
  suggest(
    modelName: string,
    fieldNames: string[],
    loadedAt = Date.now(),
    acceptedWarnings?: string[],
    preferredTitleField?: string,
  ): QaGroupFieldMapping {
    void acceptedWarnings;

    const titleField = preferredTitleField && fieldNames.includes(preferredTitleField)
      ? preferredTitleField
      : findFieldName(fieldNames, TITLE_FIELD_PRIORITY);
    const firstPair = detectSuggestedFirstPair(fieldNames, modelName);

    return this.createMappingFromSelection(
      modelName,
      fieldNames,
      {
        titleField,
        firstQuestionField: firstPair.questionField,
        firstAnswerField: firstPair.answerField,
      },
      loadedAt,
    );
  }

  createMappingFromSelection(
    modelName: string,
    fieldNames: string[],
    selection: QaGroupFieldSelection,
    loadedAt = Date.now(),
  ): QaGroupFieldMapping {
    const loadedFieldNames = [...fieldNames];
    const titleField = normalizeOptionalFieldName(selection.titleField);
    const firstQuestionField = normalizeOptionalFieldName(selection.firstQuestionField);
    const firstAnswerField = normalizeOptionalFieldName(selection.firstAnswerField);
    const derivation = buildQaGroupDerivation(firstQuestionField, firstAnswerField);
    const availableFields = new Set(loadedFieldNames);

    for (const field of [titleField, firstQuestionField, firstAnswerField]) {
      if (field && !availableFields.has(field)) {
        throw new PluginUserError("errors.noteFieldMapping.qaGroupSelectedFieldMissing", {
          modelName,
          field,
        });
      }
    }

    return {
      cardType: "qa-group",
      modelName,
      loadedFieldNames,
      titleField,
      slots: deriveQaGroupSlots(modelName, loadedFieldNames, titleField, firstQuestionField, firstAnswerField),
      warnings: [],
      acceptedWarnings: undefined,
      derivation,
      loadedAt,
    };
  }

  validateMapping(mapping: QaGroupFieldMapping, fieldNames: string[]): void {
    if (!mapping.titleField) {
      throw new PluginUserError("errors.noteFieldMapping.qaGroupMissingTitle", {
        modelName: mapping.modelName,
      });
    }

    if (mapping.slots.length === 0) {
      throw new PluginUserError("errors.noteFieldMapping.qaGroupNoCompleteSlots", {
        modelName: mapping.modelName,
      });
    }

    const availableFields = new Set(fieldNames);
    const missingFields = new Set<string>();
    const usedFields = new Set<string>([mapping.titleField]);

    if (!availableFields.has(mapping.titleField)) {
      missingFields.add(mapping.titleField);
    }

    for (const slot of mapping.slots) {
      if (!availableFields.has(slot.questionField)) {
        missingFields.add(slot.questionField);
      }

      if (!availableFields.has(slot.answerField)) {
        missingFields.add(slot.answerField);
      }

      if (usedFields.has(slot.questionField) || usedFields.has(slot.answerField) || slot.questionField === slot.answerField) {
        throw new PluginUserError("errors.noteFieldMapping.qaGroupDuplicateFields", {
          modelName: mapping.modelName,
        });
      }

      usedFields.add(slot.questionField);
      usedFields.add(slot.answerField);
    }

    if (missingFields.size > 0) {
      throw new PluginUserError("errors.noteFieldMapping.stale", {
        modelName: mapping.modelName,
        fields: [...missingFields].map((fieldName) => `"${fieldName}"`),
      });
    }
  }

  validateWarningsAccepted(mapping: QaGroupFieldMapping): void {
    if (!mapping.warnings.length || areQaGroupWarningsAccepted(mapping.warnings, mapping.acceptedWarnings)) {
      return;
    }

    throw new PluginUserError("errors.noteFieldMapping.qaGroupWarningsUnaccepted", {
      modelName: mapping.modelName,
    });
  }
}

export function areQaGroupWarningsAccepted(warnings: string[], acceptedWarnings?: string[]): boolean {
  if (warnings.length === 0) {
    return true;
  }

  if (!acceptedWarnings || warnings.length !== acceptedWarnings.length) {
    return false;
  }

  return warnings.every((warning, index) => warning === acceptedWarnings[index]);
}

export function parseQaGroupFieldWarning(warning: string): QaGroupFieldWarningPayload | undefined {
  try {
    const parsed = JSON.parse(warning) as Partial<QaGroupFieldWarningPayload>;
    if (
      (parsed.kind !== "missing-answer" && parsed.kind !== "missing-question") ||
      typeof parsed.index !== "number" ||
      !Number.isInteger(parsed.index) ||
      parsed.index < 1 ||
      typeof parsed.questionField !== "string" ||
      typeof parsed.answerField !== "string"
    ) {
      return undefined;
    }

    return {
      kind: parsed.kind,
      index: parsed.index,
      questionField: parsed.questionField,
      answerField: parsed.answerField,
    };
  } catch {
    return undefined;
  }
}

function detectSuggestedFirstPair(fieldNames: string[], modelName: string): { questionField: string; answerField: string } {
  const questionFieldByIndex = new Map<number, string>();
  const answerFieldByIndex = new Map<number, string>();

  for (const fieldName of fieldNames) {
    const questionIndex = detectIndexedField(fieldName, QUESTION_FIELD_PATTERNS);
    if (questionIndex && !questionFieldByIndex.has(questionIndex)) {
      questionFieldByIndex.set(questionIndex, fieldName);
      continue;
    }

    const answerIndex = detectIndexedField(fieldName, ANSWER_FIELD_PATTERNS);
    if (answerIndex && !answerFieldByIndex.has(answerIndex)) {
      answerFieldByIndex.set(answerIndex, fieldName);
    }
  }

  const candidateIndices = [...new Set([...questionFieldByIndex.keys(), ...answerFieldByIndex.keys()])].sort((left, right) => left - right);
  if (candidateIndices.length > 0 && candidateIndices[0] !== 1) {
    throw new PluginUserError("errors.noteFieldMapping.qaGroupNonContinuousSlots", {
      modelName,
      firstIndex: candidateIndices[0],
    });
  }

  const firstQuestionField = questionFieldByIndex.get(1);
  const firstAnswerField = answerFieldByIndex.get(1);
  if (!firstQuestionField || !firstAnswerField) {
    throw new PluginUserError("errors.noteFieldMapping.qaGroupNoCompleteSlots", {
      modelName,
    });
  }

  return {
    questionField: firstQuestionField,
    answerField: firstAnswerField,
  };
}

function detectIndexedField(fieldName: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = fieldName.match(pattern);
    if (!match) {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(index) && index >= 1) {
      return index;
    }
  }

  return undefined;
}

function findFieldName(fieldNames: string[], preferredNames: readonly string[]): string | undefined {
  return fieldNames.find((fieldName) => preferredNames.some((preferredName) => preferredName.toLowerCase() === fieldName.toLowerCase()));
}

function deriveQaGroupSlots(
  modelName: string,
  fieldNames: string[],
  titleField: string | undefined,
  firstQuestionField: string | undefined,
  firstAnswerField: string | undefined,
): QaGroupSlotMapping[] {
  if (!firstQuestionField || !firstAnswerField) {
    return [];
  }

  const usedFields = new Set<string>();
  if (titleField) {
    usedFields.add(titleField);
  }

  if (usedFields.has(firstQuestionField) || usedFields.has(firstAnswerField) || firstQuestionField === firstAnswerField) {
    throw new PluginUserError("errors.noteFieldMapping.qaGroupDuplicateFields", {
      modelName,
    });
  }

  const questionSegment = parseLastIndexedFieldSegment(firstQuestionField);
  const answerSegment = parseLastIndexedFieldSegment(firstAnswerField);

  if (!questionSegment || !answerSegment) {
    return [{ index: 1, questionField: firstQuestionField, answerField: firstAnswerField }];
  }

  if (questionSegment.index !== answerSegment.index) {
    throw new PluginUserError("errors.noteFieldMapping.qaGroupFirstPairNumberMismatch", {
      modelName,
      questionField: firstQuestionField,
      answerField: firstAnswerField,
    });
  }

  if (questionSegment.index !== 1) {
    throw new PluginUserError("errors.noteFieldMapping.qaGroupFirstPairMustStartAtOne", {
      modelName,
      firstIndex: questionSegment.index,
    });
  }

  const availableFields = new Set(fieldNames);
  const slots: QaGroupSlotMapping[] = [];

  for (let index = 1; ; index += 1) {
    const questionField = index === 1 ? firstQuestionField : formatIndexedField(questionSegment, index);
    const answerField = index === 1 ? firstAnswerField : formatIndexedField(answerSegment, index);

    if (!availableFields.has(questionField) || !availableFields.has(answerField)) {
      break;
    }

    if (usedFields.has(questionField) || usedFields.has(answerField) || questionField === answerField) {
      throw new PluginUserError("errors.noteFieldMapping.qaGroupDuplicateFields", {
        modelName,
      });
    }

    usedFields.add(questionField);
    usedFields.add(answerField);
    slots.push({ index, questionField, answerField });
  }

  return slots;
}

function buildQaGroupDerivation(firstQuestionField: string | undefined, firstAnswerField: string | undefined): QaGroupFieldDerivation | undefined {
  if (!firstQuestionField && !firstAnswerField) {
    return undefined;
  }

  return {
    mode: "first-pair",
    firstQuestionField,
    firstAnswerField,
  };
}

function normalizeOptionalFieldName(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function parseLastIndexedFieldSegment(fieldName: string): IndexedFieldSegment | undefined {
  const matches = [...fieldName.matchAll(/\d+/g)];
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch || lastMatch.index === undefined) {
    return undefined;
  }

  return {
    prefix: fieldName.slice(0, lastMatch.index),
    digits: lastMatch[0],
    suffix: fieldName.slice(lastMatch.index + lastMatch[0].length),
    index: Number.parseInt(lastMatch[0], 10),
  };
}

function formatIndexedField(segment: IndexedFieldSegment, index: number): string {
  return `${segment.prefix}${String(index).padStart(segment.digits.length, "0")}${segment.suffix}`;
}
