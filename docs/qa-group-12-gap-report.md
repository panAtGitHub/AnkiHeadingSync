# QA Group 12 Gap Report

## Scope

本报告基于真实仓库现状，审查当前 manual-sync 主链与“`#anki-list` QA Group 12 并行路线”之间的差距。

重点检查：

- `CardIndexingService`
- `SemanticQaListParser`
- `DiffPlannerService`
- `AnkiBatchExecutor`
- `MarkdownWriteBackService`
- `PluginState`
- `AnkiConnectGateway`
- settings / validation / settings UI

## Current Reality

### 1. 当前主链仍然是单卡 `IndexedCard` 主线

真实主链为：

- `FileIndexerService`
- `CardIndexingService`
- `DiffPlannerService`
- `ManualCardRenderer`
- `AnkiBatchExecutor`
- `MarkdownWriteBackService`
- `PluginState`

这条链的核心假设是：

- 一个索引单元对应一个 `IndexedCard`
- 一个 `IndexedCard` 对应一个 `noteId`
- `PluginState.cards` 以 `noteId` 为 key
- `DiffPlannerService` 以 `noteId` 和 `renderConfigHash` 做单 note diff
- `AnkiBatchExecutor` 的 create/update 流程也是一条 card -> 一条 note

这意味着 QA Group 12 不能无损塞进现有 `IndexedCard` / `CardState` / `ManualSyncPlan`，否则会把 group block 强行伪装成“单题单 note 的普通卡”。

### 2. 现有 `semantic-qa` 只是单卡主线上的多卡拆分

当前 `semantic-qa` 的真实实现是：

- `CardIndexingService` 命中 `semanticQaMarker`
- `SemanticQaListParser` 把一个标题块拆成多个 `SemanticQaListCard`
- 每个子项都转成独立 `IndexedCard`
- 每个子项独立持有 `noteId`
- 每个子项独立写 `<!--ID: noteId-->`

所以它不是 group note，它仍属于 atomic 路线。

### 3. 当前 write-back 只理解 `<!--ID: noteId-->`

当前 marker 写回链路：

- `CardMarkerService` 只支持 `<!--ID: ...-->`
- `MarkdownWriteBackService` 只会调用 `CardMarkerService.applyBatch()`
- `PendingWriteBackState` 只存单卡 marker 的 block key / rawBlockHash / targetNoteId

没有：

- `GI` 协议
- 组级 marker 解析/序列化
- group block 的旧 inner marker 清理
- group block 的 repair 逻辑

### 4. 当前 state 只有 noteId-keyed atomic card state

`PluginState` 当前只有：

- `files`
- `cards`
- `pendingWriteBack`

其中：

- `cards` 只适合单卡记录
- key 是 `noteId`
- 没有 `GroupId`
- 没有 `itemId -> slot`
- 没有 group-level recovery state

### 5. 当前 Anki gateway 只具备基础 note/deck 能力

`AnkiGateway` / `AnkiConnectGateway` 当前支持：

- deck ensure/list/stats
- model name list
- model field names + templates 只在 `getModelDetails()` 内部做只读判断
- notesInfo/cardsInfo
- add/update/delete note
- change deck
- media upload

缺失本需求需要的能力：

- create model
- add fields
- add templates
- update templates
- update styling
- 按查询语句查 notes 以支持 recovery
- 获取 note fields 以恢复 slot 映射

### 6. 当前 settings 只对 semantic QA 有最小配置支持

当前 settings 已新增：

- `semanticQaMarker`
- `semanticQaNoteType`

settings UI 中也已有：

- `Semantic QA marker`
- semantic QA preview
- semantic QA mapping controls

但 QA Group 12 需要的最小新增项还不存在：

- `qaGroupMarker`
- 与 semantic marker 的冲突校验

### 7. 当前 field mapping UI 与 group route 不匹配

当前 `NoteFieldMappingService` 和 settings mapping UI 面向：

- `basic`
- `cloze`
- `semantic-qa`

这些路线都属于“插件生成 rendered title/body，再映射到 note fields”。

