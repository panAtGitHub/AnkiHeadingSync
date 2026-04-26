import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const outputDir = join(rootDir, "dist", "plugin");
const stylesSourcePath = join(rootDir, "styles.css");

await mkdir(outputDir, { recursive: true });

let hasStylesheet = false;
try {
  await access(stylesSourcePath);
  hasStylesheet = true;
} catch {
  hasStylesheet = false;
}

const stageTasks = [
  copyFile(join(rootDir, "manifest.json"), join(outputDir, "manifest.json")),
  copyFile(join(rootDir, "versions.json"), join(outputDir, "versions.json")),
];

if (hasStylesheet) {
  stageTasks.push(copyFile(stylesSourcePath, join(outputDir, "styles.css")));
}

await Promise.all(stageTasks);

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
    ...(hasStylesheet ? ["- styles.css"] : []),
  ].join("\n"),
  "utf8",
);
