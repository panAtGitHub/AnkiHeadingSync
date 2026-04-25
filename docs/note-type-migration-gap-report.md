# Anki Note Type 自动迁移差距审计

本文基于当前仓库真实实现，审计“同步时自动原地迁移 Anki note type”的落地差距。

## 1. 实际同步主线

- 真实入口在 src/application/services/ManualSyncService.ts。
- 普通卡走：
  - DiffPlannerService
  - ManualCardRenderer
  - AnkiBatchExecutor
- QA Group 走：
  - QaGroupSyncService
- 最终状态更新、marker 写回、通知汇总都在 ManualSyncService 收口。

这意味着本轮必须分别改普通卡和 QA Group 两条同步路径，不能只改一个共用入口。

## 2. 当前 gateway 合同缺少 updateNoteModel

- src/application/ports/AnkiGateway.ts 当前只有：
  - addNote / addNotes
  - updateNote / updateNotes
  - syncNoteTags
  - changeDecks
- 没有 updateNoteModel。
- src/infrastructure/anki/AnkiConnectGateway.ts 也没有对应实现。

结果：当前仓库根本没有“保留 noteId 原地切换 note model”的能力。

## 3. 当前 AnkiConnect 错误上下文过弱

- AnkiConnectGateway.invoke() 在 parsed.error 存在时直接抛出普通 Error(parsed.error)。
- 当前错误里没有：
  - action 名称
  - noteId
  - 目标 modelName
  - 调用阶段上下文

结果：即便后续接入 updateNoteModel，若不补上下文，用户只能看到原始 AnkiConnect 错误字符串，无法定位是哪张卡、哪个模型迁移失败。

## 4. QA Group 当前对 model mismatch 直接抛普通 Error

- src/application/services/QaGroupSyncService.ts 的 tryLoadQaGroupNote() 里：
  - note 不存在 -> 返回 undefined
  - note 存在且 modelName 一致 -> 返回 note
  - note 存在但 modelName 不一致 -> 直接抛普通 Error

这与目标方案冲突：目标方案要求 model mismatch 进入“尝试迁移”分支，而不是直接失败。

## 5. QA Group 的字段生成和容量判断已基本符合新方案

- 当前 QA Group 字段值来源已经是：
  - 当前 Markdown 解析结果
  - 当前 QaGroupFieldMapping
  - buildQaGroupNoteFields()
- 当前已经：
  - 先按 mapping.slots.length 做容量校验
  - 将未使用 slot 字段写空字符串
  - 不依赖旧 Anki 字段做字段转换
  - 不写 GroupId / Src / Sxx_Id
  - 只在旧托管模型字段存在时清空 legacy internal fields

这说明 QA Group 迁移不需要重做字段生成规则，只需把 mismatch 分支接到 updateNoteModel。

## 6. QA Group 当前 update/create 决策

- 现有逻辑是：
  - noteId 不存在 -> addNote
  - noteId 存在但 Anki 中缺失 -> addNote
  - noteId 存在且 model 匹配 -> 对比 fields/deck/tags 后 updateNote / syncNoteTags
- 当前完全没有：
  - noteId 存在且 model 不匹配 -> updateNoteModel

因此 QA Group 迁移接入点非常明确：现有“已有 noteId”分支中，fields 已经先生成完成，只差把 mismatch 当作第三种状态处理。

## 7. 普通卡当前只按 noteId 是否存在决定 add 还是 update

- src/application/services/AnkiBatchExecutor.ts 当前会先批量读取 getNoteSummaries(noteIds)。
- 但 toUpdate 分支只检查：
  - plannedCard.noteId 存在
  - noteSummariesById.has(noteId)
- 满足后就直接进入 updateQueue。
- 后续 updateQueue 统一调用 updateNotes，不检查 summary.modelName 是否等于 renderedCard.noteModel。

这与目标方案冲突：普通卡当前会在 model mismatch 时错误地走 updateNoteFields，而不是做 model migration。

## 8. 普通卡目标字段生成已经可复用

- AnkiBatchExecutor.mapFields() 已经统一通过：
  - getModelDetails(renderedCard.noteModel)
  - NoteFieldMappingService.mapRenderedCard(...)
