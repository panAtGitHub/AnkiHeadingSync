import type { PluginSettings } from "@/application/config/PluginSettings";
import type { AnkiGroupGateway } from "@/application/ports/AnkiGateway";

import { buildQaGroupModelDefinition } from "./QaGroupModelDefinition";

export class QaGroupModelService {
  constructor(private readonly ankiGateway: AnkiGroupGateway) {}

  async ensureModel(settings?: Pick<PluginSettings, "obsidianBacklinkLabel" | "obsidianBacklinkPlacement">): Promise<void> {
    const definition = buildQaGroupModelDefinition(settings);
    const modelNames = await this.runModelAction(
      "listNoteModels",
      definition.modelName,
      undefined,
      () => this.ankiGateway.listNoteModels(),
    );

    if (!modelNames.includes(definition.modelName)) {
      await this.runModelAction(
        "createModel",
        definition.modelName,
        `fields=${definition.fieldNames.length}, templates=${definition.templates.length}`,
        () => this.ankiGateway.createModel(definition),
      );
      return;
    }

    const existingFieldNames = await this.runModelAction(
      "getModelFieldNames",
      definition.modelName,
      undefined,
      () => this.ankiGateway.getModelFieldNames(definition.modelName),
    );

    for (const fieldName of definition.fieldNames) {
      if (existingFieldNames.includes(fieldName)) {
        continue;
      }

      await this.runModelAction(
        "addModelField",
        definition.modelName,
        `field=${fieldName}`,
        () => this.ankiGateway.addModelField(definition.modelName, fieldName),
      );
    }

    const existingTemplates = await this.runModelAction(
      "getModelTemplates",
      definition.modelName,
      undefined,
      () => this.ankiGateway.getModelTemplates(definition.modelName),
    );

    for (const template of definition.templates) {
      const existingTemplate = existingTemplates[template.name];
      if (!existingTemplate) {
        await this.runModelAction(
          "addModelTemplate",
          definition.modelName,
          `template=${template.name}`,
          () => this.ankiGateway.addModelTemplate(definition.modelName, template),
        );
        continue;
      }

      if (existingTemplate.front !== template.front || existingTemplate.back !== template.back) {
        await this.runModelAction(
          "updateModelTemplate",
          definition.modelName,
          `template=${template.name}`,
          () => this.ankiGateway.updateModelTemplate(definition.modelName, template),
        );
      }
    }

    const existingCss = await this.runModelAction(
      "getModelStyling",
      definition.modelName,
      undefined,
      () => this.ankiGateway.getModelStyling(definition.modelName),
    );

    if (existingCss !== definition.css) {
      await this.runModelAction(
        "updateModelStyling",
        definition.modelName,
        `cssLength=${definition.css.length}`,
        () => this.ankiGateway.updateModelStyling(definition.modelName, definition.css),
      );
    }
  }

  private async runModelAction<T>(
    action: string,
    modelName: string,
    summary: string | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const details = summary ? ` (${summary})` : "";
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`QA Group model sync failed during ${action} for "${modelName}"${details}: ${message}`);
    }
  }
}