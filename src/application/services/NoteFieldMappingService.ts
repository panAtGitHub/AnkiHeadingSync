import { createNoteFieldMappingKey, type NoteModelFieldMapping } from "@/application/config/NoteModelFieldMapping";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
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
      return this.mapBasic(card, mapping);
    }

    return this.mapCloze(card, noteModelDetails, mapping);
  }

  suggest(cardType: CardType, modelName: string, fieldNames: string[], loadedAt = Date.now()): NoteModelFieldMapping {
    return isBasicLikeCardType(cardType)
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
    const availableFields = new Set(noteModelDetails.fieldNames);

    if (isBasicLikeCardType(mapping.cardType)) {
      if (!mapping.titleField || !mapping.bodyField) {
        throw new Error(
          `Saved field mapping for ${describeBasicLikeCardType(mapping.cardType)} note type "${mapping.modelName}" is incomplete. Open plugin settings and save both title and body fields.`,
        );
      }

      if (mapping.titleField === mapping.bodyField) {
        throw new Error(`${capitalizeFirstLetter(describeBasicLikeCardType(mapping.cardType))} note type "${mapping.modelName}" must use different title and body fields.`);
      }

      const missingFields = [mapping.titleField, mapping.bodyField].filter((fieldName) => !availableFields.has(fieldName));
      if (missingFields.length > 0) {
        throw new Error(this.createStaleMappingError(mapping.modelName, missingFields));
      }

      return;
    }

    if (!mapping.mainField) {
      throw new Error(
        `Saved field mapping for cloze note type "${mapping.modelName}" is incomplete. Open plugin settings and save the main field.`,
      );
    }

    if (!noteModelDetails.isCloze) {
      throw new Error(`Cloze note type "${mapping.modelName}" is not cloze-compatible in Anki.`);
    }

    if (!availableFields.has(mapping.mainField)) {
      throw new Error(this.createStaleMappingError(mapping.modelName, [mapping.mainField]));
    }
  }

  private mapBasic(card: RenderedCardInput, mapping: NoteModelFieldMapping): Record<string, string> {
    const titleFieldName = mapping.titleField;
    const bodyFieldName = mapping.bodyField;

    if (!titleFieldName || !bodyFieldName) {
      throw new Error(`Saved field mapping for basic note type "${card.noteModel}" is incomplete.`);
    }

    return {
      [titleFieldName]: card.renderedFields.title,
      [bodyFieldName]: card.renderedFields.body,
    };
  }

  private mapCloze(card: RenderedCardInput, noteModelDetails: NoteModelDetails, mapping: NoteModelFieldMapping): Record<string, string> {
    if (!noteModelDetails.isCloze) {
      throw new Error(`Cloze note type "${card.noteModel}" is not cloze-compatible in Anki.`);
    }

    if (!mapping.mainField) {
      throw new Error(`Saved field mapping for cloze note type "${card.noteModel}" is incomplete.`);
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
      throw new Error(
        `No saved field mapping found for ${describeCardType(card.type)} note type "${card.noteModel}". Open plugin settings and read fields from Anki first.`,
      );
    }

    return mapping;
  }

  private createStaleMappingError(modelName: string, missingFields: string[]): string {
    const quotedMissingFields = missingFields.map((fieldName) => `"${fieldName}"`).join(", ");
    return `Saved field mapping for note type "${modelName}" is stale because these fields no longer exist in Anki: ${quotedMissingFields}. Open plugin settings and read fields from Anki again.`;
  }
}

function describeCardType(cardType: CardType): string {
  if (cardType === "cloze") {
    return "cloze";
  }

  return describeBasicLikeCardType(cardType);
}

function describeBasicLikeCardType(cardType: Extract<CardType, "basic" | "semantic-qa">): string {
  return cardType === "semantic-qa" ? "semantic QA" : "basic";
}

function capitalizeFirstLetter(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function findFieldName(fieldNames: string[], preferredNames: string[]): string | undefined {
  return fieldNames.find((fieldName) => preferredNames.some((preferredName) => preferredName.toLowerCase() === fieldName.toLowerCase()));
}