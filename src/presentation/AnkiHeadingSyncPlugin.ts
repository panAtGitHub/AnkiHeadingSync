import { Plugin } from "obsidian";

import { DEFAULT_SETTINGS, normalizePluginSettings, type PluginSettings } from "@/application/config/PluginSettings";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import { DeckTemplateInsertionService } from "@/application/services/DeckTemplateInsertionService";
import { CleanupEmptyDecksUseCase } from "@/application/use-cases/CleanupEmptyDecksUseCase";
import { ClearCurrentFileSyncedCardsUseCase } from "@/application/use-cases/ClearCurrentFileSyncedCardsUseCase";
import { ManualSyncCurrentFileUseCase } from "@/application/use-cases/ManualSyncCurrentFileUseCase";
import { ManualSyncVaultUseCase } from "@/application/use-cases/ManualSyncVaultUseCase";
import { AnkiConnectGateway } from "@/infrastructure/anki/AnkiConnectGateway";
import { ObsidianPluginDataStore } from "@/infrastructure/obsidian/ObsidianPluginDataStore";
import { ObsidianVaultGateway } from "@/infrastructure/obsidian/ObsidianVaultGateway";
import { DataJsonPluginConfigRepository, type PluginDataSnapshot } from "@/infrastructure/persistence/DataJsonPluginConfigRepository";
import { DataJsonPluginStateRepository } from "@/infrastructure/persistence/DataJsonPluginStateRepository";
import { registerCommands } from "@/presentation/commands/registerCommands";
import { renderUnknownUserFacingError, renderUserMessage } from "@/application/errors/PluginUserError";
import { EmptyDeckSelectionModal } from "@/presentation/modals/EmptyDeckSelectionModal";
import { t } from "@/presentation/i18n";
import { NoticeService } from "@/presentation/notices/NoticeService";
import { AnkiHeadingSyncSettingTab } from "@/presentation/settings/PluginSettingTab";
import { CurrentFileOutOfScopeError, ManualSyncService, RunScopeNotConfiguredError } from "@/application/services/ManualSyncService";
import type { FolderTreeNode } from "@/application/dto/FolderTreeNode";
import type { ManualSyncVaultGateway } from "@/application/ports/ManualSyncVaultGateway";