QA Group 12 的目标是固定模型协议：

- `Stem`
- `GroupId`
- `Src`
- `S01..S12`

这更适合 dedicated payload builder，而不是重用可配置 field mapping UI。

## What Fits The Reference Plan Well

以下点与真实仓库吻合：

1. 新路线应保持并行，不要破坏现有 semantic-qa。
2. 新路线应使用独立 marker。
3. `GroupId` 必须成为恢复主锚点。
4. `GI` 需要独立协议，而不是复用现有 `<!--ID: ...-->`。
5. Group 12 不适合走现有 note field mapping UI。
6. 需要补 Anki model 管理与 note 查询能力。

## What Needs Adjustment To Match This Repository

### 1. 不能把 group route 硬塞进 `DiffPlannerService`

参考方案强调并行类型，这一点在当前仓库里不是“可选优化”，而是必须条件。

原因：

- `DiffPlannerService` 的 `ManualSyncPlan` 全部是 `PlannedCard`
- `PlannedCard` 内核是 `IndexedCard + noteId`
- group route 一条 block 对应一条 note，但内部又有 1..12 个 slot 和 item-level identity

因此更合适的接法是：

- atomic 路线继续走现有 `IndexedCard -> DiffPlannerService -> AnkiBatchExecutor`
- group 路线在 `CardIndexingService` 之后并联出单独的 group block collection
- `ManualSyncService` 再显式执行一条 group-specific sync 分支

### 2. 当前 parser 层没有 warning 容器

参考方案里大量提到“skip 或 warning”。

当前 `CardIndexingService` / `SemanticQaListParser` 没有结构化 warning 输出面。若强行扩大会影响现有大量签名。

更适配当前仓库的做法是：

- parser 层以 deterministic parse result 为主
- 明确无效项直接跳过
- 对影响同步正确性的情况抛结构化 error
- warning 只在必要的 service 结果层补充

### 3. GI 丢失恢复不能只靠当前 `PluginState`

因为当前 state 只按 `noteId` 记 atomic card，group 需要新 state 分支，例如：

- `groupCards` 或等价 group state map
- key 为 `GroupId`

否则无法实现“先查本地 `GroupId`，再查 Anki”的恢复顺序。

### 4. v1 里的 `A` 规则必须简化为仓库可控实现

当前 semantic parser 对 deeper content 的处理是“整段 child region dedent 后作为 answer”。

但本需求明确希望 QA Group 12 v1 只取第一条二级列表项文本。为避免把 group route 复杂化成另一个 semantic parser 变体，应固定：

- 只取第一条二级列表项
- 更深内容不进入 `A`
- 若存在多个二级项，保留第一条，其他项忽略

这样最符合当前仓库的最小安全实现风格。

## Missing Pieces To Build

1. 新 settings 字段与校验：`qaGroupMarker`
2. 新 group domain model：marker/item/block/state/payload
3. 新 parser / serializer：GI + QA Group block
4. 新 group write-back service
5. 新 group state persistence
6. 新 Anki gateway model management / note query / field recovery 能力
7. 新 ManualSyncService group 分支
8. 新测试夹具与端到端回归

## Scope Drift Risks

以下内容不应在本轮扩张：

1. 动态 arity group model
2. group model field mapping UI
3. 自动执行 `Empty Cards`
4. 旧 semantic-qa 到 group route 的自动迁移
5. 复杂的多级答案结构合并
6. 重构整个 `ManualSyncPlan`

## Recommended Integration Path

最适合当前仓库的路径是：

1. 保留现有 atomic/basic/cloze/semantic-qa 全链路不动。
2. 在 `CardIndexingService` 内部新增 group route 识别，但 group 结果不转成 `IndexedCard`。
3. `FileIndexerService` 返回 atomic cards 之外，再返回 group block 集合。
4. `ManualSyncService` 在现有 atomic sync 前后增加显式 group sync 分支。
5. group route 拥有自己的 state、payload builder、write-back、recovery 和 gateway helper。

这条路径最符合当前仓库现实，也最容易保证旧路线不回归。