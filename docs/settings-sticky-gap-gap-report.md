# 设置页 Sticky 标题间距差距审计

本文基于当前仓库真实实现，定位页面级 `Anki Heading Sync` 标题栏与卡片标题栏之间 8px 间距在 sticky 状态下丢失的实际原因。

## 1. 当前真实间距来源确实是页面标题的 `marginBottom = "8px"`

- 入口仍在 [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)。
- 当前 `display()` 中，页面标题栏 `pageHeaderEl` 已经是 sticky。
- 现在未滚动时，`Anki Heading Sync` 与第一张卡片标题之间的视觉间距来自：

```ts
pageHeaderEl.style.marginBottom = "8px";
```

因此，当前 8px 间距不是来自卡片标题自身的 `top`，而是来自页面标题在正常文档流中的底部外边距。

## 2. 当前卡片标题 sticky top 没有包含这 8px 间距

- `initializeCards()` 里每个 `settingsCardToggle` 当前已经是 sticky。
- 但其 `top` 目前写的是：

```ts
var(--ahs-settings-page-header-height, 64px)
```

- 也就是只吃页面标题高度变量，没有把页面标题与卡片标题之间原本的 8px 外部间距算进去。

结果是：

- 未滚动时，页面标题底部的 8px margin 生效。
- 滚动后，卡片标题变成 sticky 停靠时，只贴着页面标题高度停住。
- 原先的 8px 外部间距没有参与 sticky offset，因此视觉上会被压缩或消失。

## 3. 页面标题高度变量已存在，但 gap 变量还不存在

- 当前仓库已经有：
  - `--ahs-settings-page-header-height`
- 且通过 `ResizeObserver` 和 `getBoundingClientRect().height` 更新。
- `hide()` 也已经断开该 observer。

这说明页面标题高度测量路径已经具备，但缺的是与之并列的共享 gap 变量：

- `--ahs-settings-sticky-card-gap`

## 4. 当前实现里 8px 和 64px 仍是分散字面量

- 页面标题间距仍直接写死 `8px`。
- 页面标题高度 fallback 仍是字符串字面量 `64px`。

这导致当前 sticky 间距逻辑没有一个统一来源，页面标题正常流间距和卡片 sticky 偏移也无法保证永远同步。

## 5. 现有业务行为边界不需要改动

- 当前 `toggleCard()`、`renderCard()`、`expandedCardIds`、`bodyEl.empty()`、局部刷新逻辑都已经稳定。
- 问题纯粹是布局变量没有贯通 sticky top 计算。

因此本轮修复应只改：

1. 共享常量
2. `containerEl` CSS 变量
3. `pageHeaderEl.marginBottom`
4. `settingsCardToggle.top`
5. 对应测试与文档

## 6. 结论

当前真实差距是：

1. 页面标题与第一张卡片之间的 8px 间距确实来自 `pageHeaderEl.style.marginBottom = "8px"`。
2. 卡片 sticky top 当前只用页面标题高度，没有包含这 8px 间距。
3. 已有页面标题高度变量和 observer 清理路径可以复用。
4. 缺少共享的 sticky gap 常量和 CSS 变量。

最小修复路径是：

1. 增加 `SETTINGS_STICKY_CARD_GAP_PX = 8` 和 `SETTINGS_PAGE_HEADER_FALLBACK_HEIGHT_PX = 64`。
2. 在 `containerEl` 上写入 `--ahs-settings-page-header-height` 与 `--ahs-settings-sticky-card-gap`。
3. 把 `pageHeaderEl.style.marginBottom` 改为引用同一个 gap 变量。
4. 把每个卡片标题 sticky `top` 改为：

```css
calc(var(--ahs-settings-page-header-height, 64px) + var(--ahs-settings-sticky-card-gap, 8px))
```

这样才能保证滚动前后的标题间距保持同一来源、同一数值。