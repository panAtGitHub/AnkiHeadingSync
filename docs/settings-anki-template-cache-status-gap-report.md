# 设置页 Anki 模板缓存状态差距审计

本文基于当前仓库真实实现，审计“设置页模板缓存状态显示 + 后台轻量 freshness 检测”的落地差距。

## 1. 当前设置页已是 cache-first 下拉，但不是 cache-first 状态

- 入口在 [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)。
- `renderCardTypesCard()` 打开时会先执行 `hydrateVisibleCardTypeCaches()`。
- note type 下拉来自：
  - `availableNoteModels`，若为空则退回 `settings.ankiNoteTypeCache`
- 字段下拉来自：
  - `settings.ankiModelFieldCache` 水合出的 `loadedModelDetails`
  - 再经 `getCurrentMappingForConfig()` 生成 draft mapping

这说明缓存实际上已经参与首屏渲染，当前问题不是“缓存没被用”，而是“状态文案没有反映缓存可用性”。

## 2. 当前首屏状态文本仍固定为 idle

- 当前类内状态是：
  - `cardTypeStatus: UserFacingMessage = NOTE_TYPE_STATUS_IDLE`
- `NOTE_TYPE_STATUS_IDLE` 指向 `settings.mapping.status.idle`。
- `renderCardTypesCard()` 直接渲染 `renderUserFacingMessage(this.cardTypeStatus)`。
- `cardTypeStatus` 只会在以下情况变化：
  - `saveCardTypeConfig()` 校验失败
  - `loadAnkiCardTypeConfig()` 开始 / 成功 / 失败

结果：即使已有 `ankiNoteTypeCache` 和 `ankiModelFieldCache`，首次打开设置页仍显示“请先从 Anki 刷新”语义，而不是缓存摘要。

## 3. 当前设置页打开时不会做任何后台 freshness 检测

- `display()` -> `renderCard("card-types")` -> `renderCardTypesCard()` 的当前路径里没有自动调用：
  - `listNoteModels()`
  - `getModelFieldNamesByModelNames()`
  - `getNoteModelDetails()`
- 唯一主动访问 Anki 的入口仍是点击“手动读取 Anki 里的模板配置”。

这与目标方案的差距是：当前没有“只跑一次 modelNames 的轻量后台检测”。

## 4. 当前完整刷新流程已经符合“手动触发全量字段读取”约束

- `loadAnkiCardTypeConfig()` 当前真实流程是：
  - `listNoteModels()` 一次
  - `getModelFieldNamesByModelNames()` 一次
  - `updateSettings({ ankiNoteTypeCache, ankiModelFieldCache })`
  - `hydrateVisibleCardTypeCaches()`
  - `syncQaGroupMappingFromCache()`
  - `renderCard("card-types")`
- 当前不会在设置页打开时读取所有字段。

这意味着本轮应保留该完整刷新流程，只新增轻量 `listNoteModels()` 检测，不改 full refresh 语义。

## 5. 当前 card 1 已具备局部刷新壳层，可直接复用

- `display()` 只在首次进入时 `containerEl.empty()` 和初始化 card shells。
- 后续都是 `renderCard(cardId)` 的局部刷新。
- `loadAnkiCardTypeConfig()`、`saveCardTypeConfig()`、`saveFieldMapping()` 等都只刷新 `card-types` 卡片。

这与目标方案一致：后台检测完成后只需 `renderCard("card-types")`，不需要整页重建。

## 6. 当前没有“一次性检测状态”或“override 状态”的分层模型

- 当前只有一个 `cardTypeStatus` 字段，同时承载：
  - idle
  - manual refresh loading
  - manual refresh success
  - manual refresh failure
  - validation failure
- 没有单独的：
  - cache freshness check 状态
  - status override
  - detected live note type list
  - one-shot lifecycle promise

结果：如果直接把后台检测结果写回 `cardTypeStatus`，会和手动刷新成功/失败状态互相覆盖。

## 7. 当前没有防重入机制来保证“一次生命周期只检测一次”

- 现在 `renderCard("card-types")` 会在很多交互后被反复调用：
  - display 初始渲染
  - toggle/heading/note type 变更
  - QA Group warning acceptance
  - manual refresh 前后
- 但类内没有任何 `Promise` 或 `status` 标记来阻止重复启动 live 检测。

因此如果要加后台检测，必须把“是否已检测过/是否检测中”挂在 settings tab 实例上，而不是放在 render 逻辑里临时判断。

## 8. 当前测试已证明缓存渲染存在，但未覆盖状态与后台检测

- [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts) 当前已经覆盖：
  - `ankiNoteTypeCache` 渲染 note type 下拉
  - `ankiModelFieldCache` 渲染字段下拉
  - 手动完整刷新只触发 `listNoteModels()` + `getModelFieldNamesByModelNames()`
  - `getNoteModelDetails()` 在设置页刷新路径中不应被调用
- 但未覆盖：
  - 有缓存时首屏状态摘要
  - 首屏后台 `listNoteModels()` 轻量检测
  - 检测 changed / failed 分支
  - 无缓存时不启动后台检测
  - 手动 refresh 成功后清除 changed 提示

## 9. 当前 i18n 里缺少缓存状态分层文案

- 当前 card types 相关文案已有：
  - `loadedSummary`
  - `failedLoad`
  - `failedSave`
  - `loadAnki.loading`
- 但没有：
  - `cacheEmpty`
  - `cacheSummary`
  - `cacheChanged`
  - `cacheCheckFailed`

结果：即使实现了 cache-aware status，也没有现成 i18n key 可用。

## 10. 结论

当前仓库与目标方案的差距主要集中在状态模型，不在缓存渲染主链：

1. 缓存已经用于下拉和字段渲染，但状态文本仍是固定 idle。
2. 设置页打开时没有任何轻量 `modelNames` freshness check。
3. 当前缺少 cache status 与 manual refresh status 的分层模型。
4. 当前缺少防止重复后台检测的实例级状态。
5. 当前测试和 i18n 都还不知道这套缓存状态语义。

因此最安全的仓库兼容路径是：

1. 保留现有缓存渲染和 manual full refresh 流程。
2. 新增实例级的一次性 `listNoteModels()` 后台检测状态。
3. 用统一的 `getCardTypeStatusMessage()` 计算首屏状态与 override 状态。
4. 让后台检测只影响 card 1 的状态提示，不触碰 `data.json` 和字段缓存。