export default class AnkiHeadingSyncPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  private readonly noticeService = new NoticeService();
  private readonly ankiGateway = new AnkiConnectGateway(() => this.settings.ankiConnectUrl);
  private readonly deckTemplateInsertionService = new DeckTemplateInsertionService();

  private syncCurrentFileUseCase?: ManualSyncCurrentFileUseCase;
  private syncVaultUseCase?: ManualSyncVaultUseCase;
  private clearCurrentFileSyncedCardsUseCase?: ClearCurrentFileSyncedCardsUseCase;
  private cleanupEmptyDecksUseCase?: CleanupEmptyDecksUseCase;
  private pluginConfigRepository?: DataJsonPluginConfigRepository;
  private vaultGateway?: ManualSyncVaultGateway;

  async onload(): Promise<void> {
    const pluginDataStore = new ObsidianPluginDataStore<PluginDataSnapshot>(this);
    this.pluginConfigRepository = new DataJsonPluginConfigRepository(pluginDataStore);
    const pluginStateRepository = new DataJsonPluginStateRepository(pluginDataStore);
    const vaultGateway = new ObsidianVaultGateway(this.app);
    this.vaultGateway = vaultGateway;

    try {
      this.settings = await this.pluginConfigRepository.load();
    } catch (error) {
      console.error("Failed to load plugin settings, falling back to defaults.", error);
      this.settings = DEFAULT_SETTINGS;
      this.noticeService.error(t("notice.invalidSettingsRestored"));
    }

    const manualSyncService = new ManualSyncService(vaultGateway, pluginStateRepository, this.ankiGateway);
    this.syncCurrentFileUseCase = new ManualSyncCurrentFileUseCase(manualSyncService);
    this.syncVaultUseCase = new ManualSyncVaultUseCase(manualSyncService);
    this.clearCurrentFileSyncedCardsUseCase = new ClearCurrentFileSyncedCardsUseCase(pluginStateRepository, this.ankiGateway, vaultGateway);
    this.cleanupEmptyDecksUseCase = new CleanupEmptyDecksUseCase(this.ankiGateway);

    registerCommands(this);
    this.addSettingTab(new AnkiHeadingSyncSettingTab(this));
  }

  async updateSettings(partialSettings: Partial<PluginSettings>): Promise<void> {
    if (!this.pluginConfigRepository) {
      return;
    }

    const nextSettings = normalizePluginSettings({
      ...this.settings,
      ...partialSettings,
    });

    try {
      await this.pluginConfigRepository.save(nextSettings);
      this.settings = nextSettings;
    } catch (error) {
      this.noticeService.error(renderUnknownUserFacingError(error, "notice.failedSavePluginSettings"));
    }
  }

  async listNoteModels(): Promise<string[]> {
    return this.ankiGateway.listNoteModels();
  }

  async getModelFieldNamesByModelNames(modelNames: string[]): Promise<Record<string, string[]>> {
    return this.ankiGateway.getModelFieldNamesByModelNames(modelNames);
  }

  async getNoteModelDetails(modelName: string): Promise<NoteModelDetails> {
    return this.ankiGateway.getModelDetails(modelName);
  }

  async listFolderTree(): Promise<FolderTreeNode[]> {
    if (!this.vaultGateway) {
      return [];
    }

    return this.vaultGateway.listFolderTree();
  }

  async runSyncCurrentFile(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile || activeFile.extension.toLowerCase() !== "md") {
      this.noticeService.error(t("notice.noActiveMarkdownForSync"));
      return;
    }

    if (!this.syncCurrentFileUseCase) {
      this.noticeService.error(t("notice.syncUseCaseNotInitialized"));
      return;
    }

    try {
      const result = await this.syncCurrentFileUseCase.execute(activeFile.path, this.settings);
      this.noticeService.showSyncSummary("currentFile", result);
    } catch (error) {
      if (error instanceof CurrentFileOutOfScopeError || error instanceof RunScopeNotConfiguredError) {
        this.noticeService.info(renderUserMessage(error));
        return;
      }

      console.error("Current file sync failed.", error);
      this.noticeService.error(renderUnknownUserFacingError(error, "notice.currentFileSyncFailed"));
    }
  }

  async runSyncVault(): Promise<void> {
    if (!this.syncVaultUseCase) {
      this.noticeService.error(t("notice.syncUseCaseNotInitialized"));
      return;
    }

    try {
      const result = await this.syncVaultUseCase.execute(this.settings);
      this.noticeService.showSyncSummary("vault", result);
    } catch (error) {
      if (error instanceof RunScopeNotConfiguredError) {
        this.noticeService.info(renderUserMessage(error));
        return;
      }

      console.error("Vault sync failed.", error);
      this.noticeService.error(renderUnknownUserFacingError(error, "notice.vaultSyncFailed"));
    }
  }

  async insertDeckTemplateToCurrentFile(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile || activeFile.extension.toLowerCase() !== "md") {
      this.noticeService.error(t("notice.noActiveMarkdownForDeckTemplateInsertion"));
      return;
    }

    if (!this.vaultGateway) {
      this.noticeService.error(t("notice.vaultGatewayNotInitialized"));
      return;
    }

    try {
      const sourceFile = await this.vaultGateway.readMarkdownFile(activeFile.path);
      if (!sourceFile) {
        this.noticeService.error(t("notice.markdownFileNotFound", { filePath: activeFile.path }));
        return;
      }

      const insertionResult = this.deckTemplateInsertionService.insert(
        sourceFile,
        this.settings.fileDeckMarker,
        this.settings.fileDeckTemplate,
        this.settings.fileDeckInsertLocation,
      );

      if (insertionResult.nextContent === insertionResult.expectedContent) {
        this.noticeService.info(t("notice.deckTemplateAlreadyCurrent"));
        return;
      }

      await this.vaultGateway.replaceMarkdownFile(activeFile.path, insertionResult.expectedContent, insertionResult.nextContent);
      this.noticeService.info(t("notice.deckTemplateInserted", { deck: insertionResult.insertedDeck }));
    } catch (error) {
      console.error("Deck template insertion failed.", error);
      this.noticeService.error(renderUnknownUserFacingError(error, "notice.deckTemplateInsertionFailed"));
    }
  }

  async runClearCurrentFileSyncedCards(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile || activeFile.extension.toLowerCase() !== "md") {
      this.noticeService.error(t("notice.noActiveMarkdownForReset"));
      return;
    }

    if (!this.clearCurrentFileSyncedCardsUseCase) {
      this.noticeService.error(t("notice.clearCurrentFileUseCaseNotInitialized"));
      return;
    }

    try {
      const hasTrackedCards = await this.clearCurrentFileSyncedCardsUseCase.hasTrackedCards(activeFile.path);
      if (!hasTrackedCards) {
        this.noticeService.info(t("notice.noTrackedCardsInCurrentFile"));
        return;
      }

      const result = await this.clearCurrentFileSyncedCardsUseCase.execute(activeFile.path);
      this.noticeService.showClearCurrentFileSummary(result);
    } catch (error) {
      console.error("Clear current file synced cards failed.", error);
      this.noticeService.error(renderUnknownUserFacingError(error, "notice.clearCurrentFileFailed"));
    }
  }

  async runCleanupEmptyDecks(): Promise<void> {
    if (!this.cleanupEmptyDecksUseCase) {
      this.noticeService.error(t("notice.cleanupEmptyDecksUseCaseNotInitialized"));
      return;
    }

    try {
      const candidateDeckNames = await this.cleanupEmptyDecksUseCase.listCandidates();
      if (candidateDeckNames.length === 0) {
        this.noticeService.info(t("notice.noEmptyDeckCandidates"));
        return;
      }

      const selectedDeckNames = await new EmptyDeckSelectionModal(this.app, candidateDeckNames).openAndGetSelection();
      if (selectedDeckNames === null) {
        this.noticeService.info(t("notice.cleanupEmptyDecksCancelled"));
        return;
      }

      const result = await this.cleanupEmptyDecksUseCase.execute(selectedDeckNames, candidateDeckNames);
      this.noticeService.showCleanupEmptyDecksSummary(result);
    } catch (error) {
      console.error("Cleanup empty decks failed.", error);
      this.noticeService.error(renderUnknownUserFacingError(error, "notice.cleanupEmptyDecksFailed"));
    }
  }
}