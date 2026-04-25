# 设置页卡片标题 Sticky 实现决策

本文锁定本轮“设置页卡片标题 sticky 悬浮”的最终实现策略。

## 1. 样式落点决策

- sticky 样式直接写在 [PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts) 的 `initializeCards()` 中。
- 不新建 `styles.css`。
- 不引入 settings card CSS class 体系。

原因：

- 当前仓库没有现成的 settings stylesheet。
- 现有 settings 页布局样式大量使用 inline style。
- 本轮改动只影响 card header，一次性在 `headerEl` 上落样式最小、最稳定。

## 2. sticky 行为决策

- 所有五个 settings card header 都使用同一套 sticky 样式。
- sticky 目标元素保持为原有 `button` header。
- DOM 结构继续保持：

```text
cardEl
  headerEl(button)
  bodyEl(div)
```

- 不把 header 移到单独容器。
- 不做全局固定标题栏。

原因：

- 浏览器可利用当前 cardEl 边界自然完成“当前卡片吸附，下一卡片接替”。
- 这能最大程度保持当前展开/折叠和局部刷新行为不变。

## 3. 最终样式决策

- 必选样式：
  - `position: sticky`
  - `top: 8px`
  - `zIndex: 20`
  - `background: var(--background-primary)`
- 额外样式采用轻量版本：
  - `marginBottom: 8px`
  - `boxShadow: 0 2px 8px rgba(0, 0, 0, 0.08)`

- 本轮不额外加：
  - `border`
  - `borderRadius`
  - `width: fit-content`

原因：

- 目标是提供 sticky 吸附感，而不是把 header 重新视觉包装成独立卡片。
- 当前按钮基础外观应继续尽量交给 Obsidian 主题处理。
- 只补最小 sticky 必需样式和轻微阴影，视觉风险最低。

## 4. 兼容性决策

- 不新增任何 `overflow` 到 `cardEl` 或 `bodyEl`。
- 不调整现有 card shell 边界。
- 如果后续在真实 Obsidian 主题中出现 sticky 不生效，优先排查外层宿主容器，而不是引入 JS fallback。

原因：

- 当前仓库内未发现 card shell 祖先上的 overflow 阻断。
- 本轮没有证据表明需要 CSS 之外的方案。

## 5. 性能决策

- 严格使用 CSS sticky。
- 不实现：
  - `window.addEventListener("scroll", ...)`
  - `containerEl.addEventListener("scroll", ...)`
  - `IntersectionObserver`
  - `requestAnimationFrame`

原因：

- 当前 DOM 结构已足够支持 sticky。
- JS 滚动同步会扩大变更面，并增加设置页滚动负担。
- 本轮目标明确要求无滚动监听。

## 6. 行为保留决策

- 保持以下逻辑不变：
  - `expandedCardIds`
  - `toggleCard()`
  - `renderCard()`
  - `bodyEl.style.display = expanded ? "block" : "none"`
  - `bodyEl.empty()`
  - 所有局部刷新调用点

原因：

- sticky 只是展示增强，不应改变现有设置页状态管理或刷新模型。

## 7. 测试决策

- 在 [PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts) 新增一条 DOM 断言：
  - 五个 `settingsCardToggle` 都存在 sticky 样式
  - 至少断言：
    - `position = sticky`
    - `top = 8px`
    - `zIndex = 20`
    - `background = var(--background-primary)`
- 原有以下测试继续保留并通过：
  - 展开/折叠不重建整页
  - 读取 Anki 配置只刷新 card 1
  - folder tree 交互不重建整页

## 8. 与计划的受控偏离

- 偏离 1：不新增 `styles.css` 或 class-based 样式。
  - 原计划允许 class 或 inline 二选一。
  - 仓库现实更偏向 inline style，因此本轮使用 inline。

- 偏离 2：不额外加 `border` / `borderRadius` / `fit-content`。
  - 原计划将这些作为可选视觉项。
  - 为避免 header 视觉权重过重，本轮只保留 sticky 必需样式和轻微阴影。