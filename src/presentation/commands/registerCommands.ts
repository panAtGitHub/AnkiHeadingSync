import type AnkiHeadingSyncPlugin from "@/presentation/AnkiHeadingSyncPlugin";

export function registerCommands(plugin: AnkiHeadingSyncPlugin): void {
  plugin.addCommand({
    id: "sync-current-file-to-anki",
    name: "Sync current file to Anki",
    callback: () => {
      void plugin.runSyncCurrentFile();
    },
  });

  plugin.addCommand({
    id: "sync-vault-to-anki",
    name: "Sync vault to Anki",
    callback: () => {
      void plugin.runSyncVault();
    },
  });
}