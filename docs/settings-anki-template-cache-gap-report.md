# 设置页 Anki 模板缓存差距审计

本文基于当前仓库真实实现，核对“设置页 Anki 模板加载性能优化方案”的落地差距。

## 1. 当前设置模型只有模板名缓存，没有字段缓存

- `PluginSettings` 当前已经有 `ankiNoteTypeCache: string[]`。
- `DEFAULT_SETTINGS`、`normalizePluginSettings()`、`validatePluginSettings()` 也已经接入了该字段。
- 但当前还没有：
  - `ankiModelFieldCache`
  - 字段缓存的 normalize / validate
  - 旧快照缺省该字段时的补齐逻辑测试
- 结果是：重新打开设置页时只能立即显示模板下拉，字段下拉仍依赖实时加载。

## 2. 卡片 1 的“手动读取”流程仍是串行 live 读取

- 设置页入口在 `src/presentation/settings/PluginSettingTab.ts`。
- 当前 `loadAnkiCardTypeConfig()` 的真实流程是：
  - 先调用一次 `listNoteModels()`
  - 保存 `ankiNoteTypeCache`
  - 然后对当前可见 3 个卡片类型逐个执行 `getNoteModelDetails(modelName)`
- 这和计划要求冲突：
  - 当前不是“1 次 modelNames + 1 次 multi(modelFieldNames...)”
  - 当前会对 3 个卡片类型做串行 live 请求
  - 当前还会间接触发 `modelTemplates`

## 3. 当前 `getNoteModelDetails()` 会额外拉取模板 HTML

- `AnkiConnectGateway.getModelDetails()` 当前流程：
  - `getModelFieldNames(modelName)`
  - 再尝试 `getModelTemplates(modelName)`
  - 用模板名是否含 cloze 推导 `isCloze`
- 这意味着设置页为了拿字段下拉，也会额外访问 `modelTemplates`。
- 计划要求本轮设置页优化不再默认读取 `modelTemplates`，而 Cloze 完整校验继续留在同步路径。

## 4. 当前 gateway 没有批量字段读取接口

- `AnkiGateway` / `AnkiGroupGateway` 目前只有单模型字段读取：
  - `getModelFieldNames(modelName)`
- `AnkiConnectGateway` 内部已经有 `invokeMulti()`，但没有面向“批量 modelFieldNames”语义的安全封装。
- 当前缺失的接口是：
  - `getModelFieldNamesByModelNames(modelNames)`
- 当前也缺少对 `multi` 单项 `{ result, error }` 包装结构的专门解析。

## 5. 卡片 1 已经具备局部刷新骨架，可直接复用

- 当前设置页已经不是整页 `display()` 重建。
- `display()` 只初始化 5 张卡片外壳，后续通过 `renderCard(cardId)` 做局部刷新。
- `loadAnkiCardTypeConfig()` 当前已经只刷新 `card-types` 卡片，不会整页 `empty()`。
- 这与计划一致，说明本轮无需再重做 UI 架构，重点只在卡片 1 数据来源和保存策略。

## 6. 当前字段下拉数据来源只认 draft/live 结果，不认 data.json 字段缓存

- 当前字段下拉来自 `getCurrentMappingForConfig()`：
  - 优先 draft mapping
  - 其次保存好的 `noteFieldMappings`
  - 再其次 `loadedModelDetails`
- 如果没有 `loadedModelDetails`，则直接显示“请先读取字段”。
- 当前没有从 settings 中的持久字段缓存反推 `loadedModelDetails` 或直接喂字段下拉。
- 结果是：即便上一次已经读过字段，只要没重新请求，字段下拉在页面重开后仍可能为空。

## 7. 当前“切换模板后立即使用缓存字段”能力不完整

- 当前切换 note type 只会保存 `cardTypeConfigs[configId].noteType`。
- 字段下拉能否立刻更新，取决于是否已有 draft mapping 或 `loadedModelDetails`。
- 仓库里没有“从 settings 字段缓存即时水合字段列表”的路径。
- 这和计划要求不一致：计划要求切换模板后，若该模板已有缓存字段，应立即进入下拉。

## 8. 现有测试覆盖还停留在旧缓存粒度

- `PluginSettings.test.ts` 目前只覆盖：
  - `ankiNoteTypeCache`
  - `cardTypeConfigs`
- `AnkiConnectGateway.test.ts` 目前没有：
  - 批量字段 multi 请求
  - 单项 error 跳过
  - 顶层 multi error 抛出
- `PluginSettingTab.test.ts` 目前覆盖了：
  - 卡片局部刷新
  - 模板名缓存渲染
- 但还没有覆盖：
  - data.json 字段缓存渲染字段下拉
  - 点击刷新时只打 1 次 `listNoteModels` + 1 次批量字段请求
  - 点击刷新不再逐个调用 `getNoteModelDetails`
  - 状态文案里的 `x/y` 统计
  - 切换模板后立即使用字段缓存

## 9. 当前同步时 Cloze 校验边界是正确的，应保持不动

- 当前实时同步仍通过 `AnkiConnectGateway.getModelDetails()` 走 live 字段 + `isCloze` 判定。
- 这是计划要求保留的严格边界。
- 因此本轮只优化设置页卡片 1，不应把同步路径改为依赖缓存字段。

## 10. 结论

当前仓库已经完成了两件可复用基础设施：

- 5 卡片局部刷新壳层
- 模板名缓存 `ankiNoteTypeCache`

本轮还缺三块关键实现：

1. `ankiModelFieldCache` 的设置模型、normalize、validate、持久化与测试
2. gateway 侧基于 `multi(modelFieldNames...)` 的批量字段读取接口
3. 卡片 1 从“live 逐行读取”切换为“缓存优先渲染 + 刷新时两次 AnkiConnect 往返 + 一次保存”

按当前仓库结构，最安全的路径是：

- 保持 `getModelDetails()` 和同步时 Cloze 校验不变
- 新增一个独立批量字段读取方法，不顺手重构通用 multi
- 设置页通过 settings 里的字段缓存水合下拉和 draft mapping