# QA Group 改为用户模板的差距审计

本文基于当前仓库真实实现，审计“QA Group 从插件托管模型改为用户模板 + 自动字段映射”的落地差距。

## 1. 主同步流程仍强依赖硬编码托管模型

- 当前真实控制点在 [src/application/services/QaGroupSyncService.ts](src/application/services/QaGroupSyncService.ts)。
- 该服务在进入同步时会先调用 `qaGroupModelService.ensureModel()`。
- 随后固定使用：
  - `QA_GROUP_MODEL_NAME`
  - `QA_GROUP_SLOT_COUNT = 12`
  - `buildQaGroupNoteFields(...)`
- 这说明 QA Group 目前仍是“插件托管模型”，不是“用户选择模板”。

## 2. 当前 QA Group 仍把内部身份字段写进 Anki

- `buildQaGroupNoteFields(...)` 当前会写入：
  - `Stem`
  - `GroupId`
  - `Src`
  - `Sxx_Id`
  - `Sxx_Q`
  - `Sxx_A`
- 这与新方案冲突：新方案要求 Anki 不再保存 `GroupId / Src / Sxx_Id`。

## 3. 当前 QA Group 恢复逻辑仍依赖 Anki 内部字段

- `QaGroupSyncService.resolveRecoveredGroup()` 当前会按以下顺序尝试恢复：
  - 本地 state
  - `GroupId` 查询
  - `noteId`
  - `Src` 查询
- 查询语句直接依赖 Anki 字段：
  - `GroupId`
  - `Src`
- 这与新方案冲突：新方案明确要求 Anki 不再承担内部身份恢复来源。

## 4. 当前 item 槽位上限和 GI marker 仍硬编码为 12

- `QaGroupSyncService` 当前所有容量与 freeSlots 计算都基于 `QA_GROUP_SLOT_COUNT = 12`。
- [src/domain/manual-sync/services/GroupMarkerService.ts](src/domain/manual-sync/services/GroupMarkerService.ts) 也把 GI slot 范围限制为 `1..12`。
- 新方案要求容量来自用户模板可识别的 `slots.length`，因此这两处都必须从固定 12 脱钩。

## 5. 当前设置层把 QA Group 当作托管默认模型

- [src/application/config/PluginSettings.ts](src/application/config/PluginSettings.ts) 当前默认值是：
  - `basic.noteType = "Basic"`
  - `qa-group.noteType = QA_GROUP_MODEL_NAME`
  - `cloze.noteType = "Cloze"`
- `validateCardTypeConfigs()` 还要求这三类 noteType 不能为空。
- 这与新方案冲突：三类可见卡片的模板默认都应为空，并在同步时给出清晰错误。

## 6. 当前 QA Group 字段映射模型仍是 basic-like

- [src/application/config/NoteModelFieldMapping.ts](src/application/config/NoteModelFieldMapping.ts) 当前只有统一结构：
  - `titleField`
  - `bodyField`
  - `mainField`
- `qa-group` 当前被 [src/application/services/NoteFieldMappingService.ts](src/application/services/NoteFieldMappingService.ts) 当成 basic-like 卡片处理。
- 这与新方案冲突：QA Group 需要专用映射结构，至少包含：
  - `titleField`
  - `slots[]`
  - `warnings[]`
  - `acceptedWarnings[]`

## 7. 当前设置页 UI 仍把 QA Group 当成单组字段映射

- [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts) 当前为 `qa-group` 渲染的是：
  - note type 下拉
  - question field 下拉
  - answer field 下拉
- 这与新方案冲突：QA Group 行应显示自动识别结果，而不是单组字段下拉。

## 8. 当前设置页缓存已具备字段缓存基础，但尚无 QA Group 专用识别/确认流

- 仓库已经完成：
  - `ankiNoteTypeCache`
  - `ankiModelFieldCache`
  - 设置页打开时缓存优先渲染
  - 按钮刷新时 `modelNames + multi(modelFieldNames...)`
- 但当前仍缺：
  - QA Group 自动识别服务
  - warnings 展示与确认状态
  - 字段变化后重算并重置确认状态
  - QA Group 映射自动保存

## 9. 当前普通卡片同步路径与 QA Group 路径是分离的

- 普通卡片通过：
  - [src/application/services/RenderConfigService.ts](src/application/services/RenderConfigService.ts)
  - [src/application/services/AnkiBatchExecutor.ts](src/application/services/AnkiBatchExecutor.ts)
  - [src/application/services/NoteFieldMappingService.ts](src/application/services/NoteFieldMappingService.ts)
- QA Group 通过：
  - [src/application/services/QaGroupSyncService.ts](src/application/services/QaGroupSyncService.ts)
- 这意味着本轮可以局部改 QA Group 而不必重做普通卡片主线。

## 10. 当前 groupId / itemId 本地持久化已经存在，可直接保留

- [src/domain/manual-sync/entities/PluginState.ts](src/domain/manual-sync/entities/PluginState.ts) 已保存：
  - `groupId`
  - `noteId`
  - `items[]`（含 `itemId` 和 `slot`）
  - `freeSlots`
- [src/domain/manual-sync/services/CardIndexingService.ts](src/domain/manual-sync/services/CardIndexingService.ts) 已优先用：
  - GI marker
  - 本地 state
  - `src` / `rawBlockHash` 状态恢复
- 这与新方案兼容，说明本轮无需改本地状态建模，只需移除 Anki 内部字段恢复依赖。

## 11. 当前回链实现仍依赖 `Src` 字段，而不是写回用户字段内容

- 当前 QA Group 回链位置是通过 `QaGroupModelDefinition` 的模板 HTML 来决定的。
- 也就是说当前回链是：
  - 把 URL 写入 `Src`
  - 再由模板引用 `{{Src}}`
- 新方案要求反过来处理：
  - 不写 `Src`
  - 在同步时把回链拼进 title 或 answer 字段内容

## 12. 当前测试面仍围绕旧托管模型设计

- `QaGroupSyncService.test.ts` 当前大量断言：
  - 创建模型
  - 固定模型名
  - `GroupId / Src / Sxx_Id`
  - 固定 12 槽
- `ManualSyncService.test.ts` 也断言会创建 QA Group 托管模型。
- `PluginSettingTab.test.ts` 仍把 QA Group 当作 question/body 两个下拉。
- `PluginSettings.test.ts` 仍断言 QA Group 默认 noteType 为 `QA_GROUP_MODEL_NAME`。

## 13. 结论

当前仓库与目标方案的主要冲突点有六类：

1. 主同步流程仍调用 `ensureModel()` 并固定使用 `QA_GROUP_MODEL_NAME`
2. QA Group 仍写入 `GroupId / Src / Sxx_Id`
3. QA Group 恢复仍查询 `GroupId / Src`
4. QA Group 映射仍是 basic-like 的 `titleField/bodyField`
5. 设置页仍把 QA Group 当成单组字段映射
6. slot/freeSlots/GI 校验仍固定为 12

当前仓库里可直接复用的基础设施也很明确：

1. 设置页已有缓存优先 + 批量字段读取
2. 本地 group/item state 与 GI marker 已能承担主要身份恢复
3. 普通卡片和 QA Group 同步路径已隔离，便于局部替换

因此本轮最安全的仓库兼容路径是：

1. 保留普通卡片主线不变
2. 为 QA Group 新增专用字段识别与映射模型
3. 把 QA Group 同步改为完全基于“用户选中的 modelName + 保存好的 qa-group mapping”
4. 移除主流程中的 `ensureModel()`、固定模型名依赖和 Anki 内部身份字段写入