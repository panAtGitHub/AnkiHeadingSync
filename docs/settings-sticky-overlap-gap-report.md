# 设置页 Sticky 遮挡差距审计

本文基于当前仓库真实实现，定位设置页顶部透视与卡片标题停靠异常的实际接入点。

## 1. 当前 `display()` 已有页面级 sticky header，但遮罩不完整

- 入口在 [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)。
- `display()` 首次渲染时已经创建了 `pageHeaderEl`，并设置了：
  - `position: sticky`
  - `top: 0`
  - `zIndex: 100`
  - `background: var(--background-primary)`
- 但当前 `pageHeaderEl` 只有自身盒子背景，没有任何向上、向左右扩展的遮罩层。

结果是：页面标题本身能 sticky，但上方和侧边留白区域仍可能透出下层设置内容，尤其在 Obsidian 设置容器滚动时更明显。

## 2. 当前卡片标题按钮是 static，不会停靠在页面标题下方

- `initializeCards()` 中五张卡片仍是统一 shell：

```text
pageHeaderEl
settingsCardsContainer
  cardEl
    headerEl(button)
    bodyEl(div)
```

- `settingsCardToggle` 当前只保留普通按钮样式：
  - `display: flex`
  - `width: 100%`
  - `fontSize: 1.5em`
  - `background: var(--background-primary)`
  - `border: 2px solid var(--background-modifier-border)`
- 没有：
  - `position: sticky`
  - `top`
  - `zIndex`

结果是：卡片标题不会在滚动到页面顶栏下方时停住，因此无法实现“卡片标题栏顶到 Anki Heading Sync 下方后停止”的设计目标。

## 3. 当前没有页面标题高度变量，也没有测量逻辑

- `containerEl` 当前没有写入 `--ahs-settings-page-header-height`。
- `PluginSettingTab` 当前没有：
  - `ResizeObserver`
  - `getBoundingClientRect()` 回退测量
  - 页面标题高度的状态同步

结果是：即使恢复卡片标题 sticky，也没有可靠的 `top` 偏移来源，卡片标题无法稳定停靠在页面标题栏下方。

## 4. 当前 `hide()` 不做页面标题测量清理

- `hide()` 当前只做：
  - `displayInitialized = false`
  - `cardShells.clear()`
  - debounce 和缓存状态清理
- 没有任何 observer 断开逻辑。

如果本轮引入页面标题高度观察器，必须在 `hide()` 中断开，避免设置页重复打开后残留多重监听。

## 5. 现有展开/折叠与局部刷新接点应保持不变

- `toggleCard()` 只维护 `expandedCardIds`。
- `renderCard()` 只更新单卡：
  - 标题文本
  - `aria-expanded`
  - `bodyEl.style.display`
  - `bodyEl.empty()` 后重绘
- 已有测试也覆盖了：
  - 折叠展开不整页重建
  - 卡片 1 局部刷新不整页重建

这部分已经是正确的局部刷新边界，本轮不应改动。

## 6. 父容器路径上未发现必须先处理的 sticky 阻断样式

- 当前拥有 sticky 行为的直接元素只有页面级 `pageHeaderEl`。
- 在 `PluginSettingTab.ts` 的设置页装配路径中，未发现 `settingsCardsContainer`、`cardEl`、`bodyEl` 上存在会直接阻断标题按钮 sticky 的 `overflow: hidden/auto` 接入点。

因此本轮优先按用户合同落两层 sticky，并通过最小增量验证真实行为；不额外引入滚动监听或观察滚动位置的 JS 逻辑。

## 7. 结论

当前仓库与本轮目标之间的真实差距是：

1. 页面级 sticky 标题栏已有，但缺少完整不透明遮罩。
2. 卡片标题栏当前是 static，无法停靠在页面标题栏下方。
3. 缺少页面标题高度 CSS 变量和测量更新逻辑。
4. `hide()` 缺少 observer 清理。

最小且符合仓库现状的修复路径是：

1. 保留 `pageHeaderEl` 作为最高层 sticky header，并补一层绝对定位 mask。
2. 在 `containerEl` 上写入 `--ahs-settings-page-header-height`，默认 `64px`，运行时按真实高度更新。
3. 让每个 `settingsCardToggle` 恢复 sticky，并使用页面标题高度变量作为 `top`。
4. 在 `hide()` 中断开页面标题高度 observer。