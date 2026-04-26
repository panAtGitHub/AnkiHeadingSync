import {
  createNoteFieldMappingKey,
  isBasicLikeNoteModelFieldMapping,
  isClozeNoteModelFieldMapping,
  type BasicLikeNoteModelFieldMapping,
  type ClozeNoteModelFieldMapping,
  type NoteModelFieldMapping,
  type NoteModelFieldMappingCardType,
} from "@/application/config/NoteModelFieldMapping";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import { PluginUserError } from "@/application/errors/PluginUserError";
import { isBasicLikeCardType, type CardType, type RenderedFields } from "@/domain/card/entities/RenderedFields";

interface RenderedCardInput {
  type: CardType;
  noteModel: string;
  renderedFields: RenderedFields;
}

export class NoteFieldMappingService {
  map(
    card: RenderedCardInput,
    noteModelDetails: NoteModelDetails,
    noteFieldMappings: Record<string, NoteModelFieldMapping>,
  ): Record<string, string> {
    return this.mapRenderedCard(card, noteModelDetails, noteFieldMappings);
  }

  mapRenderedCard(
    card: RenderedCardInput,
    noteModelDetails: NoteModelDetails,
    noteFieldMappings: Record<string, NoteModelFieldMapping>,
  ): Record<string, string> {
    const mapping = this.getRequiredMapping(card, noteFieldMappings);
    this.validateMapping(mapping, noteModelDetails);

    if (isBasicLikeCardType(card.type)) {
      return this.mapBasic(card, mapping as BasicLikeNoteModelFieldMapping);
    }

    return this.mapCloze(card, mapping as ClozeNoteModelFieldMapping);
  }

  suggest(cardType: NoteModelFieldMappingCardType, modelName: string, fieldNames: string[], loadedAt = Date.now()): NoteModelFieldMapping {
    if (cardType === "qa-group") {
      throw new Error("QaGroupFieldMappingService must be used for qa-group mappings.");
    }

    return isBasicLikeMappingCardType(cardType)
      ? {
          cardType,
          modelName,
          loadedFieldNames: [...fieldNames],
          titleField: findFieldName(fieldNames, ["Front", "Title"]) ?? fieldNames[0],
          bodyField:
            findFieldName(fieldNames, ["Back", "Body", "Answer"]) ??
            fieldNames.find((fieldName) => fieldName !== (findFieldName(fieldNames, ["Front", "Title"]) ?? fieldNames[0])),
          loadedAt,
        }
      : {
          cardType,
          modelName,
          loadedFieldNames: [...fieldNames],
          mainField: findFieldName(fieldNames, ["Text", "Body", "Content"]) ?? fieldNames[0],
          loadedAt,
        };
  }

  validateMapping(mapping: NoteModelFieldMapping, noteModelDetails: NoteModelDetails): void {
    if (!isBasicLikeNoteModelFieldMapping(mapping) && !isClozeNoteModelFieldMapping(mapping)) {
      throw new Error("QaGroupFieldMappingService validates qa-group mappings.");
    }

    const availableFields = new Set(noteModelDetails.fieldNames);

    if (isBasicLikeNoteModelFieldMapping(mapping)) {
      if (!mapping.titleField || !mapping.bodyField) {
        throw new PluginUserError(getIncompleteSavedMappingKey(mapping.cardType), {
          modelName: mapping.modelName,
        });
      }

      if (mapping.titleField === mapping.bodyField) {
        throw new PluginUserError(getTitleBodyMustDifferKey(mapping.cardType), {
          modelName: mapping.modelName,
        });
      }

      const missingFields = [mapping.titleField, mapping.bodyField].filter((fieldName) => !availableFields.has(fieldName));
      if (missingFields.length > 0) {
        throw new PluginUserError("errors.noteFieldMapping.stale", {
          modelName: mapping.modelName,
          fields: missingFields.map((fieldName) => `"${fieldName}"`),
        });
      }

      return;
    }

    if (!mapping.mainField) {
      throw new PluginUserError("errors.noteFieldMapping.incompleteSavedMapping.cloze", {
        modelName: mapping.modelName,
      });
    }

    if (!availableFields.has(mapping.mainField)) {
      throw new PluginUserError("errors.noteFieldMapping.stale", {
        modelName: mapping.modelName,
        fields: [`"${mapping.mainField}"`],
      });
    }
  }

