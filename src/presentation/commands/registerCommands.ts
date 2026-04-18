import type AnkiHeadingSyncPlugin from "@/presentation/AnkiHeadingSyncPlugin";

export function registerCommands(plugin: AnkiHeadingSyncPlugin): void {
  plugin.addCommand({
    id: "sync-current-file-to-anki",
    name: "同步当前文件到 Anki",
    callback: () => {
      void plugin.runSyncCurrentFile();
    },
  });

  plugin.addCommand({
    id: "sync-vault-to-anki",
    name: "同步全库到 Anki",
    callback: () => {
      void plugin.runSyncVault();
    },
  });

  plugin.addCommand({
    id: "rebuild-card-index",
    name: "重建卡片索引",
    callback: () => {
      void plugin.runRebuildCardIndex();
    },
  });
}