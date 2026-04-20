# QA Group Model Fix Gap Report

## Scope

本报告基于当前仓库真实代码审查，聚焦这三类差距：

- QA Group model-management 的 AnkiConnect payload 契约
- QA Group model ensure/update 链路的错误分层与回归风险
- QA Group route 与旧 semantic-qa mapping UI 的残余耦合

## Confirmed Gaps

### 1. 运行报错的直接根因已在网关中确认

`src/infrastructure/anki/AnkiConnectGateway.ts` 当前实现里：

- `updateModelTemplate()` 发送的是 `{ model: modelName, templates: ... }`
- `updateModelStyling()` 发送的是 `{ model: modelName, css }`

这与用户提供的真实运行错误一致：当前运行目标要求把更新内容嵌套进 `params.model` 对象，而不是把 `templates` / `css` 放在顶层。

### 2. 同类 model-management action 需要统一收口，但并非全部都错

同文件中已审查的其他 action：

- `createModel()` 当前使用 `modelName / inOrderFields / css / isCloze / cardTemplates`
- `addModelField()` 当前使用 `modelName / fieldName`
- `addModelTemplate()` 当前使用 `modelName / templateName / Front / Back`

基于当前仓库既有实现与测试夹具，这三处没有出现和本次报错同型的“顶层/嵌套混用”问题，但缺少明确契约说明与专门测试，仍有回退风险。

### 3. QA Group ensure 流程顺序基本正确，但失败信息过粗

`src/application/services/QaGroupModelService.ts` 已按以下顺序执行：

1. `listNoteModels`
2. 缺失则 `createModel`
3. 读取并补齐 fields
4. 读取并补齐 / 更新 templates
5. 读取并更新 CSS

问题不在顺序，而在：

- 任一步失败都会直接抛原始异常
- 错误里没有 action 名、model 名、参数摘要
- 目前没有单元测试锁定“缺 field / 缺 template / template drift / css drift / 错误上下文”

### 4. QA Group 运行链路本身已基本独立，不是通过旧 mapping 组装字段

真实代码显示：

- `QaGroupSyncService` 直接调用 `buildQaGroupNoteFields()` 生成 `Stem / GroupId / Src / S01..S12`
- `ManualSyncService` 将 QA Group 作为独立分支执行
- `NoteFieldMappingService` 仅服务 `basic / cloze / semantic-qa`

因此，QA Group 的运行链路没有继续依赖旧 title/body mapping 来生成字段。

### 5. 真正残留的耦合点在 settings UI，而不是执行链

`src/presentation/settings/PluginSettingTab.ts` 当前问题是：

- note type 下拉框会把所有模型都暴露给 `basic / cloze / semantic-qa` mapping 区块
- 这允许用户把 `ObsiAnki QA Group 12` 选进旧 mapping UI
- 一旦被选中，界面仍会要求配置 title/body 或 main field，形成误导

也就是说，问题是“旧 UI 允许错误配置 QA Group model”，不是“QA Group route 运行时真的复用了旧 mapping 逻辑”。

### 6. 测试覆盖存在明确空洞

当前缺少：

- `AnkiConnectGateway` 针对 model-management payload 的专门契约测试
- `QaGroupModelService.ensureModel()` 的服务级测试
- settings/UI 对 QA Group model 过滤或状态展示的回归测试

## Repository-Compatible Fix Direction

最安全的修复路径是：

1. 在 `AnkiConnectGateway` 内统一 QA Group model-management payload 契约，明确更新类 action 使用嵌套 `model`。
2. 在 `QaGroupModelService` 保持现有顺序，但给每个动作补上下文化错误包装和服务级测试。
3. 保持 QA Group 独立字段构造链不动，只在 settings/UI 层切断 `ObsiAnki QA Group 12` 进入旧 mapping 面板的入口，并补一个只读状态区块。
4. 用 gateway/service/settings 三层测试锁定回归面。

## Out Of Scope

本轮不扩张到：

- 新增 QA Group 自定义 field mapping UI
- 模板 / CSS 归一化比较系统
- semantic-qa 与 QA Group 的自动迁移
- 非 QA Group 相关的 AnkiConnect 行为重构