  private mapBasic(card: RenderedCardInput, mapping: BasicLikeNoteModelFieldMapping): Record<string, string> {
    const titleFieldName = mapping.titleField;
    const bodyFieldName = mapping.bodyField;

    if (!titleFieldName || !bodyFieldName) {
      throw new PluginUserError(getIncompleteSavedMappingKey(card.type), {
        modelName: card.noteModel,
      });
    }

    return {
      [titleFieldName]: card.renderedFields.title,
      [bodyFieldName]: card.renderedFields.body,
    };
  }

  private mapCloze(card: RenderedCardInput, mapping: ClozeNoteModelFieldMapping): Record<string, string> {
    if (!mapping.mainField) {
      throw new PluginUserError("errors.noteFieldMapping.incompleteSavedMapping.cloze", {
        modelName: card.noteModel,
      });
    }

    return {
      [mapping.mainField]: `${card.renderedFields.title}<br><br>${card.renderedFields.body}`,
    };
  }

  private getRequiredMapping(
    card: RenderedCardInput,
    noteFieldMappings: Record<string, NoteModelFieldMapping>,
  ): NoteModelFieldMapping {
    const mapping = noteFieldMappings[createNoteFieldMappingKey(card.type, card.noteModel)];

    if (!mapping) {
      throw new PluginUserError(getMissingSavedMappingKey(card.type), {
        modelName: card.noteModel,
      });
    }

    return mapping;
  }
}

function isBasicLikeMappingCardType(cardType: NoteModelFieldMappingCardType): cardType is Extract<NoteModelFieldMappingCardType, "basic" | "semantic-qa"> {
  return cardType === "basic" || cardType === "semantic-qa";
}

function getMissingSavedMappingKey(cardType: CardType): "errors.noteFieldMapping.missingSavedMapping.basic" | "errors.noteFieldMapping.missingSavedMapping.cloze" | "errors.noteFieldMapping.missingSavedMapping.semanticQa" {
  if (cardType === "cloze") {
    return "errors.noteFieldMapping.missingSavedMapping.cloze";
  }

  return cardType === "semantic-qa"
    ? "errors.noteFieldMapping.missingSavedMapping.semanticQa"
    : "errors.noteFieldMapping.missingSavedMapping.basic";
}

function getIncompleteSavedMappingKey(cardType: NoteModelFieldMappingCardType): "errors.noteFieldMapping.incompleteSavedMapping.basic" | "errors.noteFieldMapping.incompleteSavedMapping.cloze" | "errors.noteFieldMapping.incompleteSavedMapping.semanticQa" {
  if (cardType === "cloze") {
    return "errors.noteFieldMapping.incompleteSavedMapping.cloze";
  }

  return cardType === "semantic-qa"
    ? "errors.noteFieldMapping.incompleteSavedMapping.semanticQa"
    : "errors.noteFieldMapping.incompleteSavedMapping.basic";
}

function getTitleBodyMustDifferKey(cardType: Extract<NoteModelFieldMappingCardType, "basic" | "semantic-qa">): "errors.noteFieldMapping.titleBodyMustDiffer.basic" | "errors.noteFieldMapping.titleBodyMustDiffer.semanticQa" {
  return cardType === "semantic-qa"
    ? "errors.noteFieldMapping.titleBodyMustDiffer.semanticQa"
    : "errors.noteFieldMapping.titleBodyMustDiffer.basic";
}

function findFieldName(fieldNames: string[], preferredNames: string[]): string | undefined {
  return fieldNames.find((fieldName) => preferredNames.some((preferredName) => preferredName.toLowerCase() === fieldName.toLowerCase()));
}
