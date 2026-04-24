# 设置页 Anki 模板缓存实现决策

本文锁定本轮“设置页 Anki 模板加载性能优化”的仓库兼容实现方案。

## 1. 设置模型新增字段缓存

- 保留现有 `ankiNoteTypeCache: string[]`。
- 新增：
  - `ankiModelFieldCache: Record<string, { fieldNames: string[]; loadedAt: number }>`
- 该缓存只用于设置页 UI 加速。
- 同步路径继续通过 live `getModelDetails()` 做实时校验。

## 2. 字段缓存 normalize 规则

- `ankiNoteTypeCache`：
  - 继续 trim
  - 过滤空字符串
  - 去重
  - 按稳定字典序保存
- `ankiModelFieldCache`：
  - 只接受对象
  - key 只保留 trim 后非空的模型名
  - `fieldNames` 只保留字符串项
  - 对每个模型内的字段名：trim、过滤空项、去重，保留原出现顺序
  - `loadedAt` 非有限数字时回退为 0
  - 最终按模型名字典序稳定输出

## 3. validate 规则

- 对 `ankiModelFieldCache` 做结构校验：
  - 顶层必须是对象
  - 每个模型缓存值必须是对象
  - `fieldNames` 必须是数组
  - 数组项必须全是字符串
  - `loadedAt` 必须是有限数字
- normalize 负责“纠偏和过滤”；validate 负责拒绝直接传入的非法结构。

## 4. gateway 接口设计

- 在 `AnkiGroupGateway` 中新增：
  - `getModelFieldNamesByModelNames(modelNames: string[]): Promise<Record<string, string[]>>`
- `AnkiConnectGateway` 内部使用一次 `multi` 请求发送多个 `modelFieldNames` action。
- 单个 action 若返回 `{ error }`：跳过该模型。
- 顶层 `multi` 若失败：抛错。
- 本轮不重构通用 `invokeMulti()`；新增一个专门解析该响应的方法，降低行为风险。

## 5. 设置页卡片 1 的数据来源

- 页面打开时：
  - note type 下拉来自 `ankiNoteTypeCache`
  - field 下拉来自 `ankiModelFieldCache[selectedModel].fieldNames`
- 若字段缓存存在，则在设置页内即时水合为 `loadedModelDetails` / draft mapping 可消费的形态。
- 若某个已选模板没有字段缓存：
  - 不阻塞渲染
  - 直接显示“请先读取字段”占位

## 6. 手动刷新按钮的精确流程

- 点击按钮后：
  - `listNoteModels()` 一次
  - `getModelFieldNamesByModelNames(modelNames)` 一次
  - 将两份缓存合并成一次 `updateSettings()`
- 保存成功后：
  - 刷新当前设置页实例内的 `availableNoteModels`
  - 用字段缓存为 3 个可见卡片类型生成或刷新 draft mapping
  - 状态显示：
    - `x = 模板数量`
    - `y = basic / qa-group / cloze 中，所选模板已有字段缓存的数量`
- 不再在按钮流程里默认调用 `getNoteModelDetails()`。
- 不再在按钮流程里默认调用 `modelTemplates()`。

## 7. 切换 note type 后的行为

- 切换模板仍立即保存 `cardTypeConfigs[configId].noteType`。
- 保存后卡片 1 会局部重渲染。
- 若新模板在 `ankiModelFieldCache` 中已有字段缓存：
  - 字段下拉立即显示缓存字段
  - draft mapping 若尚不存在，则用 `NoteFieldMappingService.suggest()` 现算一份 UI draft
- 不因为只是切换下拉而立刻访问 AnkiConnect。

## 8. QA Group 行与可见卡片范围

- 继续维持当前设置页只展示三行：
  - `basic`
  - `qa-group`
  - `cloze`
- 不把 `semantic-qa` 加回设置页，避免超出本轮范围。
- `qa-group` 当前仓库已经允许普通 note type / 字段映射编辑；本轮不扩大为产品改动，只沿用仓库现状。

## 9. Cloze 边界

- 设置页只需要字段名缓存和字段建议。
- Cloze 完整兼容性校验继续留在同步链路：
  - `getModelDetails()`
  - `isCloze` 判定
- 本轮不把 Cloze 严格校验搬到设置页刷新按钮里。

## 10. 卡片 1 局部刷新策略

- 按钮加载状态只存在于 card 1。
- 刷新操作前后只调用 `renderCard("card-types")`。
- 不调用整页 `display()`。
- 缓存保存尽量合并成一次 `updateSettings()`，避免按钮流程内多次写 settings。

## 11. 测试决策

- 配置层：补 `ankiModelFieldCache` 默认值、normalize、validate 覆盖。
- gateway：为新批量字段接口单独补 `multi` 请求与解析测试。
- 设置页：新增缓存优先渲染、刷新按钮调用次数、状态文案、切换模板后即时字段缓存生效等断言。

## 12. 与原计划的受控偏离

- 原计划写到“semantic-qa 继续不显示在设置页”，当前仓库确实只显示三行，因此保持不变。
- 原计划提到“当前 3 个可见卡片类型”，但仓库里的三行是 `basic / qa-group / cloze`，不是 `basic / cloze / semantic-qa`；本轮按仓库真实 UI 执行。
- 原计划说 QA Group 行是托管模型，但当前仓库已经允许 QA Group 行编辑 note type 和字段映射。为了不扩大产品行为回退范围，本轮不顺手收紧它，只做缓存与批量读取优化。