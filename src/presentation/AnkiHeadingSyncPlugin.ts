import { Plugin } from "obsidian";

import { DEFAULT_SETTINGS, type PluginSettings } from "@/application/config/PluginSettings";
import type { NoteModelDetails } from "@/application/dto/NoteModelDetails";
import { ManualSyncCurrentFileUseCase } from "@/application/use-cases/ManualSyncCurrentFileUseCase";
import { RebuildCardIndexUseCase } from "@/application/use-cases/RebuildCardIndexUseCase";
import { ManualSyncVaultUseCase } from "@/application/use-cases/ManualSyncVaultUseCase";
import { AnkiConnectGateway } from "@/infrastructure/anki/AnkiConnectGateway";
import { ObsidianPluginDataStore } from "@/infrastructure/obsidian/ObsidianPluginDataStore";
import { ObsidianVaultGateway } from "@/infrastructure/obsidian/ObsidianVaultGateway";
import { DataJsonPluginConfigRepository, type PluginDataSnapshot } from "@/infrastructure/persistence/DataJsonPluginConfigRepository";
import { DataJsonPluginStateRepository } from "@/infrastructure/persistence/DataJsonPluginStateRepository";
import { registerCommands } from "@/presentation/commands/registerCommands";
import { NoticeService } from "@/presentation/notices/NoticeService";
import { AnkiHeadingSyncSettingTab } from "@/presentation/settings/PluginSettingTab";
import { ManualSyncService } from "@/application/services/ManualSyncService";

export default class AnkiHeadingSyncPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  private readonly noticeService = new NoticeService();
  private readonly ankiGateway = new AnkiConnectGateway(() => this.settings.ankiConnectUrl);

  private syncCurrentFileUseCase?: ManualSyncCurrentFileUseCase;
  private syncVaultUseCase?: ManualSyncVaultUseCase;
  private rebuildCardIndexUseCase?: RebuildCardIndexUseCase;
  private pluginConfigRepository?: DataJsonPluginConfigRepository;

  async onload(): Promise<void> {
    const pluginDataStore = new ObsidianPluginDataStore<PluginDataSnapshot>(this);
    this.pluginConfigRepository = new DataJsonPluginConfigRepository(pluginDataStore);
    const pluginStateRepository = new DataJsonPluginStateRepository(pluginDataStore);
    const vaultGateway = new ObsidianVaultGateway(this.app);

    try {
      this.settings = await this.pluginConfigRepository.load();
    } catch (error) {
      console.error("Failed to load plugin settings, falling back to defaults.", error);
      this.settings = DEFAULT_SETTINGS;
      this.noticeService.error("Invalid plugin settings were detected. Default settings were restored in memory.");
    }

    const manualSyncService = new ManualSyncService(vaultGateway, pluginStateRepository, this.ankiGateway);
    this.syncCurrentFileUseCase = new ManualSyncCurrentFileUseCase(manualSyncService);
    this.syncVaultUseCase = new ManualSyncVaultUseCase(manualSyncService);
    this.rebuildCardIndexUseCase = new RebuildCardIndexUseCase(manualSyncService);

    registerCommands(this);
    this.addSettingTab(new AnkiHeadingSyncSettingTab(this));
  }

  async updateSettings(partialSettings: Partial<PluginSettings>): Promise<void> {
    if (!this.pluginConfigRepository) {
      return;
    }

    const nextSettings: PluginSettings = {
      ...this.settings,
      ...partialSettings,
    };

    try {
      await this.pluginConfigRepository.save(nextSettings);
      this.settings = nextSettings;
    } catch (error) {
      this.noticeService.error(error instanceof Error ? error.message : "Failed to save plugin settings.");
    }
  }

  async listNoteModels(): Promise<string[]> {
    return this.ankiGateway.listNoteModels();
  }

  async getNoteModelDetails(modelName: string): Promise<NoteModelDetails> {
    return this.ankiGateway.getModelDetails(modelName);
  }

  async runSyncCurrentFile(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile || activeFile.extension.toLowerCase() !== "md") {
      this.noticeService.error("No active Markdown file is available for sync.");
      return;
    }

    if (!this.syncCurrentFileUseCase) {
      this.noticeService.error("Sync use case is not initialized.");
      return;
    }

    try {
      const result = await this.syncCurrentFileUseCase.execute(activeFile.path, this.settings);
      this.noticeService.showSyncSummary("当前文件同步完成", result);
    } catch (error) {
      console.error("Current file sync failed.", error);
      this.noticeService.error(error instanceof Error ? error.message : "Current file sync failed.");
    }
  }

  async runSyncVault(): Promise<void> {
    if (!this.syncVaultUseCase) {
      this.noticeService.error("Sync use case is not initialized.");
      return;
    }

    try {
      const result = await this.syncVaultUseCase.execute(this.settings);
      this.noticeService.showSyncSummary("全库同步完成", result);
    } catch (error) {
      console.error("Vault sync failed.", error);
      this.noticeService.error(error instanceof Error ? error.message : "Vault sync failed.");
    }
  }

  async runRebuildCardIndex(): Promise<void> {
    if (!this.rebuildCardIndexUseCase) {
      this.noticeService.error("Sync use case is not initialized.");
      return;
    }

    try {
      const result = await this.rebuildCardIndexUseCase.execute(this.settings);
      this.noticeService.showRebuildSummary("卡片索引重建完成", result);
    } catch (error) {
      console.error("Card index rebuild failed.", error);
      this.noticeService.error(error instanceof Error ? error.message : "Card index rebuild failed.");
    }
  }
}