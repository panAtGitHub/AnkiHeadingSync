# Anki Heading Sync 1.0.5

- Add a ribbon button for syncing the configured vault scope to Anki.
- Clean up entire empty deck hierarchies from children to parents, rechecking each deck before deletion and preserving unselected or newly populated descendants.
- Isolate unavailable Anki deck statistics without treating missing counts as zero.
- Configure the Windows local development sync target.

## 安装与升级

将 main.js、manifest.json、styles.css 复制到笔记库的 .obsidian/plugins/anki-heading-sync/，保留 data.json，然后重新加载插件。

附带 dead-sea-example.md 和 dead-sea-example.apkg。需要多级列表问答模板时可导入示例牌组。
