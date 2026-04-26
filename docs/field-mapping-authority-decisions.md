# Field Mapping Authority Decisions

## 1. 同步权威来源

最终统一规则：

1. 用户在设置里已保存的 `noteFieldMappings` 是同步权威来源
2. 自动识别只负责“首次建议”或“草稿建议”
3. 同步期不再让字段名/模型名/模板名猜测覆盖 saved mapping

## 2. Basic / Semantic QA

保持现有行为：

1. 要求 saved mapping 存在
2. `titleField` 与 `bodyField` 都已配置
3. 两字段必须不同
4. 两字段仍存在于当前 Anki 字段列表中

## 3. Cloze

最终行为：

1. 不再使用 `isCloze` 作为同步阻断条件
2. 不再依赖模型名 / 模板名 / 字段名猜 Cloze 兼容性
3. 只要求 `cloze:<modelName>` saved mapping 存在
4. `mainField` 已配置
5. `mainField` 仍存在于当前 Anki 字段列表
6. 真正的模型语义不兼容，由 AnkiConnect 的 `addNote` / `updateNoteFields` / `updateNoteModel` 返回真实错误

## 4. QA Group

最终行为：

1. 同步直接使用已保存的 `qa-group:<modelName>` mapping
2. saved `titleField` 和 `slots` 都是权威来源
3. 不在同步期重新 `suggest()` slots
4. 不再要求 warnings 已确认才能同步
5. 只校验这些确定性事实：
   - mapping 存在
   - `titleField` 已配置
   - 至少有一个 slot
   - slot 里的 question/answer 字段仍存在
   - 当前块的 item 数量不超过 saved slot 数量

## 5. 设置页

最终行为：

1. 读取 Anki 字段后，仍会为缺失 mapping 的卡片类型生成建议映射
2. Basic / Cloze 继续在刷新时保留用户已选字段，只更新 `loadedFieldNames` / `loadedAt`
3. QA Group 若已有 saved mapping，则刷新缓存时保留已保存 `titleField` / `slots`
4. QA Group 不再在缓存刷新时自动重算 slots 覆盖 saved mapping

## 6. `getModelDetails()`

最终行为：

1. 继续返回字段列表
2. 不再通过英文模型名 / 模板名 / 字段名推断 Cloze 兼容性
3. `isCloze` 保留在 DTO 形状中，但不再承担同步阻断职责

## 7. 与计划的显式偏差

有一个实现层偏差，但不影响本次目标：

1. 当前仓库没有 QA Group slot 级别的手动编辑 UI
2. 因此本轮不新增 slot 编辑器
3. 通过“保存后不被同步期与缓存刷新期覆盖”来落实 saved mapping authority