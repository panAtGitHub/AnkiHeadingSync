import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OBSIDIAN_PLUGIN_DIR } from "./obsidian-plugin-path.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const target = process.argv[2] === "obsidian" ? "obsidian" : "dist";
const outputDir = target === "obsidian" ? OBSIDIAN_PLUGIN_DIR : join(rootDir, "dist", "plugin");

await mkdir(outputDir, { recursive: true });

await Promise.all([
  copyFile(join(rootDir, "manifest.json"), join(outputDir, "manifest.json")),
  copyFile(join(rootDir, "versions.json"), join(outputDir, "versions.json")),
]);

await writeFile(
  join(outputDir, "README.md"),
  [
    "Anki Heading Sync — Obsidian plugin package",
    "",
    target === "obsidian"
      ? `npm run build deploys this plugin package directly to ${OBSIDIAN_PLUGIN_DIR}.`
      : "Development output lives in this folder for local inspection.",
    "This build flow only overwrites plugin package files and does not touch data.json.",
    "",
    "Included files:",
    "- manifest.json",
    "- main.js",
    "- versions.json",
  ].join("\n"),
  "utf8",
);
