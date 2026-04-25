# 设置页页面级 Sticky 标题栏实现决策

本文锁定本轮设置页 sticky 修复的最终决策：固定的是页面级白色标题栏，而不是每个设置卡片标题。

## 1. sticky 目标决策

- sticky 目标改为页面级 header 容器。
- 不再让 `settingsCardToggle` sticky。

最终结构：

```text
containerEl
  pageHeaderEl(sticky)
    h2
  cardsContainerEl
    cardEl
      headerEl(button)
      bodyEl(div)
```

## 2. 页面级标题栏样式决策

- `pageHeaderEl` 使用 inline style。
- 必选样式：
  - `position: sticky`
  - `top: 0`
  - `zIndex: 100`
  - `width: 100%`
  - `boxSizing: border-box`
  - `padding: 12px 0`
  - `background: var(--background-primary)`
  - `boxShadow: none`
- 额外使用 `marginBottom: 8px` 与下方内容拉开少量距离。

原因：

- 用户要的是页面顶部白色固定标题区。
- sticky header 仍在文档流内，配合少量底部间距即可避免内容贴得太紧。

## 3. 卡片标题样式决策

- `settingsCardToggle` 保留普通标题条样式：
  - `fontSize: 1.5em`
  - `fontWeight: 600`
  - `border: 2px solid var(--background-modifier-border)`
  - `background: var(--background-primary)`
  - `boxShadow: none`
- 取消以下样式：
  - `position: sticky`
  - `top`
  - `zIndex`

原因：

- 卡片标题只应承担“标题 + 点击折叠展开”职责。
- 继续让它们 sticky 会重复制造遮挡和叠层冲突。

## 4. DOM 初始化决策

- `display()` 首次初始化时先创建 `settingsPageHeader`。
- 再创建 `settingsCardsContainer`，并把五张卡片初始化到该容器里。
- 不对现有 `renderCard()`、`toggleCard()`、`bodyEl.empty()` 做行为改动。

## 5. 性能决策

- 严格使用 CSS sticky。
- 不引入：
  - `scroll` listener
  - `IntersectionObserver`
  - `requestAnimationFrame`

## 6. 测试决策

- `PluginSettingTab.test.ts` 需要断言：
  - `settingsPageHeader` 存在
  - `settingsPageHeader` 是 sticky
  - 每个 `settingsCardToggle` 不再 sticky
  - 每个 `settingsCardToggle` 继续保留标题按钮视觉样式
- 原有展开/折叠、局部刷新和 card 1 刷新测试继续保留。

## 7. 与旧方案的受控偏离

- 偏离 1：取消“每个卡片标题 sticky”。
  - 这是本轮修复的核心。
  - 原方案已经被截图与真实滚动行为证明方向错误。

- 偏离 2：不使用每卡片 sticky wrapper、mask、负 margin。
  - 原因是用户真实目标是页面级顶栏遮挡，而不是 section 级吸附。