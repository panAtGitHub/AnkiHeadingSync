# 设置页 Anki 模板缓存状态实现决策

本文锁定本轮“设置页模板缓存状态 + 后台轻量 freshness 检测”的仓库兼容实现方案。

## 1. 作用域决策

- 只改设置页 card 1 的状态显示与轻量检测。
- 不改同步主线。
- 不新增按需字段读取。
- 保留现有 manual full refresh 行为。

## 2. 缓存状态模型决策

- 在 `PluginSettingTab` 中新增实例级状态：
  - `noteTypeCacheCheckStatus: "idle" | "checking" | "same" | "changed" | "failed"`
  - `noteTypeCacheCheckPromise: Promise<void> | null`
  - `detectedAnkiNoteTypeCache: string[] | null`
- 另增：
  - `cardTypeStatusOverride: UserFacingMessage | null`

## 3. 统一状态计算决策

- 不再直接渲染原来的 `cardTypeStatus` 字段。
- 改为通过 `getCardTypeStatusMessage()` 统一计算。
- 优先级固定为：
  1. `ankiConfigLoading === true`
  2. `cardTypeStatusOverride`
  3. 缓存状态：
     - 无缓存 -> `cacheEmpty`
     - 缓存 + changed -> `cacheChanged`
     - 缓存 + failed -> `cacheCheckFailed`
     - 缓存 + idle/checking/same -> `cacheSummary`

## 4. 后台检测启动决策

- `renderCardTypesCard()` 每次渲染时调用 `maybeStartNoteTypeCacheCheck()`。
- 但该方法必须短路以下情况：
  - `ankiConfigLoading === true`
  - `ankiNoteTypeCache.length === 0`
  - `noteTypeCacheCheckPromise !== null`
  - `noteTypeCacheCheckStatus !== "idle"`
- 这样同一 settings tab 生命周期只会发起一次后台检测。

## 5. 轻量检测语义决策

- 后台检测只调用 `listNoteModels()`。
- 不调用：
  - `getModelFieldNamesByModelNames()`
  - `getNoteModelDetails()`
  - `modelTemplates`
- 比较逻辑使用规范化后的名称列表：
  - trim
  - 过滤空字符串
  - 去重
  - 排序
- 比较相等 -> `same`
- 比较不等 -> `changed`
- 调用失败 -> `failed`
- 检测结果不写入 `data.json`。

## 6. override 与缓存状态交互决策

- 手动 full refresh 成功时：
  - `cardTypeStatusOverride = loadedSummary`
  - `noteTypeCacheCheckStatus = "same"`
  - `detectedAnkiNoteTypeCache = 最新 modelNames`
- 手动 full refresh 失败时：
  - `cardTypeStatusOverride = failedLoad`
  - 保留已有缓存和字段映射
- 本地 validation/save 失败时：
  - `cardTypeStatusOverride = failedSave` 或具体错误
- 普通自动保存成功时：
  - 清空 `cardTypeStatusOverride`

## 7. 生命周期重置决策

- `hide()` 时重置：
  - `noteTypeCacheCheckStatus = "idle"`
  - `noteTypeCacheCheckPromise = null`
  - `detectedAnkiNoteTypeCache = null`
  - `cardTypeStatusOverride = null`
- 这样每次重新打开设置页都允许重新做一次轻量检测。

## 8. manual full refresh 决策

- 保持当前完整流程：
  - `listNoteModels()`
  - `getModelFieldNamesByModelNames()`
  - `updateSettings({ ankiNoteTypeCache, ankiModelFieldCache })`
  - `hydrateVisibleCardTypeCaches()`
  - `syncQaGroupMappingFromCache()`
- 成功后 card 1 继续局部刷新。
- 失败后继续用缓存渲染下拉和字段。

## 9. 受控偏离

- 偏离 1：当前仓库的“保存失败”有两类。
  - 设置页内可见的 validate 失败，仍会进入 `cardTypeStatusOverride`
  - `plugin.updateSettings()` 内部持久化失败只通过 NoticeService 通知，当前设置页拿不到错误回传
- 因此本轮只能稳定覆盖“校验失败”和“手动刷新失败”的 override，不额外改 plugin 层错误合同。

- 偏离 2：后台检测中的 `checking` 不单独显示 loading 文案。
  - 仍显示 `cacheSummary`
  - 原因：计划要求检测不阻塞 UI，且 checking 与 same 的用户文案相同

- 偏离 3：`detectedAnkiNoteTypeCache` 仅作为实例内调试/状态记录，不参与渲染计数。
  - 渲染中的数量仍来自持久缓存 `ankiNoteTypeCache`
  - 原因：目标文案强调“当前使用缓存的 x 个模板”