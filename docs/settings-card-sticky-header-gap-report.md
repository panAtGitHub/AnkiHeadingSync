# 设置页卡片标题 Sticky 差距审计

本文基于当前仓库真实实现，审计“设置页卡片标题 sticky 悬浮”的接入点与差距。

## 1. 当前设置页已经有稳定的卡片壳层结构

- 入口在 [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)。
- `display()` 首次进入时会调用 `initializeCards(containerEl)`。
- 当前五张设置卡片都通过同一套 card shell 创建：
  - `cardEl.dataset.settingsCard = cardId`
  - `headerEl = cardEl.createEl("button")`
  - `bodyEl = cardEl.createDiv()`
- 当前 DOM 结构就是目标方案需要的：

```text
cardEl
  headerEl(button)
  bodyEl(div)
```

这说明 sticky 可以直接挂在现有 `headerEl` 上，不需要重组 DOM。

## 2. 当前卡片标题确实是按钮，并负责展开/折叠

- `initializeCards()` 中的 header 是原生 `button`。
- `headerEl.dataset.settingsCardToggle = cardId` 已经被测试使用。
- `headerEl.addEventListener("click", () => this.toggleCard(cardId))` 负责折叠/展开。
- `renderCard()` 中继续刷新：
  - `headerEl.textContent = ...`
  - `headerEl.setAttr("aria-expanded", ...)`
  - `bodyEl.style.display = expanded ? "block" : "none"`
  - `bodyEl.empty()`

因此 sticky 实现必须保持 header 仍然是同一个按钮元素，不能换成纯文本标题或外部固定容器。

## 3. 当前局部刷新机制已经存在，sticky 不应触碰

- `display()` 首次渲染后，不会反复重建整个设置页。
- 后续更新都走 `renderCard(cardId)`。
- 当前局部刷新触点包括：
  - `toggleCard()`
  - `loadAnkiCardTypeConfig()`
  - `saveCardTypeConfig()`
  - `saveFieldMapping()`
  - `refreshFolderTree()`
  - `updateScopeMode()`
  - `updateFolderSelection()`
- 现有测试已经覆盖：
  - 展开/折叠不重建整页
  - 手动读取 Anki 配置只刷新 card 1
  - scope tree 交互不重建整页

这说明本轮最安全的实现是只给 header 增加样式，不改 `toggleCard()`、`renderCard()`、`bodyEl.empty()`、`expandedCardIds`。

## 4. 当前仓库没有设置页专用样式表，样式约定偏向 inline

- 仓库根目录当前没有 `styles.css`。
- 当前 [PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts) 已经大量用 inline style 设置布局：
  - flex / grid
  - width / gap / padding
  - border / borderRadius
  - overflow / ellipsis
- 没有现成的 settings card class + stylesheet 体系可复用。

因此本轮若新增 sticky 样式，直接写在 `initializeCards()` 的 `headerEl.style` 上是与仓库现实最一致的方案。

## 5. 当前未发现会直接破坏 sticky 的卡片祖先 overflow

- `cardEl` 当前没有设置 `overflow`。
- `bodyEl` 当前没有设置 `overflow`。
- card shell 附近没有发现：
  - `overflow: hidden`
  - `overflow: auto`
  - `overflow: scroll`
- 当前在卡片内部出现的 `overflow` 主要是局部控件布局：
  - 某些 grid 容器显式为 `visible`
  - 某些字段选择器为 ellipsis 设置 `hidden`

这些控件级 overflow 不在 sticky header 的祖先链关键位置上，不构成当前实现的直接阻断。

## 6. 当前没有 JS 滚动逻辑，也不需要新增

- 没有现成的：
  - `scroll` listener
  - `IntersectionObserver`
  - `requestAnimationFrame` 滚动同步
- 当前 card shell 结构已经满足浏览器原生 sticky 的典型使用条件。

因此本轮不存在“沿用旧 JS 方案”的历史包袱，直接使用 CSS sticky 即可。

## 7. 当前测试还不知道 sticky 样式

- [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts) 当前已覆盖：
  - 五张卡片存在
  - 默认展开状态
  - 展开/折叠不重建整页
  - card 1 局部刷新
  - scope / deck 局部刷新
- 但还没有断言：
  - `settingsCardToggle` 的 sticky 样式
  - `position: sticky`
  - `top: 8px`
  - `zIndex: 20`
  - `background`

这意味着本轮只需要在现有测试体系中补一条 header 样式断言，不需要引入新的测试基础设施。

## 8. 结论

当前仓库与目标方案高度兼容，差距很窄：

1. 已有合适的 `cardEl > headerEl(button) + bodyEl` 结构。
2. 已有稳定的展开/折叠与局部刷新机制。
3. 未发现卡片祖先 overflow 会直接破坏 sticky。
4. 仓库没有 settings stylesheet，inline style 才是当前实现惯例。
5. 当前唯一缺口是：header 尚未添加 sticky 样式，测试也尚未覆盖该样式。

因此最小、安全、与仓库一致的实现路径是：

1. 在 `initializeCards()` 中直接给 `headerEl` 增加 sticky 相关 inline 样式。
2. 不改 card shell DOM，不改 render/toggle/local-refresh 逻辑。
3. 在现有 `PluginSettingTab.test.ts` 里补 5 张卡片 header 的 sticky 样式断言。