# Cleanup / Reset Decisions

## 1. 命令边界

两个能力都作为显式管理命令实现，不接入 `ManualSyncService` 的普通同步主链路：

1. `清空当前文件已同步卡片`
2. `清理空牌组`

这样可以直接满足“普通 sync / rebuild / orphan 语义不变”的硬约束。

## 2. AnkiGateway 扩展

新增接口：

1. `deleteNotes(noteIds: number[]): Promise<void>`
2. `listDeckNames(): Promise<string[]>`
3. `getDeckStats(deckNames: string[]): Promise<Array<{ deckName: string; noteCount: number }>>`
4. `deleteDecks(deckNames: string[]): Promise<void>`

实现策略：

1. 上层只看“列 deck / 判空 / 删除 deck”语义
2. AnkiConnect action 的兼容细节全部封装在 `AnkiConnectGateway`
3. `getDeckStats` 只要求足够判断空 deck；如果底层返回的是 card 统计而不是 note 统计，网关内部统一映射为 `noteCount` 风格字段供上层使用

## 3. Current-file reset 编排

新增独立 use case：`ClearCurrentFileSyncedCardsUseCase`。

固定执行顺序：

1. 读取 `pluginState`
2. 找出当前文件对应 card records
3. 收集有 `noteId` 的 noteIds
4. 先调用 `deleteNotes`
5. 再尝试删除该文件内对应 marker
6. 最后保存清理后的本地 state

保存规则：

1. marker 删除成功时：删除对应 `pluginState.cards`、`pluginState.files[filePath].cardIds`、相关 `pendingWriteBack`
2. marker 删除失败时：不回滚已删除的 Anki notes；保留失败文件对应 card record，但清空其 `noteId`，并清理相关 `pendingWriteBack`

另外，无论 marker 删除成功还是失败，都删除该文件的 `FileState` 记录，强制下一次普通同步重新读取正文，而不是复用“当前文件没有卡片变更”的旧索引结论。

这样做的原因：

1. 文件内容仍带旧 marker 时，完全删除本地 state 会让后续索引误把旧 marker 的 `noteId` 当成仍可更新的 note
2. 保留 cardId 但清空 `noteId`，能让下一次普通同步把它当作“正文仍在、需要重新创建”的卡片，而不是对已删除 note 做 update

这是一项为满足“失败时保持内部一致”而做的最小兼容调整，不扩展成长期 tombstone 状态。

## 4. Marker removal 实现

不把删除逻辑塞进现有 `MarkdownWriteBackService`。

新增两层：

1. 纯内容变换：marker removal service
2. 文件改写编排：Markdown marker removal application service

删除原则：

1. 仅删除匹配的 AHS marker 行
2. 不改正文
3. 不调整其他 card block 顺序

## 5. Empty deck cleanup 编排

新增独立 use case：`CleanupEmptyDecksUseCase`。

分两步：

1. `listCandidates()`：列 deck、取统计、筛空 deck
2. `execute(selectedDeckNames)`：删除用户确认的 deck，并把“已不存在/已非空”归入 skipped

UI 选择发生在 presentation 层 modal 中，不下沉到 application 层。

## 6. Presentation 交互

新增两个 plugin 入口方法与两个命令注册项。

空 deck 清理使用一个小型多选 modal：

1. 先展示候选空 deck
2. 用户勾选
3. 确认删除后才调用 use case

如果没有候选 deck，则直接提示，不进入确认流程。

## 7. 结果类型与 notice

新增独立结果类型：

1. `ClearCurrentFileSyncedCardsResult`
2. `CleanupEmptyDecksResult`

不扩展 `ManualSyncResult`。

`NoticeService` 新增两组摘要：

1. reset：deleted notes、removed markers、deleted local records、failed/conflict files
2. empty decks：candidate count、selected count、deleted count、skipped count

## 8. 索引兼容修正

当 marker 中有 cardId，且本地 `CardState` 已存在但 `noteId` 被清空时，索引恢复身份时应优先信任本地 state 的“无 noteId”结果，而不是回退到 marker 里的旧 `noteId`。

该修正只服务于 reset 命令的失败恢复，不改变普通同步的删除语义。

## 9. 测试范围

至少覆盖：

1. current-file reset 的全成功路径
2. current-file reset 的无 `noteId` 路径
3. current-file reset 的 marker 写回失败路径
4. reset 后普通同步可重建
5. empty deck 候选识别
6. empty deck 手选删除
7. 已非空/已不存在 deck 的 skip 汇总
8. 普通 sync / rebuild / orphan 行为不变