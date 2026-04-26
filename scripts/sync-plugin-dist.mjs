import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OBSIDIAN_PLUGIN_DIR } from "./obsidian-plugin-path.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const sourceDir = join(rootDir, "dist", "plugin");

await mkdir(OBSIDIAN_PLUGIN_DIR, { recursive: true });

await Promise.all([
  copyFile(join(sourceDir, "main.js"), join(OBSIDIAN_PLUGIN_DIR, "main.js")),
  copyFile(join(sourceDir, "manifest.json"), join(OBSIDIAN_PLUGIN_DIR, "manifest.json")),
]);

const stylesPath = join(sourceDir, "styles.css");
try {
  await access(stylesPath);
  await copyFile(stylesPath, join(OBSIDIAN_PLUGIN_DIR, "styles.css"));
} catch {
  // This plugin currently has no stylesheet build artifact.
}
