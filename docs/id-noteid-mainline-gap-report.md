# ID NoteId Mainline Gap Report

## Scope

本报告只针对当前 manual-sync 主链，审查它与本轮契约之间的偏差：

- 主链 durable identity 切换为 `<!--ID: noteId-->`
- 满足当前标题级别规则的旧卡支持按 `ID` marker 重接进
- 认领成功后按当前 renderer 重渲染更新
- plugin state / writeback / execution 全部切到 noteId 主身份

## Executive Summary

当前实现与本轮契约的偏差是系统性的，不是局部修补能解决的小问题。

当前 manual-sync 主链仍然围绕以下假设建立：

- Markdown marker 协议是 `<!-- AHS:card=... note=... -->`
- `cardId` 是 durable identity
- `PluginState.cards` 以 `cardId` 作为 key
- `pendingWriteBack` 以 `cardId` 追踪
- 一次运行内与持久化状态共用同一身份键

而本轮契约要求：

- `<!--ID: noteId-->` 成为唯一主链 marker 协议
- `noteId` 成为 durable identity
- `syncKey` 只作为单次运行内的相关键
- 旧 `ID` marker 卡片可以在满足当前标题规则时被认领并重渲染

结论：当前主链必须做一次贯穿 marker、index、plan、execute、state、writeback 的统一重构。

## Gap Inventory

### 1. Marker protocol is wrong

文件：`src/domain/manual-sync/services/CardMarkerService.ts`

现状：

- 候选 marker 只看 `<!-- AHS:`
- 合法 marker 只接受 `<!-- AHS:card=... note=... -->`
- create/writeback 也只会生成 AHS marker
- service 内还负责生成新的 `cardId`

与契约冲突：

- 主链 marker 必须切为 `<!--ID: noteId-->`
- 合法 marker 只能接受正整数 noteId
- 非法 trailing `<!--ID: ...-->` 候选也要剥离并占用 marker 槽位
- 主链不再以 marker 生成 durable `cardId`

影响：

- 当前主链无法识别旧卡 marker
- 当前 writeback 永远不会写出正确协议

### 2. IndexedCard schema still treats cardId as durable identity

文件：`src/domain/manual-sync/entities/IndexedCard.ts`

现状：

- `IndexedCard` 仍持有 `cardId`
- 仍使用 `markerState = "missing" | "card-only" | "card-and-note"`
- 没有 `syncKey`
- 没有 `idMarkerState`
- 没有 `noteIdSource`

与契约冲突：

- durable `cardId` 应从主链 index 结果中移除
- 需要新增运行内 `syncKey`
- 需要区分 marker 是否存在且是否合法
- 需要显式记录 noteId 来源是 marker / state recovery / pending writeback

影响：

- 后续 planning / execution 无法按契约判断“认领”“恢复”“重写 marker”

### 3. Persisted state schema is still cardId-centric

文件：`src/domain/manual-sync/entities/PluginState.ts`

现状：

- `FileState.cardIds` 仍然存在
- `CardState.cardId` 仍然存在
- `CardState.noteId` 仍是可选
- `PendingWriteBackState` 用 `cardId` 追踪
- `PluginState.cards` 的 key 仍隐含为 `cardId`

与契约冲突：

- `PluginState.cards` 必须改为 `String(noteId)` 键控
- `FileState.cardIds` 必须改为 `noteIds`
- `CardState.noteId` 必须是必填
- `pendingWriteBack` 必须改成按块身份追踪

影响：

- 当前 persisted state 不能作为 noteId 主身份的真相源

### 4. State repository has no schema migration

文件：`src/infrastructure/persistence/DataJsonPluginStateRepository.ts`

现状：

- `load()` 只是直接返回 `snapshot.pluginState`
- 不迁移旧 `cards[cardId]`
- 不迁移 `files[].cardIds`
- 不丢弃旧 pending writeback

与契约冲突：

- 需要在 load 阶段显式升级旧 schema
- 旧 `pendingWriteBack` 要直接丢弃

影响：

- 主链切协议后，旧状态无法安全进入新主链

### 5. Indexing still resolves identity by cardId

文件：`src/domain/manual-sync/services/CardIndexingService.ts`

现状：

- marker extraction 只识别 AHS marker
- `resolveIdentity()` 顺序是：marker cardId -> pending by cardId -> knownCards by rawBlockHash -> 生成新 cardId
- `usedCardIds` 用于去重
- `rawBlockHash` 当前只会剥除 AHS marker，不会剥除旧 `ID` marker

与契约冲突：

