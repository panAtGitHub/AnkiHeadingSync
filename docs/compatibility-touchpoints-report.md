# 兼容性触点报告

## 分析边界

- 只评估当前 manual-sync 主链，不把旧 syncRegistry 主链当成最终方案。
- 证据来源限定为四类真值：仓库代码、用户提供的旧 Markdown 样本、用户提供的新 Markdown 样本、实时 AnkiConnect 返回。
- 目标问题只有一个：当前主链能否安全接管由 Obsidian to Anki 生成的旧卡，并继续后续同步。

## 结论先行

当前主链不能直接接管旧卡。核心阻塞点不是 note model，也不是 deck，而是 identity bootstrap。

- 旧样本只提供 legacy noteId marker：`<!--ID: 1760624596099-->`
- 新主链只识别 AHS marker：`<!-- AHS:card=ahs_xxx note=1776515511477 -->`
- 当前状态层以 `cardId -> noteId` 为主键，而不是以 `noteId` 为主键
- 因此，旧文件在首次进入当前主链时，既拿不到 `marker.cardId`，也拿不到 `pluginState.cards[cardId]`，最后只能被当成新卡创建

这意味着“直接接管”会造成重复建卡，而不是认领旧卡。

## 关键触点一览

| 触点 | 当前行为 | 兼容性影响 | 结论 |
| --- | --- | --- | --- |
| `src/domain/manual-sync/services/CardMarkerService.ts` | `isCandidate()` 和 `parse()` 只认 `<!-- AHS:card=... note=... -->` | 旧样本 `<!--ID: ...-->` 对主链是不可见 marker | 不兼容 |
| `src/domain/manual-sync/services/CardIndexingService.ts` 的 `extractMarker()` | 只会剥离 AHS marker；没识别出的 legacy marker 会被保留在正文里 | 旧 marker 不会转成 `noteId`，还会污染 `bodyMarkdown` 与 `rawBlockHash` | 不兼容 |
| `src/domain/manual-sync/services/CardIndexingService.ts` 的 `resolveIdentity()` | 解析顺序是 `marker.cardId -> pendingWriteBack -> knownCards(filePath, rawBlockHash) -> 生成新 cardId` | 旧文件首次扫描时三条已有身份路径都不存在，必然生成新 `cardId` | 不兼容 |
| `src/domain/manual-sync/services/DiffPlannerService.ts` | `resolvedNoteId` 为空就进入 `toCreate` | 旧卡不会被“接管更新”，而会被“新建重复卡” | 不兼容 |
| `src/domain/manual-sync/entities/PluginState.ts` | `cards` 以 `cardId` 为 key，状态里没有 legacy marker 元数据位 | 当前状态容器无法直接承接“只有 noteId、没有 cardId”的旧卡 | 不兼容 |
| `src/infrastructure/persistence/DataJsonPluginStateRepository.ts` | 只读取 `snapshot.pluginState`，不会消费 `syncRegistry` | 即便 data.json 里还有旧 `syncRegistry` 记录，manual-sync 也不会拿来认领旧卡 | 不兼容 |
| `src/application/services/FileIndexerService.ts` | 只把 `pluginState.cards` 和 `pendingWriteBack` 喂给 indexer | 旧卡若没先迁入 `pluginState`，主链没有任何第二身份来源 | 不兼容 |
| `src/application/services/MarkdownWriteBackService.ts` | 只会写入新的 AHS marker | 如果直接跑在旧文件上，会在 legacy marker 后再插入一个 AHS marker，而不是替换旧 marker | 有风险 |
| `src/domain/manual-sync/services/DeckExtractionService.ts` + `DeckNormalizationService.ts` | 会提取 `TARGET DECK`，并保留 deck segment 原文，只做分隔符规范化 | 旧样本里的 `[[anki背诵]]::[[《城市居住区规划设计标准》图解2021年]]` 能被原样保留 | 兼容 |
| `src/domain/manual-sync/services/ManualCardRenderer.ts` | 当前渲染会在背面追加 `Open in Obsidian` backlink | 即使完成接管，后续同步也会把旧卡字段逐步归一到新渲染样式 | 条件兼容 |
| `src/application/services/HeadingSyncMarkerService.ts` + `src/domain/card/services/CardExtractionService.ts` | 旧链路支持的是 `<!-- AHS:123 -->` 这种 noteId-only marker | 这和本次真实旧样本的 `<!--ID: ...-->` 不是同一种格式，也不在 current manual-sync 主链里 | 不能直接复用 |

## 代码触点拆解

### 1. Marker 语义已经换代

当前 manual-sync 的 marker 不是“把 noteId 嵌进去就行”，而是显式要求：

- 一个稳定的 `cardId`
- 一个可选的 `noteId`
- 一个确定的 AHS marker 字面量

旧样本只有 `noteId`，没有 `cardId`。这不是缺一个字段那么简单，而是整个主链的身份主键已经从 `noteId` 切成了 `cardId`。

### 2. 当前主链不会利用旧 `syncRegistry`

实时 data.json 里仍然同时存在：

- `syncRegistry.records[].identityMode = "embedded-note-id"`
- `pluginState.files / pluginState.cards`

但 `DataJsonPluginStateRepository` 只加载 `pluginState`，manual-sync 完全不看 `syncRegistry`。所以旧状态即便还在 data.json 里，也不会自动帮助旧卡进入新主链。

### 3. Deck 不是阻塞点

这是这次分析里最重要的反向结论之一。

- 旧样本 Markdown 明确声明了 `TARGET DECK: [[anki背诵]]::[[《城市居住区规划设计标准》图解2021年]]`
- 旧样本 live card 的 `cardsInfo.deckName` 也正是这个 wikilink deck 字符串
- 当前 `DeckNormalizationService` 不会剥掉 `[[...]]`，只会规范 `/`、`\` 和 `::`

因此，旧 deck 的字面值兼容是成立的。真正不兼容的是 identity，不是 deck。

### 4. Note model 与字段映射也不是阻塞点

实时样本显示：

- 旧样本 live note：`modelName = 问答题`，字段为 `正面 / 背面`
- 新样本 live note：`modelName = 问答题`，字段为 `正面 / 背面`
- 当前插件设置：`basic:问答题 -> titleField=正面, bodyField=背面`

所以旧卡与新卡在 Anki 侧的数据模型是兼容的，后续接管不需要做 note type 迁移。

## 最终触点判断

### 已兼容

- 旧 deck 字符串可继续沿用
- 旧 note model / 字段映射与当前设置兼容
- 旧 noteId 在 Anki 中真实存在，具备可迁移基础

### 未兼容

- legacy marker 识别
- 首次 identity 认领
- 旧状态向 `pluginState` 的引导
- 直接运行时的防重复保障

### 因此得到的主结论

当前主链不属于“可直接接管”。

它属于“可以接管，但必须先做一次迁移写回”：

- 先把旧 `noteId` 身份翻译成新 `cardId + noteId` 身份
- 再把 Markdown marker 和 `pluginState` 一次性对齐到 current manual-sync 语义
