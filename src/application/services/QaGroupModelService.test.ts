import { describe, expect, it, vi } from "vitest";

import { FakeManualSyncAnkiGateway } from "@/test-support/manualSyncFakes";

import { buildQaGroupModelDefinition } from "./QaGroupModelDefinition";
import { QaGroupModelService } from "./QaGroupModelService";

describe("QaGroupModelService", () => {
  it("builds QA Group templates with a clickable Obsidian backlink", () => {
    const definition = buildQaGroupModelDefinition();

    expect(definition.templates[0]?.back).toContain('<a class="anki-heading-sync-backlink" href="{{Src}}">Open in Obsidian</a>');
    expect(definition.templates[0]?.back).not.toContain('<div class="meta">{{Src}}</div>');
  });

  it("creates the QA Group model when it is missing", async () => {
    const ankiGateway = new FakeManualSyncAnkiGateway();
    const service = new QaGroupModelService(ankiGateway);
    const definition = buildQaGroupModelDefinition();

    await service.ensureModel();

    expect(ankiGateway.createdModels).toEqual([definition]);
  });

  it("adds missing fields when the QA Group model already exists", async () => {
    const definition = buildQaGroupModelDefinition();
    const ankiGateway = createExistingQaGroupGateway({
      fieldNames: definition.fieldNames.filter((fieldName) => fieldName !== "S12_A"),
    });
    const service = new QaGroupModelService(ankiGateway);

    await service.ensureModel();

    expect(ankiGateway.addedModelFields).toEqual([
      {
        modelName: definition.modelName,
        fieldName: "S12_A",
      },
    ]);
  });

  it("adds missing templates when the QA Group model already exists", async () => {
    const definition = buildQaGroupModelDefinition();
    const missingTemplate = definition.templates[definition.templates.length - 1];
    const ankiGateway = createExistingQaGroupGateway({
      templates: definition.templates.slice(0, -1),
    });
    const service = new QaGroupModelService(ankiGateway);

    await service.ensureModel();

    expect(ankiGateway.addedModelTemplates).toEqual([
      {
        modelName: definition.modelName,
        template: missingTemplate,
      },
    ]);
  });

  it("updates drifted templates when the QA Group model already exists", async () => {
    const definition = buildQaGroupModelDefinition();
    const driftedTemplate = {
      ...definition.templates[0],
      front: "drifted-front",
    };
    const ankiGateway = createExistingQaGroupGateway({
      templates: [driftedTemplate, ...definition.templates.slice(1)],
    });
    const service = new QaGroupModelService(ankiGateway);

    await service.ensureModel();

    expect(ankiGateway.updatedModelTemplates).toEqual([
      {
        modelName: definition.modelName,
        template: definition.templates[0],
      },
    ]);
  });

  it("updates drifted CSS when the QA Group model already exists", async () => {
    const definition = buildQaGroupModelDefinition();
    const ankiGateway = createExistingQaGroupGateway({
      css: ".card { color: red; }",
    });
    const service = new QaGroupModelService(ankiGateway);

    await service.ensureModel();

    expect(ankiGateway.updatedModelStyling).toEqual([
      {
        modelName: definition.modelName,
        css: definition.css,
      },
    ]);
  });

  it("includes the action name and model name when an update step fails", async () => {
    const definition = buildQaGroupModelDefinition();
    const driftedTemplate = {
      ...definition.templates[0],
      back: "drifted-back",
    };
    const ankiGateway = createExistingQaGroupGateway({
      templates: [driftedTemplate, ...definition.templates.slice(1)],
    });
    vi.spyOn(ankiGateway, "updateModelTemplate").mockRejectedValue(new Error("boom"));
    const service = new QaGroupModelService(ankiGateway);

    await expect(service.ensureModel()).rejects.toThrow(
      `QA Group model sync failed during updateModelTemplate for "${definition.modelName}" (template=${definition.templates[0].name}): boom`,
    );
  });
});

function createExistingQaGroupGateway(overrides: {
  fieldNames?: string[];
  templates?: ReturnType<typeof buildQaGroupModelDefinition>["templates"];
  css?: string;
} = {}): FakeManualSyncAnkiGateway {
  const definition = buildQaGroupModelDefinition();
  const ankiGateway = new FakeManualSyncAnkiGateway();
  ankiGateway.modelDetailsByName[definition.modelName] = {
    fieldNames: [...(overrides.fieldNames ?? definition.fieldNames)],
    isCloze: false,
  };
  ankiGateway.modelTemplatesByName[definition.modelName] = Object.fromEntries(
    (overrides.templates ?? definition.templates).map((template) => [template.name, { ...template }]),
  );
  ankiGateway.modelStylingByName[definition.modelName] = overrides.css ?? definition.css;
  return ankiGateway;
}
