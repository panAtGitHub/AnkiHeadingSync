# Field Mapping Authority Gap Report

## 审查范围

本轮先按真实仓库代码审查了以下控制点：

1. [src/application/services/NoteFieldMappingService.ts](src/application/services/NoteFieldMappingService.ts)
2. [src/application/services/QaGroupSyncService.ts](src/application/services/QaGroupSyncService.ts)
3. [src/application/services/QaGroupFieldMappingService.ts](src/application/services/QaGroupFieldMappingService.ts)
4. [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)
5. [src/infrastructure/anki/AnkiConnectGateway.ts](src/infrastructure/anki/AnkiConnectGateway.ts)
6. [src/application/services/AnkiBatchExecutor.ts](src/application/services/AnkiBatchExecutor.ts)
7. [src/application/services/NoteFieldMappingService.test.ts](src/application/services/NoteFieldMappingService.test.ts)
8. [src/application/services/QaGroupSyncService.test.ts](src/application/services/QaGroupSyncService.test.ts)
9. [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts)
10. [src/infrastructure/anki/AnkiConnectGateway.test.ts](src/infrastructure/anki/AnkiConnectGateway.test.ts)

## 实际实现现状

### 1. 普通问答 / Cloze 的同步权威入口

[src/application/services/AnkiBatchExecutor.ts](src/application/services/AnkiBatchExecutor.ts) 会在 addNote / updateNoteFields / updateNoteModel 前统一调用 [src/application/services/NoteFieldMappingService.ts](src/application/services/NoteFieldMappingService.ts) 做字段映射。

当前普通问答行为已经基本符合“已保存映射优先”：

1. 通过 `createNoteFieldMappingKey(card.type, card.noteModel)` 读取已保存映射
2. 校验字段存在
3. 再映射 title/body

### 2. Cloze 目前仍被 `isCloze` 阻断

当前 [src/application/services/NoteFieldMappingService.ts](src/application/services/NoteFieldMappingService.ts) 里有两处同步期阻断：

1. `validateMapping()` 中如果 `noteModelDetails.isCloze === false`，抛出 `errors.noteFieldMapping.clozeIncompatible`
2. `mapCloze()` 中再次以 `noteModelDetails.isCloze === false` 阻断

这意味着：

1. 只要插件猜错模型是不是 cloze
2. 即使 `cloze:<modelName>` 已保存、`mainField` 已配置、字段也仍存在
3. 同步也会在插件侧被提前拦截

### 3. `getModelDetails()` 当前确实依赖英文名/模板名/字段名猜 Cloze

[src/infrastructure/anki/AnkiConnectGateway.ts](src/infrastructure/anki/AnkiConnectGateway.ts) 的 `getModelDetails()` 当前会：

1. 先看模型名是否包含 `cloze`
2. 再看模板名是否包含 `cloze`
3. 最后回退到字段名里是否有 `Text`

这正是本次要移除或降级的语言/命名型猜测来源。

### 4. QA Group 同步当前不是用 saved mapping 做权威

[src/application/services/QaGroupSyncService.ts](src/application/services/QaGroupSyncService.ts) 的 `resolveQaGroupModel()` 当前会：

1. 读取 `settings.noteFieldMappings[qa-group:<modelName>]`
2. 但不直接使用保存的 `slots`
3. 每次同步都重新调用 `qaGroupFieldMappingService.suggest(...)`
4. 再用自动识别结果作为 `mapping`

因此当前行为与计划冲突：

1. 同步时仍由字段名模式识别决定 slots
2. 已保存 slots 可能被忽略
3. 自定义语言或任意字段名的 saved mapping 无法作为同步权威

### 5. QA Group 同步当前还会被自动识别 warnings 阻断

`resolveQaGroupModel()` 还会调用：

1. `qaGroupFieldMappingService.validateWarningsAccepted(mapping)`

这意味着同步仍依赖自动识别 warnings 的确认状态，而不是只依赖确定性的“保存映射是否存在 / 是否完整 / 字段是否仍存在”。

### 6. 设置页当前也会覆盖已保存 QA Group 映射

[src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts) 当前在以下路径会重新生成 QA Group mapping：

1. `seedDraftMapping()`
2. `syncQaGroupMappingFromCache()`
3. `getCurrentMappingForConfig()` 的兜底逻辑

这些路径目前只保留：

1. `titleField`
2. `acceptedWarnings`

但会重新 `suggest()` 出新的 `slots`，从而覆盖已保存映射。

### 7. 设置页的 QA Group 自动识别仍有价值，但角色需要下调为“建议”

当前 QA Group 设置 UI：

1. 只允许显式选择 `titleField`
2. `slots` 仍来自自动识别摘要

这说明仓库现实和计划存在一个实现层面的差异：

1. 当前没有 slot 级别的手动编辑 UI
2. 因此本轮不能把“手动选 slots”做成新交互
3. 但必须保证一旦 settings 里已有 saved slots，同步与缓存刷新都不能再覆盖它们

## 需要落地的缺口

### Cloze

需要改为：

1. 只要求 `cloze:<modelName>` 保存映射存在
2. `mainField` 已配置
3. `mainField` 仍存在于当前字段列表
4. 不再以 `isCloze` 阻断

### QA Group

需要改为：

1. 同步直接使用 `qa-group:<modelName>` 已保存映射
2. 不在同步期重新 `suggest()`
3. 不再以 auto-detect warnings 阻断
4. 只校验 saved mapping 的 title/slots/字段存在性/slot 数量是否足够

### 设置页

需要改为：

1. 读字段后仍可生成建议映射
2. 但如果当前已有 QA Group saved mapping，则刷新缓存时只更新 `loadedFieldNames` / `loadedAt`
3. 不再用 `suggest()` 覆盖已保存 `slots`

## 计划适配说明

与附带计划相比，仓库现实有一个需要明确记录的适配点：

1. 当前设置页没有 QA Group slot 级手动编辑 UI
2. 所以本轮不会新增新的 slot 编辑交互
3. 改为把“已保存 mapping 权威”落实在同步期与缓存刷新期，避免任何自动识别覆盖 saved slots