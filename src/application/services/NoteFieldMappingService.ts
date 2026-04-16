import type { Card } from "@/domain/card/entities/Card";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";

export class NoteFieldMappingService {
  map(card: Card, noteModelDetails: NoteModelDetails): Record<string, string> {
    if (card.type === "basic") {
      return this.mapBasic(card, noteModelDetails.fieldNames);
    }

    return this.mapCloze(card, noteModelDetails);
  }

  private mapBasic(card: Card, fieldNames: string[]): Record<string, string> {
    const frontFieldName = findFieldName(fieldNames, ["Front"]) ?? fieldNames[0];
    const backFieldName = findFieldName(fieldNames, ["Back"]) ?? fieldNames[1];

    if (!frontFieldName || !backFieldName) {
      throw new Error(`Basic note model ${card.noteModel} must expose at least two fields.`);
    }

    return {
      [frontFieldName]: card.fields.front,
      [backFieldName]: card.fields.back,
    };
  }

  private mapCloze(card: Card, noteModelDetails: NoteModelDetails): Record<string, string> {
    if (!noteModelDetails.isCloze) {
      throw new Error(`Cloze card ${card.key} must target a cloze-compatible note model.`);
    }

    const textFieldName = findFieldName(noteModelDetails.fieldNames, ["Text"]) ?? noteModelDetails.fieldNames[0];
    const extraFieldName =
      findFieldName(noteModelDetails.fieldNames, ["Extra", "Context"]) ?? noteModelDetails.fieldNames[1];

    if (!textFieldName || !extraFieldName) {
      throw new Error(`Cloze note model ${card.noteModel} must expose text and auxiliary fields.`);
    }

    return {
      [textFieldName]: card.fields.text,
      [extraFieldName]: card.fields.extra,
    };
  }
}

function findFieldName(fieldNames: string[], preferredNames: string[]): string | undefined {
  return fieldNames.find((fieldName) => preferredNames.some((preferredName) => preferredName.toLowerCase() === fieldName.toLowerCase()));
}