- 先识别“当前标题规则命中的块”，再处理 ID marker
- identity resolution 必须变成：marker noteId -> unique same-file rawBlockHash state recovery -> pending writeback -> undefined
- 去重必须基于 noteId，而不是 cardId
- `rawBlockHash` 必须基于剥除合法/非法 trailing ID marker 后的内容计算

影响：

- 旧 `<!--ID: ...-->` 卡会被当成正文内容
- 会错误走新建分支

### 6. Planner still assumes cardId + markerNoteId semantics

文件：`src/domain/manual-sync/services/DiffPlannerService.ts`

现状：

- 使用 `cardsById` 按 `card.cardId` 去重
- 读取 `state.cards[card.cardId]`
- `pendingWriteBack` 按 `cardId` 命中
- `toRewriteMarker` 依赖 `markerState = missing/card-only`
- orphan 识别依赖 `card.cardId`

与契约冲突：

- 规划必须以最终 noteId 和运行内 syncKey 为中心
- recovered noteId、invalid marker、新创建 note 都要触发 rewrite marker
- blocks with existing noteId but no state 也能正常进入 update path

影响：

- 当前 planner 无法正确表达“旧卡重接进 + 重写 ID marker”

### 7. Executor still uses cardId as the main run-time correlation key

文件：`src/application/services/AnkiBatchExecutor.ts`

现状：

- `resolvedNoteIds` 按 `card.cardId` 保存
- `touchedCardIds` 按 `card.cardId` 保存
- `markerWriteMap` 按 `card.cardId` 保存
- rendered cards map 也依赖 `card.cardId`

与契约冲突：

- durable identity 不能再依赖 cardId
- 运行内相关键应切为 `syncKey`
- note existence check 失败时应降级到 create flow，并最终写回真实 `<!--ID: newNoteId-->`

影响：

- 即便 planner 修好，executor 仍会把旧身份流重新扭回 cardId 模式

### 8. Markdown writeback still writes by cardId

文件：`src/application/services/MarkdownWriteBackService.ts`

现状：

- 结果结构返回 `writtenCardIds`
- 写回请求包含 `cardId`
- pending entry 保存 `cardId`
- target marker 仍通过 AHS marker service 生成

与契约冲突：

- 写回必须统一输出 `<!--ID: noteId-->`
- pending writeback 要按 `(filePath, blockStartLine, rawBlockHash)` 追踪
- 结果结构也应转向 noteId/syncKey 语义

影响：

- 当前 writeback 不能支撑新 marker 协议和新 pending shape

### 9. Tests are still asserting the old contract

主要文件：

- `src/domain/manual-sync/services/CardMarkerService.test.ts`
- `src/domain/manual-sync/services/CardIndexingService.test.ts`
- `src/domain/manual-sync/services/DiffPlannerService.test.ts`

现状：

- 测试名称和断言大量依赖 `cardId`
- 大量断言使用 AHS marker 字面值
- 缺少“invalid ID marker but valid block”“not matching heading rules -> ignore marker”“schema migration”这类契约要求

影响：

- 即使代码完成重构，现有测试也会大面积误报失败
- 当前测试对本轮目标没有形成足够保护

## Architecture Notes

### Good existing structure worth preserving

- `ManualSyncService -> FileIndexerService -> DiffPlannerService -> AnkiBatchExecutor -> MarkdownWriteBackService` 这条主链分层是合理的
- 当前 rendering boundary 仍然干净，可以直接复用在旧卡重接进后的重渲染更新
- `DeckResolution` 和 deck migration 相关逻辑与本轮冲突较少，应尽量少动

### Mainline drift that must be removed

- main sync durable identity 仍与 module 3/4 的 AHS assumptions 紧耦合
- `cardId` 同时承担 persisted identity 和 in-run correlation key，两类职责未分离

## Required Repair Direction

必须完成的主修复方向：

1. marker 协议切换到 `<!--ID: noteId-->`
2. `noteId` 成为持久主身份，`syncKey` 成为运行内相关键
3. state schema 与 repository load 做显式迁移
4. index / plan / execute / writeback 全链去掉 durable `cardId` 依赖
5. 增加对“满足当前标题规则且带旧 `ID` marker”的重接进与重渲染支持
6. 重写对应测试，补足 integration 覆盖

## Out Of Scope

根据契约，本轮明确不做：

- 继续支持 `<!-- AHS:card=... note=... -->` 文件
- 双 marker 并读
- 旧 HTML 保留模式
- 不匹配标题规则的 `ID` marker 清理工具
- legacy heading compatibility mode
