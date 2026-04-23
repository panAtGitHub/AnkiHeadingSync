# Tag Sync And Pure Tag Line Gap Report

## 审查范围

本次审查覆盖当前真实同步链路中的以下实现面：

1. `PluginSettings`、默认值、校验、持久化、设置页、i18n
2. `SourceFile`、`IndexedCard`、`PluginState`、`FileState`、`GroupBlockState`
3. `ObsidianVaultGateway`
4. `CardIndexingService`、`FileIndexerService`、`DiffPlannerService`
5. `ManualCardRenderer` 与 `RenderConfigService`
6. `QaGroupBlockParser`、`QaGroupSyncService`
7. `AnkiGateway`、`AnkiConnectGateway`、`AnkiBatchExecutor`
8. 现有相关测试

## 当前可复用能力

### 1. 标签字段已经预留到卡片状态

当前仓库已经在以下对象中保留了 `tagsHint`：

1. `IndexedCard`
2. `CardState`
3. `ManualSyncService.buildNextState()`
4. `DataJsonPluginStateRepository.migrateCardState()`
5. `AnkiBatchExecutor` 的新建 note 路径

这意味着普通卡的 tags 同步不需要新增整套 state 结构，只需要把真实文件级 tags 写进去，并让 diff / executor 真正使用。

### 2. deck fingerprint 已经承担“设置变化触发重读”职责

`FileIndexerService.createDeckRulesFingerprint()` 已经用于：

1. 文件未改但设置变化时强制重读
2. rebuild / normal sync 的增量失效

这可以直接复用来让“标签同步开关”和“纯标签行保留开关”升级后触发重新扫描。

### 3. QA Group 已有独立同步链路

`QaGroupSyncService` 已独立处理：

1. note 创建
2. note 更新
3. deck 覆盖
4. GI marker 写回

因此 QA Group 不是缺失同步能力，而是当前没有接入 tags，也没有接入正文纯标签行清理。

## 当前缺口

### 1. `SourceFile` 没有文件级 tags

当前 `SourceFile` 只有：

1. `path`
2. `basename`
3. `content`

`ObsidianVaultGateway.toSourceFile()` 也只读取 `cachedRead()`，没有读取 `metadataCache.getFileCache(file)`，因此：

1. frontmatter tags 不会进入同步链路
2. inline tags 不会进入同步链路
3. nested tags 不会进入同步链路

### 2. `CardIndexingService` 明确把 `tagsHint` 写死为空数组

当前 basic / cloze / semantic QA 三条路径都写：

1. `tagsHint: []`

这直接阻断了普通卡片的标签同步。

### 3. QA Group 创建和更新固定使用空 tags

`QaGroupSyncService` 在 create 路径里固定传：

1. `tags: []`

更新路径只更新字段与 deck，不比较或同步现有 note tags，因此 QA Group 当前完全不覆盖标签。

### 4. `AnkiGateway` / `AnkiConnectGateway` 没有 note tags 读写能力

当前接口层缺少：

1. `AnkiNoteSummary.tags`
2. `syncNoteTags()`
3. add / remove tag 的批量接口封装

`AnkiConnectGateway.getNoteDetails()` / `getNoteSummaries()` 也没有把 `notesInfo` 返回的 tags 映射出来。

这意味着更新已有 note 时，仓库没有能力做“以 Obsidian 为准”的 tag 覆盖。

### 5. `DiffPlannerService` 不把 tags 变化视为更新条件

当前 `fieldsChanged` 只比较：

1. `rawBlockHash`
2. `renderConfigHash`
3. `orphan`

没有比较 `tagsHint`。因此即使只改了标签，也不会进入 `toUpdate`。

### 6. 纯标签行清理尚未进入任何正文渲染链路

当前 `ManualCardRenderer.renderMarkdown()` 只处理：

1. code fence / inline code 保护
2. 数学
3. cloze / highlight
4. embeds / wikilinks

没有任何“纯标签行”删除逻辑。

### 7. `renderConfigHash` 不感知纯标签行保留开关

当前 `RenderConfigService` 的 hash 只包含：

1. `cardType`
2. `noteModel`
3. `mapping`
4. `addObsidianBacklink`
5. `convertHighlightsToCloze`

缺少“是否保留纯标签行”。因此即使切换该设置改变了最终正文，也不会触发更新。

### 8. QA Group 不走普通 renderer，是本次实现的仓库差异点

真实仓库中 QA Group 不通过 `ManualCardRenderer` 渲染，而是：

1. parser 直接抽 `stem` / `item.title` / `item.answer`
2. `QaGroupSyncService` 直接组装 `Stem / Sxx_Q / Sxx_A`

这与计划中“统一正文渲染链路”的表述存在实现差异。

如果只把纯标签行清理加进 `ManualCardRenderer`，QA Group 会成为遗漏路径。

### 9. 设置层缺少两个布尔字段的全链路支持

当前设置里不存在：

1. `syncObsidianTagsToAnki`
2. `keepPureTagLinesInCardBody`

因此默认值、校验、保存回填、设置页、i18n、settings tests 都需要补齐。

## 集成风险

### 1. 不能把 metadata tags 提取和正文纯标签行清理混成一个步骤

真实仓库里：

1. tags 属于文件级 metadata
2. 正文渲染是卡片级文本处理

两者归属不同。混在一起会让“关闭标签同步但继续清理正文”无法成立。

### 2. 不能只在新建 note 时写 tags

当前新建路径已经能把 `tagsHint` 传给 `addNote/addNotes`。但如果不补更新路径：

1. 旧 note 标签不会被覆盖
2. Anki 手工标签不会被删
3. 单向覆盖语义会失效

### 3. 不能只靠 raw markdown 变化触发正文更新

纯标签行保留开关变化不会改源文件，只会改渲染结果。

如果不把该开关纳入 `renderConfigHash`，设置切换后不会有更新计划。

## 建议的最小落点

1. 在 `ObsidianVaultGateway` 扩展 `SourceFile.tags`
2. 在独立共享工具中实现 tag normalization
3. 在独立共享工具中实现 body pure-tag-line cleanup
4. 在 `CardIndexingService` 写入 basic / cloze / semantic QA 的 `tagsHint`
5. 在 `QaGroupSyncService` 接入 file-level tags 与 body cleanup
6. 在 `RenderConfigService` 与 `DiffPlannerService` 接入设置变化和 tag 变化
7. 在 `AnkiGateway` / `AnkiConnectGateway` / `AnkiBatchExecutor` 完成已有 note 的 tag diff 覆盖

## 与计划的显式偏差

只有一个需要记录的仓库兼容偏差：

1. QA Group 不会接入 `ManualCardRenderer`
2. 纯标签行清理会抽成共享文本预处理，并同时供普通卡 renderer 与 QA Group 字段构造复用
这样既保持计划的产品语义一致，也尊重仓库当前 QA Group 的专用同步路径。