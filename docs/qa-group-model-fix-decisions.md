# QA Group Model Fix Decisions

## Decision Summary

本轮按真实仓库结构锁定以下实现决策：

1. QA Group model-management 的更新类 action 统一采用嵌套 `params.model` 契约。
2. `createModel`、`modelFieldAdd`、`modelTemplateAdd` 保持当前仓库已使用的参数命名，不引入第二套 payload 风格。
3. `QaGroupModelService.ensureModel()` 保持现有执行顺序，但所有失败都补 action/model 上下文。
4. template 与 CSS 继续使用严格字符串比较，不引入归一化逻辑。
5. QA Group 执行链保持独立字段构造，不回接旧 mapping service。
6. settings/UI 不再允许 `ObsiAnki QA Group 12` 进入旧 `basic / cloze / semantic-qa` mapping 面板。
7. settings/UI 为 QA Group 仅保留 marker 与只读 model 状态信息，不新增可编辑 field mapping。

## Concrete Decisions

### 1. Gateway contract target

当前仓库对 QA Group model-management action 的目标契约定义为：

- `createModel`: 顶层 `modelName / inOrderFields / css / isCloze / cardTemplates`
- `modelFieldAdd`: 顶层 `modelName / fieldName`
- `modelTemplateAdd`: 顶层 `modelName / templateName / Front / Back`
- `updateModelTemplates`: 顶层只保留 `model`，其中嵌套 `name / templates`
- `updateModelStyling`: 顶层只保留 `model`，其中嵌套 `name / css`

这样做的原因是：本次真实运行失败只出现在 update 系列 action，且其错误文本明确指向顶层 `templates` 非法。

### 2. One helper, one contract

在 `AnkiConnectGateway` 中新增局部 helper，用来构建 model update payload。

目的：

- 直接表达“本项目针对当前运行目标使用嵌套 `model` 更新契约”
- 避免后续在多个 action 里再次混入旧顶层写法

### 3. Ensure flow error policy

`QaGroupModelService.ensureModel()` 的每个外部动作都用统一 helper 包装异常，错误信息至少包含：

- action 名
- model 名
- 一个简短参数摘要

示例粒度：

- `createModel`
- `addModelField`
- `addModelTemplate`
- `updateModelTemplate`
- `updateModelStyling`

### 4. Route/UI decoupling policy

QA Group route 与旧 mapping path 的解耦采用“限制错误入口”而不是“重写执行链”：

- `QaGroupSyncService` 继续直接构造完整字段表
- `NoteFieldMappingService` 不扩展到 QA Group
- `PluginSettingTab` 过滤 QA Group model，不让它出现在旧 mapping 下拉中
- `PluginSettingTab` 增加 QA Group model 的只读状态展示，说明该 model 由插件自动校验和维护

### 5. Backward compatibility policy

必须保留的旧行为：

- `semantic-qa` 仍然通过 title/body field mapping 工作
- `basic` 与 `cloze` 现有 mapping 行为不变
- `#anki-list` 继续走 QA Group route
- `#anki-list-qa` 继续走 semantic-qa route

## Intentional Deviation From Draft Plan

偏离点只有一处：

- 不新增 QA Group 可编辑 mapping 面板，而是改为只读状态区块

原因：

- 真实执行链本来就不依赖旧 mapping service
- 继续暴露可编辑 mapping 只会制造错误配置入口
- 固定协议 model 更适合状态展示，而不是可配置字段映射