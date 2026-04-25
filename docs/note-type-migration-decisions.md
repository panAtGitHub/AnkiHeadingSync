# Anki Note Type 自动迁移实现决策

本文锁定本轮“同步时自动原地迁移 Anki note type”的仓库兼容实现方案。

## 1. 作用域决策

- 覆盖两条同步路径：
  - 普通卡 AnkiBatchExecutor
  - QA Group QaGroupSyncService
- 不改 PluginState schema。
- 不引入“迁移失败时自动新建替代 note”的 fallback。

## 2. Gateway 合同决策

- 在 src/application/ports/AnkiGateway.ts 新增：
  - UpdateAnkiNoteModelInput
  - updateNoteModel(input)
- 合同保持最小化：
  - noteId
  - modelName
  - fields
- 不把 source modelName 放进 gateway 入参。

原因：source model 是调用方上下文，不是 AnkiConnect action 的必要输入；保持合同和计划中的最小 payload 一致更稳妥。

## 3. AnkiConnect payload 决策

- updateNoteModel 固定调用 action = updateNoteModel。
- params 结构固定为：
  - note.id
  - note.modelName
  - note.fields
- 不从旧 note 读取字段并做转换。

## 4. 错误上下文决策

- Gateway 层只保证：
  - action 名
  - noteId
  - target modelName
  - 原始 AnkiConnect reason
- source modelName 在服务层补上，并最终转成 PluginUserError。

这是对计划的受控偏离：

- 计划要求 gateway 直接保留 fromModel/toModel。
- 仓库现实是 gateway 合同并不知道当前旧模型来自哪条业务路径。
- 因此 fromModel 放在调用层补齐，能保持接口最小且不引入只为错误文案存在的冗余入参。

## 5. QA Group note load 决策

- 新增显式加载结果类型：
  - missing
  - matching
  - model-mismatch
- tryLoadQaGroupNote() 不再在 model mismatch 时直接抛普通 Error。

## 6. QA Group 迁移流程决策

- 先按当前 Markdown 和当前 QaGroupFieldMapping 生成目标 fields。
- 容量校验继续使用：
  - requiredSlots = 当前 block.items.length 或恢复后 resolvedItems.length
  - targetCapacity = mapping.slots.length
- 如果已有 noteId：
  - missing -> addNote
  - matching -> 保持现有 updateNote 逻辑
  - model-mismatch -> updateNoteModel
- 迁移成功后：
  - noteId 保持不变
  - tags 继续按当前 diff 同步
  - deck 继续按当前逻辑迁移
  - marker/state 继续按当前成功路径写回
- 迁移失败后：
  - 不 addNote
  - 不删旧 note
  - 不写 marker
  - 不更新 syncedGroupBlocks
  - 直接抛 PluginUserError

## 7. QA Group 字段写入决策

- 继续复用现有 buildQaGroupNoteFields() 语义：
  - titleField 写当前 stem
  - 已映射 question/answer slot 先清空
  - 已使用 slot 写当前 Markdown 内容
  - legacy internal fields 仅在旧托管模型字段存在时清空
- 不写：
  - GroupId
  - Src
  - Sxx_Id

## 8. 普通卡迁移流程决策

- AnkiBatchExecutor 新增 modelMigrationQueue。
- 现有 toUpdate 分流规则改为：
  - noteId 不存在或 summary 缺失 -> addQueue
  - summary.modelName === renderedCard.noteModel -> updateQueue
  - summary.modelName !== renderedCard.noteModel -> modelMigrationQueue
- modelMigrationQueue 仍复用当前 mapFields()，即：
  - 当前 rendered noteModel
  - 当前 NoteFieldMappingService.mapRenderedCard()
- 不允许为 mismatch 回退到 addNote。

## 9. 普通卡 deck/tag 决策

- 普通卡迁移成功后仍复用现有：
  - tag diff -> syncNoteTags
  - deck diff -> changeDecks
- 不单独为迁移写新的 deck/tag 流程。

## 10. 不支持跨卡片类型识别决策

- 不尝试判断旧 note 原先属于哪种 Obsidian 卡片类型。
- 当前行为只看：
  - 这次同步解析出的 cardType
  - 当前设置选中的 noteModel
  - 旧 note summary.modelName 是否相同
- 如果用户误把错误 noteId 绑定到别的卡片类型：
  - 字段映射或 cloze 兼容性校验会阻止同步

## 11. Unsupported fallback 决策

- 如果 updateNoteModel 调用失败且 reason 显示 action 不存在或不支持：
  - 抛 errors.noteTypeMigration.unsupported
- 其它迁移失败：
  - 抛 errors.noteTypeMigration.failed
- 两种失败都不回退到 addNote。

## 12. 统计决策

- 新增 migratedNoteTypes 统计。
- 向下游透传：
  - AnkiBatchExecutionResult
  - QaGroupSyncExecutionResult
  - ManualSyncResult
  - NoticeService sync summary
- migratedNoteTypes 不替代 updated；迁移成功同时计入：
  - updated
  - migratedNoteTypes

原因：迁移本质上也是一次内容更新，但单独暴露 migratedNoteTypes 更符合任务目标和用户心智。

## 13. 通知文案决策

- sync summary 增加 migratedNoteTypes。
- 文案表达为“迁移模板”而非“迁移牌组”。
- deck migration 继续保留现有 migratedDecks，避免混淆。

## 14. 用户错误文案决策

- 新增：
  - errors.noteTypeMigration.failed
  - errors.noteTypeMigration.unsupported
- failed 文案必须包含：
  - noteId
  - fromModel
  - toModel
  - reason
- unsupported 文案必须引导用户：
  - 升级 AnkiConnect
  - 或清理 noteId 后重同步

## 15. 与计划的受控偏离

- 偏离 1：source modelName 不放进 gateway 合同。
  - 原因：这是业务上下文，不是 transport 层必需输入。
- 偏离 2：第一版不会增加单独的“迁移开始提示” notice。
  - 原因：当前 NoticeService 是结果汇总型通知，不适合在每张卡迁移前弹增量日志。
  - 保留在错误和最终 summary 中呈现迁移信息即可。
- 偏离 3：普通卡迁移继续沿用现有 changeDecks 批处理，而不是把 deckName 塞进 updateNoteModel。
  - 原因：当前仓库 deck 迁移本来就是独立后处理，复用现有路径风险最小。