import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_PLUGIN_DIR = join(
  homedir(),
  "Library",
  "Mobile Documents",
  "iCloud~md~obsidian",
  "Documents",
  "obsidian",
  ".obsidian",
  "plugins",
  "Anki Heading Sync",
);

export const OBSIDIAN_PLUGIN_DIR = process.env.OBSIDIAN_PLUGIN_DIR?.trim() || DEFAULT_PLUGIN_DIR;
