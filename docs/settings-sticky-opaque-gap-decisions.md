# 设置页 Sticky 不透明间距修复决策

本文锁定本轮“8px 间距属于不透明页面标题背景”的最终实现策略。

## 1. 共享常量决策

- 保留并继续使用：
  - `SETTINGS_STICKY_CARD_GAP_PX = 8`
  - `SETTINGS_PAGE_HEADER_FALLBACK_HEIGHT_PX = 64`

原因：

- 这两个常量已经是当前 sticky 布局的统一输入，不需要再引入新的数值来源。

## 2. CSS 变量决策

- `containerEl` 继续写入：
  - `--ahs-settings-sticky-card-gap: 8px`
  - `--ahs-settings-page-header-height: 64px`
- 页面标题高度变量继续由测量结果覆盖。

原因：

- gap 变量仍需要参与 pageHeader 底部 padding 计算。
- 卡片标题 sticky `top` 仍需要使用页面标题高度变量作为最终停靠位置。

## 3. 页面标题不透明间距策略

- 页面标题继续保持：
  - `position: sticky`
  - `top: 0px`
  - `zIndex: 300`
  - 不透明背景
- 取消透明 `marginBottom` 作为间距来源。
- 改为：

```ts
paddingTop = "12px"
paddingBottom = "calc(12px + var(--ahs-settings-sticky-card-gap, 8px))"
marginBottom = "0"
```

原因：

- 8px 视觉间距必须属于 pageHeader 自身背景绘制区域，否则无法阻止下层内容透出。

## 4. 保留现有 mask 策略

- 保留 `settingsPageHeaderMask`。
- 继续使用相同不透明背景，并跟随 pageHeader sticky。

原因：

- 这层 mask 负责遮住标题上方和左右透明缺口，本轮问题不在这里，不需要重做。

## 5. 卡片标题 sticky top 策略

- 每个 `settingsCardToggle` 继续 sticky。
- `top` 改回：

```ts
var(--ahs-settings-page-header-height, 64px)
```

- 不再额外 `+ 8px`。

原因：

- 8px gap 已经被吸收到 pageHeader 自身 padding 中。
- `--ahs-settings-page-header-height` 的真实测量值会包含这段 padding。
- 若继续额外加 gap，会多出一段额外间距。

## 6. 测量与 cleanup 决策

- 继续复用已有 `ResizeObserver` 和 `getBoundingClientRect().height`。
- `hide()` 继续断开 observer。

原因：

- 现有测量路径已经满足“测量包含 padding 的真实 header 高度”的需求。

## 7. 不变边界

- 不改 DOM 结构。
- 不改 `toggleCard()`、`renderCard()`、`expandedCardIds`、`bodyEl.empty()`。
- 不改局部刷新逻辑。
- 不改设置数据结构和 Anki 同步逻辑。
- 不引入 scroll listener、`IntersectionObserver` 或 `requestAnimationFrame`。

## 8. 与上一轮 sticky gap 方案的差异

- 上一轮把 8px 间距放在 pageHeader 外部 margin，并让 card header `top` 额外加 gap。
- 本轮改为让 8px 成为 pageHeader 自身不透明 padding 的一部分。

原因：

- 新截图证明仅固定数值还不够，间距承载层也必须是不透明的 header 本体。