import type AnkiHeadingSyncPlugin from "@/presentation/AnkiHeadingSyncPlugin";
import { t } from "@/presentation/i18n";

export function registerCommands(plugin: AnkiHeadingSyncPlugin): void {
  plugin.addCommand({
    id: "sync-current-file-to-anki",
    name: t("commands.syncCurrentFileToAnki"),
    callback: () => {
      void plugin.runSyncCurrentFile();
    },
  });

  plugin.addCommand({
    id: "sync-vault-to-anki",
    name: t("commands.syncVaultToAnki"),
    callback: () => {
      void plugin.runSyncVault();
    },
  });

  plugin.addCommand({
    id: "rebuild-card-index",
    name: t("commands.rebuildCardIndex"),
    callback: () => {
      void plugin.runRebuildCardIndex();
    },
  });

  plugin.addCommand({
    id: "clear-current-file-synced-cards",
    name: t("commands.clearCurrentFileSyncedCards"),
    callback: () => {
      void plugin.runClearCurrentFileSyncedCards();
    },
  });

  plugin.addCommand({
    id: "cleanup-empty-decks",
    name: t("commands.cleanupEmptyDecks"),
    callback: () => {
      void plugin.runCleanupEmptyDecks();
    },
  });
}