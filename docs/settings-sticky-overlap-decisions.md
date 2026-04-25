# 设置页 Sticky 遮挡修复决策

本文锁定本轮“页面标题遮罩 + 卡片标题停靠”修复的最终实现策略。

## 1. 页面标题仍是最高层 sticky

- 保留 `display()` 中的 `pageHeaderEl`。
- 最终样式决策：
  - `position: sticky`
  - `top: 0px`
  - `zIndex: 300`
  - `backgroundColor: var(--modal-background, var(--background-primary))`
- 继续保留现有 inline style 方式，不新增全局样式表。

原因：

- 当前仓库设置页布局主要仍由 inline style 负责。
- 页面标题是统一的上层遮挡面，应该高于所有卡片标题。

## 2. 页面标题增加独立 mask，而不是只依赖 header 本体背景

- 在 `pageHeaderEl` 内增加：
  - `data-settings-page-header-mask="true"`
- mask 使用：
  - `position: absolute`
  - 向上扩展
  - 向左右扩展
  - 与页面标题相同的不透明主题背景
- mask 层级低于标题文本，但跟随页面标题一起处于最高层 sticky 堆叠上下文。

原因：

- 仅靠 `pageHeaderEl` 自身背景，只能覆盖 header 盒子范围，无法盖住页面标题上方和左右的透明缺口。

## 3. 卡片标题恢复 sticky，但固定停在页面标题下方

- `settingsCardToggle` 最终样式决策：
  - `position: sticky`
  - `top: var(--ahs-settings-page-header-height, 64px)`
  - `zIndex: 200`
  - `backgroundColor: var(--modal-background, var(--background-primary))`
- 保留现有按钮视觉：
  - `width: 100%`
  - `border: 2px solid var(--background-modifier-border)`
  - `fontSize: 1.5em`
  - 点击切换折叠/展开

原因：

- 卡片标题需要 sticky，才能满足“滚动到页面标题下方后停住”的交互。
- `top` 必须基于页面标题真实高度，不能再写死为 `0`。
- `zIndex` 必须低于页面标题层级，避免钻到标题前面。

## 4. 页面标题高度通过 CSS 变量驱动

- 在 `containerEl` 上写入：
  - `--ahs-settings-page-header-height`
- 默认值：
  - `64px`
- 运行时优先用 `ResizeObserver` 监听 `pageHeaderEl`。
- 如可测量，则通过 `getBoundingClientRect()` 取真实高度并回写像素值。
- 无法测量时保留 `64px` fallback。

原因：

- 测试环境和部分渲染阶段无法可靠给出布局尺寸，需要一个稳定 fallback。
- 真实 Obsidian 设置页中，标题高度可能受字体或缩放影响，运行时测量更稳妥。

## 5. `hide()` 负责 observer 清理

- 在 `hide()` 中断开页面标题高度 observer。
- 同时清掉存储的 observer 引用，避免重复打开设置页时累积监听。

原因：

- `displayInitialized` 会在 `hide()` 后复位，下一次打开会重建 DOM。
- 如果不清理 observer，会造成重复观察和不可预测的高度回写。

## 6. 保持不变的边界

- 不改 `pageHeaderEl / settingsCardsContainer / cardEl / headerEl / bodyEl` 这一卡片 shell 结构。
- 不改 `toggleCard()` 的展开/折叠逻辑。
- 不改 `renderCard()` 的局部刷新边界。
- 不改同步逻辑、设置数据结构、命令行为。
- 不引入：
  - scroll listener
  - `IntersectionObserver`
  - `requestAnimationFrame` 滚动逻辑

## 7. 与旧 sticky 文档的偏离说明

- 仓库里已有的旧文档把卡片标题视为 static，这是之前一次实现决策。
- 本轮按新的用户合同执行，原因是当前真实 UI 目标已经变化：
  - 页面标题需要继续 sticky 并补齐遮罩
  - 卡片标题也需要 sticky，但停靠在页面标题下方

因此，本轮不是延续旧方案，而是在同一真实代码接点上升级为“两层 sticky”结构。