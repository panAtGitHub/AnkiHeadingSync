# QA Group 用户模板化实现决策

本文锁定本轮“QA Group 改为用户模板 + 自动字段映射”的仓库兼容实现方案。

## 1. 作用域决策

- 只重构 `qa-group` 路径。
- `basic` / `cloze` / `semantic-qa` 的现有同步主线保持不变。
- 不借机重做普通卡片字段映射体系。

## 2. 默认模型决策

- 三类可见卡片默认模板都改为空：
  - `basic`
  - `qa-group`
  - `cloze`
- `semantic-qa` 继续保持当前隐藏状态，不纳入本轮产品行为变更。
- 设置层允许空模板保存；真正的“必须选择模型”约束放到同步时执行。

## 3. 映射类型决策

- `NoteModelFieldMapping` 升级为联合类型：
  - basic-like mapping
  - cloze mapping
  - qa-group mapping
- 新增：

  - `QaGroupSlotMapping = { index; questionField; answerField }`
  - `QaGroupFieldMapping = { cardType: "qa-group"; modelName; loadedFieldNames; titleField; slots; warnings; acceptedWarnings?; loadedAt }`

- `qa-group` 不再使用 `bodyField` 或 `mainField`。

## 4. QA Group 自动识别服务决策

- 新增独立服务：`QaGroupFieldMappingService`。
- 它负责：
  - 按优先级识别 title 字段
  - 识别连续完整的 question/answer slot
  - 输出 warnings
  - 校验已保存 mapping 是否仍然有效
- `NoteFieldMappingService` 不再负责 qa-group 的 suggest/map 逻辑。

## 5. title 字段优先级决策

- 按以下顺序做不区分大小写的精确优先匹配：
  - `题目`
  - `标题`
  - `正面`
  - `Stem`
  - `Title`
- 若均不存在，则识别失败。

## 6. slot 识别规则决策

- 问题字段支持：
  - `问题01`
  - `问题1`
  - `Q01`
  - `Q1`
  - `S01_Q`
- 答案字段支持：
  - `答案01`
  - `答案1`
  - `A01`
  - `A1`
  - `S01_A`
- 只启用从 1 开始连续且完整配对的 slot。
- 识别到不完整配对时：
  - 记录 warning
  - 只保留前面的完整连续 slot
- 如果最小索引不是 1，则直接识别失败。
- 旧模型 `Stem + S01_Q/S01_A` 作为普通用户模板兼容支持。

## 7. warnings 与确认决策

- `warnings` 保存当前识别结果。
- `acceptedWarnings` 保存用户已确认忽略的 warning 文本列表。
- 当字段列表变化导致 warning 文本变化时：
  - 重新计算 `warnings`
  - 清空 `acceptedWarnings`
- 同步前的放行条件是：
  - `warnings.length === 0`
  - 或 `acceptedWarnings` 与当前 `warnings` 完全一致

## 8. 设置页行为决策

- QA Group 行不再渲染 question/body 下拉框。
- QA Group 行显示：
  - note type 下拉
  - 自动识别出的 title 字段
  - 已识别 slot 数量
  - warning 文案
  - warning 确认控件
- 如果 qa-group 模型已选且缓存字段可用：
  - 自动生成 mapping
  - 自动保存到 `noteFieldMappings`
- 如果识别失败：
  - 不保存无效 mapping
  - 在设置页显示清晰错误
- basic/cloze 仍沿用当前字段下拉行为。

## 9. 刷新按钮决策

- 保持当前优化后的按钮流程：
  - `listNoteModels()` 一次
  - `getModelFieldNamesByModelNames()` 一次
- 刷新后：
  - 普通卡片继续只水合 draft mapping
  - QA Group 如果当前模型有缓存字段，则立即重算并持久化 qa-group mapping

## 10. 同步时模型选择与报错决策

- 普通卡片：在 `RenderConfigService` 里对空模型抛出 `PluginUserError`。
- QA Group：在 `QaGroupSyncService` 中对空模型抛出 `PluginUserError`。
- 这样可以满足“空模型在同步时清晰报错”，又不阻止设置页保存。

