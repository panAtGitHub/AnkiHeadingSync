import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const distDir = join(rootDir, "dist");
const pluginDistDir = join(distDir, "plugin");

await mkdir(pluginDistDir, { recursive: true });
await rm(join(distDir, "main.js"), { force: true });

await Promise.all([
  copyFile(join(rootDir, "manifest.json"), join(pluginDistDir, "manifest.json")),
  copyFile(join(rootDir, "versions.json"), join(pluginDistDir, "versions.json")),
]);

await writeFile(
  join(pluginDistDir, "README.md"),
  [
    "Anki Heading Sync — Obsidian plugin distribution package",
    "",
    "Build output lives in this folder so it can be synced directly into an Obsidian plugin directory.",
    "",
    "Included files:",
    "- manifest.json",
    "- main.js",
    "- versions.json",
  ].join("\n"),
  "utf8",
);