import type { PluginSettings } from "@/application/config/PluginSettings";
import { validatePluginSettings } from "@/application/config/PluginSettings";
import type { SyncRegistryRepository } from "@/application/ports/SyncRegistryRepository";
import type { VaultGateway } from "@/application/ports/VaultGateway";
import { ScanScopeService } from "@/application/services/ScanScopeService";
import { CardExtractionService } from "@/domain/card/services/CardExtractionService";
import { CardRenderingService } from "@/domain/card/services/CardRenderingService";
import { SyncPlanningService } from "@/domain/sync/services/SyncPlanningService";

import type { ScanAndPlanResult } from "./types";

export class ScanAndPlanSyncUseCase {
  constructor(
    private readonly vaultGateway: VaultGateway,
    private readonly syncRegistryRepository: SyncRegistryRepository,
    private readonly scanScopeService = new ScanScopeService(),
    private readonly cardExtractionService = new CardExtractionService(),
    private readonly cardRenderingService = new CardRenderingService(),
    private readonly syncPlanningService = new SyncPlanningService(),
  ) {}

  async executeForVault(settings: PluginSettings): Promise<ScanAndPlanResult> {
    validatePluginSettings(settings);

    const markdownFiles = await this.vaultGateway.listMarkdownFiles();
    const scopedFiles = this.scanScopeService.filter(markdownFiles, settings.scopeMode, settings.includeFolders, settings.excludeFolders);

    return this.scanFiles(scopedFiles, settings);
  }

  async executeForFile(filePath: string, settings: PluginSettings): Promise<ScanAndPlanResult> {
    validatePluginSettings(settings);

    const sourceFile = await this.vaultGateway.getMarkdownFile(filePath);
    if (!sourceFile) {
      throw new Error(`Markdown file not found: ${filePath}`);
    }

    return this.scanFiles([sourceFile], settings);
  }

  private async scanFiles(files: Awaited<ReturnType<VaultGateway["listMarkdownFiles"]>>, settings: PluginSettings): Promise<ScanAndPlanResult> {
    const cards = files.flatMap((file) =>
      this.cardExtractionService
        .extract(file, {
          qaHeadingLevel: settings.qaHeadingLevel,
          clozeHeadingLevel: settings.clozeHeadingLevel,
        })
        .map((draft) =>
          this.cardRenderingService.render(draft, {
            defaultDeck: settings.defaultDeck,
            qaNoteType: settings.qaNoteType,
            clozeNoteType: settings.clozeNoteType,
            addObsidianBacklink: settings.addObsidianBacklink,
            convertHighlightsToCloze: settings.convertHighlightsToCloze,
            resourceResolver: this.vaultGateway,
          }),
        ),
    );

    const registry = await this.syncRegistryRepository.load();
    const scopedFilePaths = files.map((file) => file.path);
    const plan = this.syncPlanningService.plan(cards, registry, scopedFilePaths);

    return {
      cards,
      noteFieldMappings: settings.noteFieldMappings,
      registry,
      plan,
      scopedFilePaths,
    };
  }
}