## 11. QA Group 主同步决策

- `QaGroupSyncService` 不再依赖：
  - `QaGroupModelService.ensureModel()`
  - `QA_GROUP_MODEL_NAME`
  - `QA_GROUP_SLOT_COUNT`
  - `buildQaGroupNoteFields(...)`
- 同步输入改为：
  - `settings.cardTypeConfigs["qa-group"].noteType`
  - `settings.noteFieldMappings["qa-group:<modelName>"]`
- 同步前校验：
  - 已选择模型
  - mapping 存在且类型为 `qa-group`
  - title 字段存在
  - 至少 1 个 slot
  - warnings 已确认或不存在
  - slot 字段仍存在于当前 Anki 模型

## 12. 写字段决策

- 只写：
  - `mapping.titleField`
  - 每个 `slot.questionField`
  - 每个 `slot.answerField`
- 未使用但已映射的 slot 字段统一写空字符串，避免旧内容残留。
- 不再写：
  - `GroupId`
  - `Src`
  - `Sxx_Id`

## 13. 回链决策

- QA Group 不再把回链写入 `Src` 字段。
- 改为同步时直接把回链字符串拼入用户字段内容：
  - `question-last-line` -> 追加到 title 字段
  - `answer-first-line` -> 追加到每个已用 answer 字段开头
  - `answer-last-line` -> 追加到每个已用 answer 字段末尾
- `addObsidianBacklink = false` 时不写回链。

## 14. 恢复策略决策

- 继续保留本地 state 和 GI marker 作为主要身份恢复来源。
- 删除按 `GroupId` / `Src` 查询 Anki 的恢复分支。
- 若只有 `noteId` 可用，可从 Anki note 内容按保存的 qa-group mapping 恢复 question/answer 展示内容。
- 这种场景下恢复出的 `itemId` 使用临时格式：
  - `recovered-slot-01`
  - `recovered-slot-02`

## 15. slot 上限与 GI marker 决策

- QA Group 容量来自 `mapping.slots.length`。
- `GroupMarkerService` 不再把 slot 范围上限硬编码为 12。
- `freeSlots` 的范围改为依据当前 mapping 可用 slot 集合生成。

## 16. 兼容保留决策

- `ManagedNoteModels.QA_GROUP_MODEL_NAME` 可以保留为兼容常量，但不能再被 QA Group 主同步流程使用。
- `QaGroupModelDefinition` / `QaGroupModelService` 可以保留为兼容或测试工具，但不能再由 Manual Sync 主流程调用。
- 若这些文件保留，其测试也只表示“兼容工具仍可工作”，不再代表主流程行为。

## 17. 测试决策

- 新增 `QaGroupFieldMappingService` 单测，覆盖 title/slot 识别与 warning。
- 调整 `PluginSettingTab.test.ts`，覆盖 QA Group 新 UI、自动识别、warning 确认与确认重置。
- 重写 `QaGroupSyncService.test.ts`，覆盖：
  - 用户模板字段写入
  - 容量校验
  - 回链拼接
  - 不写内部字段
  - 本地 state / GI marker 仍保留 groupId、itemId、slot
- 调整 `ManualSyncService.test.ts` 和 `PluginSettings.test.ts`，去掉对托管模型默认值与 ensureModel 主流程的断言。

## 18. 与草案的受控偏离

- 草案写到“如果 warning 存在，允许保存草稿”。当前仓库没有单独的 qa-group draft 持久层，最兼容实现是：直接把带 warnings 的 qa-group mapping 保存进 `noteFieldMappings`，并用 `acceptedWarnings` 控制同步放行。这样既满足“可保存草稿”，也复用现有 data.json 结构。
- 草案没有显式提 GI marker 的 `1..12` 限制，但仓库真实实现里这会直接限制用户模板容量，因此本轮会一并解除该硬编码；这是为满足“N 不固定”所必须的仓库兼容修正。