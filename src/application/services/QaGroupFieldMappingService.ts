import type { QaGroupFieldMapping, QaGroupSlotMapping } from "@/application/config/NoteModelFieldMapping";
import { PluginUserError } from "@/application/errors/PluginUserError";

type QaGroupFieldWarningKind = "missing-answer" | "missing-question";

interface QaGroupFieldWarningPayload {
  kind: QaGroupFieldWarningKind;
  index: number;
  questionField: string;
  answerField: string;
}

interface QaGroupDetectedFields {
  slots: QaGroupSlotMapping[];
  warnings: string[];
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
    const titleField = preferredTitleField && fieldNames.includes(preferredTitleField)
      ? preferredTitleField
      : findFieldName(fieldNames, TITLE_FIELD_PRIORITY);
    const detectedFields = detectSlots(fieldNames, modelName);

    return {
      cardType: "qa-group",
      modelName,
      loadedFieldNames: [...fieldNames],
      titleField,
      slots: detectedFields.slots,
      warnings: detectedFields.warnings,
      acceptedWarnings: detectedFields.warnings.length > 0 && areQaGroupWarningsAccepted(detectedFields.warnings, acceptedWarnings)
        ? [...detectedFields.warnings]
        : undefined,
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

function detectSlots(fieldNames: string[], modelName: string): QaGroupDetectedFields {
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

  const slots: QaGroupSlotMapping[] = [];
  const warnings: string[] = [];

  for (const index of candidateIndices) {
    const questionField = questionFieldByIndex.get(index);
    const answerField = answerFieldByIndex.get(index);
    if (!questionField || !answerField) {
      warnings.push(serializeQaGroupFieldWarning({
        kind: questionField ? "missing-answer" : "missing-question",
        index,
        questionField: questionField ?? preferredSlotFieldName("question", index),
        answerField: answerField ?? preferredSlotFieldName("answer", index),
      }));
      continue;
    }

    if (index !== slots.length + 1) {
      break;
    }

    slots.push({
      index,
      questionField,
      answerField,
    });
  }

  if (slots.length === 0) {
    throw new PluginUserError("errors.noteFieldMapping.qaGroupNoCompleteSlots", {
      modelName,
    });
  }

  return { slots, warnings };
}

function detectIndexedField(fieldName: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = fieldName.match(pattern);
    if (!match) {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(index) && index > 0) {
      return index;
    }
  }

  return undefined;
}

function findFieldName(fieldNames: string[], preferredNames: readonly string[]): string | undefined {
  return fieldNames.find((fieldName) => preferredNames.some((preferredName) => preferredName.toLowerCase() === fieldName.toLowerCase()));
}

function serializeQaGroupFieldWarning(warning: QaGroupFieldWarningPayload): string {
  return JSON.stringify(warning);
}

function preferredSlotFieldName(kind: "question" | "answer", index: number): string {
  return `${kind === "question" ? "问题" : "答案"}${String(index).padStart(2, "0")}`;
}