- NoteFieldMappingService 当前已经会：
  - 用当前 noteModel 去查 settings 里的字段映射
  - 在字段映射不完整、字段不存在、cloze 不兼容时抛 PluginUserError

这说明普通卡迁移时无需引入旧 Anki 字段转换；直接复用现有 mapFields 即可满足“当前 Markdown + 当前设置映射是唯一权威”。

## 9. 普通卡当前 deck/tag 迁移逻辑已独立存在

- 普通卡路径中：
  - fields 更新走 updateNotes
  - tags 更新走 syncNoteTags
  - deck 更新走 changeDecks
- deck 迁移不和 updateNotes 绑定，而是通过 note summary 里的 cardIds 单独批量 changeDeck。

这意味着普通卡 model migration 成功后，不需要重做 deck/tag 逻辑；只要保留现有后续队列即可。

## 10. QA Group 当前 deck/tag/state/marker 流程也能复用

- QA Group 当前在同一个循环里：
  - 先生成 fields
  - 再比较 fields/deck/tags
  - 然后 updateNote / syncNoteTags
  - 再写 markerWrites
  - 再生成 syncedGroupBlocks
- state 和 marker 都依赖 noteId，但目标方案要求 noteId 保持不变。

这意味着 QA Group 迁移成功后，当前 state/marker 写回结构本身不需要改 schema，只要确保失败时不要继续写 marker 和 syncedGroupBlocks。

## 11. 当前结果汇总里没有 note type migration 统计

- 当前只有：
  - AnkiBatchExecutionResult.updated
  - QaGroupSyncExecutionResult.updated
  - ManualSyncResult.updated
  - migratedDecks
- NoticeService 也只展示 migratedDecks，不展示 migratedNoteTypes。

因此若要把 note type migration 作为独立统计透出，需要沿着：
  - AnkiBatchExecutionResult
  - QaGroupSyncExecutionResult
  - ManualSyncResult
  - NoticeService
  - notice i18n
  一路补字段。

## 12. 当前 i18n 里缺少 note type migration 错误键

- 现有字段映射错误和设置错误已经比较完整。
- 但 src/presentation/i18n/messages/zh.ts 和 src/presentation/i18n/messages/en.ts 当前没有：
  - errors.noteTypeMigration.failed
  - errors.noteTypeMigration.unsupported

结果：如果实现迁移失败或 AnkiConnect 不支持该 action，目前没有对应的用户可读错误出口。

## 13. 当前测试面锁定了旧行为

- AnkiConnectGateway.test.ts 还没有 updateNoteModel 覆盖。
- AnkiBatchExecutor.test.ts 当前只覆盖：
  - getModelDetails 缓存
  - deck 迁移
  - tag 同步
  - create/update 常规流
- QaGroupSyncService.test.ts 当前只覆盖：
  - create
  - matching model update
  - missing note recreate
  - tag/deck/backlink/slot 逻辑
- FakeManualSyncAnkiGateway 也还没有 updateNoteModel 的记录能力。

这意味着本轮必须先扩测试基座，再新增 mismatch 分支用例，否则无法验证行为。

## 14. 结论

当前仓库与目标方案的主要差距有五类：

1. Gateway 合同没有 updateNoteModel。
2. QA Group 在 model mismatch 时直接抛普通 Error。
3. 普通卡在 model mismatch 时仍会走 updateNotes。
4. i18n 和错误流缺少 note type migration 专用错误。
5. 结果汇总和测试基座都还不知道 migrated note types。

当前仓库里已可直接复用的基础设施也很明确：

1. 普通卡和 QA Group 都已用当前 Markdown + 当前字段映射生成目标 fields。
2. QA Group 容量校验已经按目标 mapping.slots.length 执行。
3. state、marker、deck、tag 的成功路径都已存在，不需要改 schema。

因此最安全的仓库兼容路径是：

1. 新增 updateNoteModel gateway 能力。
2. 在 QaGroupSyncService 把 note load 结果拆成 missing / matching / model-mismatch。
3. 在 AnkiBatchExecutor 新增 modelMigrationQueue。
4. 迁移成功后复用现有 tag/deck/state/marker 收尾逻辑。
5. 迁移失败时抛 PluginUserError，并且不回退到 addNote。