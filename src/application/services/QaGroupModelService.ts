import type { AnkiGroupGateway } from "@/application/ports/AnkiGateway";

import { buildQaGroupModelDefinition } from "./QaGroupModelDefinition";

export class QaGroupModelService {
  constructor(private readonly ankiGateway: AnkiGroupGateway) {}

  async ensureModel(): Promise<void> {
    const definition = buildQaGroupModelDefinition();
    const modelNames = await this.ankiGateway.listNoteModels();

    if (!modelNames.includes(definition.modelName)) {
      await this.ankiGateway.createModel(definition);
      return;
    }

    const existingFieldNames = await this.ankiGateway.getModelFieldNames(definition.modelName);
    for (const fieldName of definition.fieldNames) {
      if (existingFieldNames.includes(fieldName)) {
        continue;
      }

      await this.ankiGateway.addModelField(definition.modelName, fieldName);
    }

    const existingTemplates = await this.ankiGateway.getModelTemplates(definition.modelName);
    for (const template of definition.templates) {
      const existingTemplate = existingTemplates[template.name];
      if (!existingTemplate) {
        await this.ankiGateway.addModelTemplate(definition.modelName, template);
        continue;
      }

      if (existingTemplate.front !== template.front || existingTemplate.back !== template.back) {
        await this.ankiGateway.updateModelTemplate(definition.modelName, template);
      }
    }

    const existingCss = await this.ankiGateway.getModelStyling(definition.modelName);
    if (existingCss !== definition.css) {
      await this.ankiGateway.updateModelStyling(definition.modelName, definition.css);
    }
  }
}