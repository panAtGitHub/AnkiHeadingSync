import { Plugin } from "obsidian";

import { DEFAULT_SETTINGS, type PluginSettings } from "@/application/config/PluginSettings";
import { ScanAndPlanSyncUseCase } from "@/application/use-cases/ScanAndPlanSyncUseCase";
import { ExecuteSyncPlanUseCase } from "@/application/use-cases/ExecuteSyncPlanUseCase";
import { SyncCurrentFileUseCase } from "@/application/use-cases/SyncCurrentFileUseCase";
import { SyncVaultUseCase } from "@/application/use-cases/SyncVaultUseCase";
import { AnkiConnectGateway } from "@/infrastructure/anki/AnkiConnectGateway";
import { ObsidianPluginDataStore } from "@/infrastructure/obsidian/ObsidianPluginDataStore";
import { ObsidianVaultGateway } from "@/infrastructure/obsidian/ObsidianVaultGateway";
import { DataJsonPluginConfigRepository, type PluginDataSnapshot } from "@/infrastructure/persistence/DataJsonPluginConfigRepository";
import { DataJsonSyncRegistryRepository } from "@/infrastructure/persistence/DataJsonSyncRegistryRepository";
import { registerCommands } from "@/presentation/commands/registerCommands";
import { NoticeService } from "@/presentation/notices/NoticeService";
import { AnkiHeadingSyncSettingTab } from "@/presentation/settings/PluginSettingTab";

export default class AnkiHeadingSyncPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  private readonly noticeService = new NoticeService();

  private syncCurrentFileUseCase?: SyncCurrentFileUseCase;
  private syncVaultUseCase?: SyncVaultUseCase;
  private pluginConfigRepository?: DataJsonPluginConfigRepository;

  async onload(): Promise<void> {
    const pluginDataStore = new ObsidianPluginDataStore<PluginDataSnapshot>(this);
    this.pluginConfigRepository = new DataJsonPluginConfigRepository(pluginDataStore);
    const syncRegistryRepository = new DataJsonSyncRegistryRepository(pluginDataStore);
    const vaultGateway = new ObsidianVaultGateway(this.app);
    const ankiGateway = new AnkiConnectGateway(() => this.settings.ankiConnectUrl);

    try {
      this.settings = await this.pluginConfigRepository.load();
    } catch (error) {
      console.error("Failed to load plugin settings, falling back to defaults.", error);
      this.settings = DEFAULT_SETTINGS;
      this.noticeService.error("Invalid plugin settings were detected. Default settings were restored in memory.");
    }

    const scanAndPlanSyncUseCase = new ScanAndPlanSyncUseCase(vaultGateway, syncRegistryRepository);
    const executeSyncPlanUseCase = new ExecuteSyncPlanUseCase(ankiGateway, syncRegistryRepository);
    this.syncCurrentFileUseCase = new SyncCurrentFileUseCase(scanAndPlanSyncUseCase, executeSyncPlanUseCase);
    this.syncVaultUseCase = new SyncVaultUseCase(scanAndPlanSyncUseCase, executeSyncPlanUseCase);

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
      this.noticeService.showSyncSummary("Current file sync finished", result);
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
      this.noticeService.showSyncSummary("Vault sync finished", result);
    } catch (error) {
      console.error("Vault sync failed.", error);
      this.noticeService.error(error instanceof Error ? error.message : "Vault sync failed.");
    }
  }
}