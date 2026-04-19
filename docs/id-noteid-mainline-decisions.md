# ID NoteId Mainline Decisions

## Decision Summary

本轮实现严格按如下决策收口：

1. `<!--ID: noteId-->` 是 manual-sync 主链唯一 marker 协议
2. `noteId` 是 durable identity
3. `syncKey` 只用于一次 sync 运行内的关联，不落盘
4. 旧 `ID` marker 卡片只在“满足当前标题级别规则”时才参与认领/重渲染
5. 认领成功的旧卡一律使用当前 renderer 重渲染更新，不保留旧 HTML 风格
6. 已有 AHS-marker 文件本轮不做兼容，不做迁移

## Concrete Decisions

### 1. Marker service 直接重构，不保留 AHS dual mode

- 继续沿用 `CardMarkerService` 这个文件名以控制改动范围
- 但服务语义改成 ID marker service
- 删除 `generateCardId()` 及所有 AHS-specific create/parse 逻辑
- `create(noteId)` 永远输出 `<!--ID: <noteId>-->`

原因：

- 本轮契约明确不支持 dual marker
- 保留 dual mode 只会把旧 AHS 分支继续带进主链

### 2. IndexedCard 保留 `noteId?`，新增 `syncKey`

- durable `cardId` 从 `IndexedCard` 删除
- 新增 `syncKey = filePath + "\0" + blockStartLine + "\0" + rawBlockHash`
- `idMarkerState` 固定为：`missing | present-valid | present-invalid`
- `noteIdSource` 固定为：`marker | state-recovery | pending-writeback | undefined`

原因：

- `syncKey` 适合在 planner/executor/writeback 间做单次运行内关联
- 不需要再把 cardId 作为系统稳定主键

### 3. Persisted state 全部切到 noteId 主身份

- `PluginState.cards` 保持字段名，但 key 改为 `String(noteId)`
- `CardState.noteId` 改为必填
- `CardState.cardId` 删除
- `FileState.cardIds` 改为 `noteIds`
- `PendingWriteBackState` 改为：
  - `filePath`
  - `blockStartLine`
  - `rawBlockHash`
  - `targetNoteId`
  - `expectedFileHash`
  - `targetMarker`

原因：

- 这正好对应本轮 durable identity contract
- pending writeback 的匹配条件也必须改成块身份，而不是 cardId

### 4. Repository load 承担 schema migration

- 迁移点放在 `DataJsonPluginStateRepository.load()`
- 旧 `cards[cardId]` 如果带合法 `noteId`，迁成 `cards[String(noteId)]`
- 旧 `files[].cardIds` 迁成 `files[].noteIds`
- 旧 `pendingWriteBack` 一律丢弃

原因：

- 这是最靠近持久化边界的位置
- 可避免把 schema upgrade 逻辑散落到 service 层

### 5. Identity resolution 按契约固定顺序实现

- 先 valid trailing ID marker
- 再唯一 same-file rawBlockHash state recovery
- 再 pending writeback 命中
- 否则 `noteId = undefined`

补充决策：

- rawBlockHash 基于剥离 trailing valid/invalid ID marker 后的正文计算
- duplicate noteId claim 时，只保留首次 claim，后续 claim 降级为 `undefined`

原因：

- 这能同时满足旧卡重接进、marker 被手动删掉后的恢复，以及创建路径的确定性

### 6. Diff planning 不引入额外兼容模式

- `toCreate`、`toUpdate`、`toChangeDeck`、`toRewriteMarker`、`toOrphan` 按用户契约原样实现
- blocks not matching heading rules 在 index 阶段就不进入 planner

原因：

- 避免 planner 再承担“忽略不匹配标题块”的第二层分支

### 7. Executor 用 syncKey 做 run-time correlation

- `resolvedNoteIds` 改为 `Map<string, number | undefined>`，key 是 `syncKey`
- `touchedCardIds` 改名并改语义为 touched note/sync keys
- marker write map 以 `syncKey` 为 key
- rendered cards map 也以 `syncKey` 为 key

原因：

- 这能把“本次运行内引用”与“持久 identity”彻底分开

### 8. Reconnect success always means re-render

- 只要 block 满足当前标题级别规则
- 且 `<!--ID: noteId-->` 合法且 Anki 中 note 存在
- 就认领该 note
- 然后用当前 renderer 重新计算 fields 并更新该 note

原因：

- 这是本轮明确的产品契约
- 不再引入 preserve legacy HTML mode

### 9. Not matching heading rules means total silence

- 不解析 marker
- 不 strip marker
- 不访问 Anki
- 不创建、不更新、不写回、不 warning

原因：

- 这是本轮必须实现的静默忽略语义

### 10. Test strategy

- 重写 marker/index/planner/writeback 的单元测试到新协议
- 为旧 `ID` marker 接管行为补 integration tests
- migration 行为至少覆盖 repository load 级别或 service 可观察级别

原因：

- 现有测试大多锁定 AHS/cardId 旧契约，不能继续作为主保护层

## Intentional Non-Decisions

以下事项本轮不做延伸决策：

- AHS marker 文件后续怎么迁
- 是否需要独立 migration command
- 是否给 ignored `<!--ID: ...-->` 块做可视化提示
- 是否为旧样本提供 heading policy compatibility mode

这些都超出本轮范围。
