# 设置页 Sticky 标题间距修复决策

本文锁定本轮“页面标题与卡片标题 sticky 间距固定为同一个 8px 来源”的最终实现策略。

## 1. 共享常量决策

- 新增常量：
  - `SETTINGS_STICKY_CARD_GAP_PX = 8`
  - `SETTINGS_PAGE_HEADER_FALLBACK_HEIGHT_PX = 64`
- 这两个常量只服务于当前 sticky 标题布局。

原因：

- 页面标题正常流间距与卡片 sticky 偏移必须来自同一来源，避免滚动前后出现漂移。

## 2. CSS 变量决策

- 在 `containerEl` 初始化时写入：
  - `--ahs-settings-page-header-height: 64px`
  - `--ahs-settings-sticky-card-gap: 8px`
- 页面标题高度变量继续允许运行时测量覆盖。
- gap 变量固定作为共享布局输入。

原因：

- 卡片标题 sticky top 需要同时引用“页面标题高度 + 固定 gap”。
- 变量必须在卡片首次渲染前存在，避免首帧偏移不稳定。

## 3. 页面标题间距策略

- 页面标题继续保持：
  - `position: sticky`
  - `top: 0px`
  - `zIndex: 300`
  - 不透明背景
- 保留现有页面标题遮罩实现。
- `marginBottom` 改为：

```ts
var(--ahs-settings-sticky-card-gap, 8px)
```

原因：

- 页面标题底部间距的语义保留不变，但不再和 sticky 偏移脱节。

## 4. 卡片标题 sticky top 策略

- 每个 `settingsCardToggle` 继续保持 sticky。
- `top` 改为：

```ts
calc(var(--ahs-settings-page-header-height, 64px) + var(--ahs-settings-sticky-card-gap, 8px))
```

- `zIndex` 继续低于页面标题、高于正文。
- 背景继续使用不透明主题背景。

原因：

- 这能保证未滚动时的 8px 间距与吸顶后的 8px 间距由同一个 gap 驱动。
- 卡片标题不会贴到页面标题底边，也不会在滚动后压缩这段间距。

## 5. 测量与 fallback 决策

- 继续复用已有 `ResizeObserver` 路径更新 `--ahs-settings-page-header-height`。
- 初始化先写 `64px` fallback，测试环境保持可预测。
- `hide()` 继续断开 observer。

原因：

- 本轮不需要新增滚动监听或其它运行时机制。
- 现有测量路径已经足以支撑“header-height + gap”的计算。

## 6. 不变边界

- 不改 DOM 结构。
- 不改 `toggleCard()`。
- 不改 `renderCard()`。
- 不改 `expandedCardIds`。
- 不改设置数据结构、Anki 同步逻辑、局部刷新逻辑。
- 不引入 scroll listener、`IntersectionObserver` 或 `requestAnimationFrame`。

## 7. 本轮与当前实现的最小差异

- 当前实现已经修好了页面标题遮罩和双层 sticky。
- 本轮只补“共享 8px 间距变量”这一层。
- 因此本次不是重新设计 sticky 结构，而是把已有 sticky 结构的间距输入统一化。