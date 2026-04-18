import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const outputDir = join(rootDir, "dist", "plugin");

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
    "Build output lives in this folder for packaging, release zips, and manual vault sync.",
    "This build flow only overwrites plugin package files and does not touch data.json.",
    "",
    "Included files:",
    "- manifest.json",
    "- main.js",
    "- versions.json",
  ].join("\n"),
  "utf8",
);
