import { describe, expect, it } from "vitest";

import { registerCommands } from "./registerCommands";

describe("registerCommands", () => {
  it("does not expose the maintenance-only rebuild index command", () => {
    const commands: Array<{ id: string; name: string; callback: () => void }> = [];
    const plugin = {
      addCommand(command: { id: string; name: string; callback: () => void }): void {
        commands.push(command);
      },
    };

    registerCommands(plugin as never);

    expect(commands.map((command) => command.id)).toEqual([
      "sync-current-file-to-anki",
      "sync-vault-to-anki",
      "clear-current-file-synced-cards",
      "cleanup-empty-decks",
    ]);
    expect(commands.map((command) => command.id)).not.toContain("rebuild-card-index");
  });
});
