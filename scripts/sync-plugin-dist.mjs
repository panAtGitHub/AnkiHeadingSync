import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OBSIDIAN_PLUGIN_DIR } from "./obsidian-plugin-path.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const sourceDir = join(rootDir, "dist", "plugin");

await mkdir(OBSIDIAN_PLUGIN_DIR, { recursive: true });

await Promise.all([
  copyFile(join(sourceDir, "README.md"), join(OBSIDIAN_PLUGIN_DIR, "README.md")),
  copyFile(join(sourceDir, "main.js"), join(OBSIDIAN_PLUGIN_DIR, "main.js")),
  copyFile(join(sourceDir, "manifest.json"), join(OBSIDIAN_PLUGIN_DIR, "manifest.json")),
  copyFile(join(sourceDir, "versions.json"), join(OBSIDIAN_PLUGIN_DIR, "versions.json")),
]);