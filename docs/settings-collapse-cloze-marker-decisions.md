# 设置页默认折叠与填空题标记修复决策

本文锁定本轮“设置页全部默认折叠 + cloze 默认识别切换到 `H4 + #anki-cloze`”的最终实现策略。

## 1. 默认折叠策略

- `expandedCardIds` 默认改为空集合。
- 不改 `toggleCard()`。
- 不改 `renderCard()`。
- 不改局部刷新边界。

原因：

- 现有卡片折叠/展开与局部刷新行为已经正确，本轮只需要把首次进入设置页时的默认态改成“全部折叠”。

## 2. cloze 新默认决策

- 新默认常量：
  - `DEFAULT_CLOZE_HEADING_LEVEL = 4`
  - `DEFAULT_CLOZE_MARKER = "#anki-cloze"`
- `createDefaultCardTypeConfigs()` 中 cloze 默认改为：
  - `headingLevel: 4`
  - `extraMarker: "#anki-cloze"`

原因：

- 这样可以与现有 `#anki-list` 风格对齐。
- 同级 `H4` 下：
  - 空标签留给普通问答
  - `#anki-list` 留给 QA Group
  - `#anki-cloze` 留给 Cloze

## 3. 旧默认迁移策略

- 仅当 cloze 识别配置仍等于旧默认时才迁移：
  - `headingLevel: 5`
  - `extraMarker: ""`
- 迁移后改为：
  - `headingLevel: 4`
  - `extraMarker: "#anki-cloze"`
- 如果用户已经自定义 cloze 的 heading level 或 extra marker，则保留用户配置。

原因：

- 本轮目标是替换旧默认，而不是重写用户自定义识别规则。

## 4. legacy 快照的判定策略

- 对只有旧顶层字段、没有显式 cloze per-card recognition 配置的 legacy 快照：
  - 如果 `clozeHeadingLevel` 仍是旧默认 `5`
  - 则将其视为可迁移的旧默认，升级到 `4 + #anki-cloze`

原因：

- 旧结构没有 cloze marker 字段，无法精确区分“显式保留 H5”与“沿用旧默认 H5”。
- 仓库现实下只能把 legacy `H5` 视为旧默认并升级。

## 5. 识别与校验策略

- 保留现有 `resolveHeadingConfig()`：
  - 先 marker 匹配
  - 再空 marker 默认回退
- 保留现有“同一个 heading 只能有一个 enabled 空 marker 默认行”的校验。

原因：

- 当前识别算法已经足够支持同级 `H4` 下的 marker 分流。
- 只要 cloze 改成 `#anki-cloze`，默认冲突自然消失。

## 6. 测试策略

- 设置页测试全部改为“默认折叠”前提。
- 需要读取 card 1 内容或触发局部刷新时，先点击展开对应卡片。
- 新增或更新设置模型测试，覆盖：
  - cloze 新默认
  - 旧默认迁移
  - 用户自定义保留
- 新增识别测试，覆盖：
  - `H4 + 空标签 -> basic`
  - `H4 + #anki-list -> qa-group`
  - `H4 + #anki-cloze -> cloze`

## 7. 不变边界

- 不改 Anki 字段映射。
- 不改卡片渲染逻辑。
- 不改 sticky 设置页结构。
- 不改 sync 执行逻辑，除默认识别配置变化自然影响扫描结果外，不新增行为。