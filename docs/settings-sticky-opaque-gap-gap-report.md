# 设置页 Sticky 不透明间距差距审计

本文基于当前仓库真实实现，定位页面级 `Anki Heading Sync` 标题栏与卡片标题栏之间 8px 间距为何仍然会透出下层内容。

## 1. 当前 8px 视觉间距仍来自 `pageHeaderEl.style.marginBottom`

- 入口仍在 [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)。
- 当前 `display()` 中页面标题 `pageHeaderEl` 已经是 sticky，且背景不透明。
- 但标题与第一张卡片标题之间的 8px 间距目前仍由：

```ts
pageHeaderEl.style.marginBottom = SETTINGS_STICKY_CARD_GAP_VALUE;
```

提供。

这意味着当前 8px 仍然属于 header 外部透明 margin，而不是 header 自身不透明背景的一部分。

## 2. 透明 margin 正是截图里透视的根因

- CSS margin 不属于元素背景绘制区域。
- 因此即使 `pageHeaderEl` 本体有不透明背景，margin 区域也仍然是透明的。
- 当前截图里 `Anki Heading Sync` 与卡片标题之间会露出下层文字，和这一路径完全一致。

结论：只要这段 8px 继续由 `marginBottom` 提供，就无法做到“不透明的 sticky 标题间距”。

## 3. 当前卡片标题 sticky top 还额外加上了 gap

- 当前每个 `settingsCardToggle` 已经是 sticky。
- 但其 `top` 现在写的是：

```ts
calc(var(--ahs-settings-page-header-height, 64px) + var(--ahs-settings-sticky-card-gap, 8px))
```

- 这表示卡片 sticky 偏移仍把 gap 视作“header 外部额外距离”。

如果本轮把 8px 合并进 pageHeader 自身 padding，那么卡片标题 `top` 就必须回到：

```ts
var(--ahs-settings-page-header-height, 64px)
```

否则会重复多算一次 8px。

## 4. 当前页面标题高度测量路径已经可以复用

- 当前仓库已经具备：
  - `--ahs-settings-page-header-height`
  - `ResizeObserver`
  - `getBoundingClientRect().height`
  - `hide()` 中 observer 清理

因此，本轮不需要新增测量机制，只需要让真实测量高度包含新的底部 padding。

## 5. 当前最小可行修复路径

在不改 DOM 结构、不改业务行为前提下，最小修复应为：

1. 保留 pageHeader sticky 和现有 mask。
2. 取消透明 `marginBottom`。
3. 改由 `pageHeaderEl` 自身底部 padding 承载 8px 间距。
4. 让 `--ahs-settings-page-header-height` 测量包含这段 padding。
5. 让卡片标题 sticky `top` 仅等于页面标题高度变量，不再额外加 gap。

## 6. 结论

当前真实差距是：

1. 8px 间距仍由透明 margin 提供。
2. 这会让下层文本和内容穿透该区域。
3. 卡片标题 sticky top 仍把 gap 当作 header 外部距离来计算。
4. 现有测量和清理路径已经足够支撑修复。

因此，本轮应把 8px 从透明 margin 收编到 pageHeader 自身 padding 内，使间距属于不透明 header 背景，并让卡片标题直接停靠在测量后的真实 pageHeader 高度下方。