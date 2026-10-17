# Anki Heading Sync 1.0.6

- Use window.setTimeout and window.clearTimeout for settings debounce timers, addressing the three code warnings in the Obsidian scorecard.
- Build, test, and publish releases through GitHub Actions with artifact attestations for main.js, manifest.json, and styles.css.
- Keep both dead-sea-example.md and dead-sea-example.apkg as intentional manual-download examples. Obsidian installs only the runtime files; its additional-assets notice is expected.

升级时仅替换 main.js、manifest.json、styles.css，保留 data.json。示例文件继续随版本提供，供手动下载。
