# 设置页 Sticky 标题栏差距审计

本文基于当前仓库真实实现，审计“设置页顶部白色标题栏固定显示”的正确接入点，以及之前方案为什么会导致遮挡异常。

## 1. 当前真实问题不在卡片内部，而在页面顶部缺少 sticky 标题栏

- 入口仍在 [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)。
- `display()` 首次进入时，原先只创建了一个普通 `h2`：
  - `containerEl.createEl("h2", { text: t("settings.pluginTitle") })`
- 这个 `h2` 不 sticky，也不是单独的遮挡层。

结果是：设置页真正缺少的是页面级顶部白色标题区域，而不是卡片级 sticky header。

## 2. 之前错误方案把 sticky 放到了每个设置卡片标题上

- `initializeCards()` 里，原先对每个 `settingsCardToggle` 设置了：
  - `position: sticky`
  - `top: 0`
  - 高 `z-index`
- 每个卡片标题仍然是交互按钮，同时承担 sticky、边框、背景、遮挡等职责。

这会导致两个问题：

1. 多个 section header 在同一滚动上下文里争抢顶部位置。
2. 卡片标题压住正文，出现边框、留白和叠层异常。

## 3. 当前卡片壳层逻辑本来就不需要卡片标题 sticky

- 当前五张卡片仍然是统一 card shell：

```text
cardEl
  headerEl(button)
  bodyEl(div)
```

- `toggleCard()` 负责折叠/展开。
- `renderCard()` 负责：
  - 更新 header 文本
  - 更新 `aria-expanded`
  - 切换 `bodyEl.style.display`
  - 清空并重绘 body
- 局部刷新仍然基于 `renderCard(cardId)`，而不是整页重建。

这说明卡片标题只需要保持“普通标题按钮”职责，不应该再兼任 sticky 遮挡层。

## 4. 正确 sticky 层级应该是页面级 header，而不是 section header

- 用户真实想要的效果是：
  - 最顶部的 “Anki Heading Sync” 始终固定显示
  - 它作为白色背景遮挡层，阻止下面内容跑到页面最上方
  - 卡片标题本身正常滚动，不再吸附
- 因此正确结构应是：

```text
containerEl
  pageHeaderEl(sticky)
    h2
  cardsContainerEl
    cardEl
      headerEl(button, static)
      bodyEl
```

## 5. 当前仓库仍然适合用 inline style，而不是新增样式表

- 仓库当前没有 `styles.css`。
- [PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts) 现有布局样式仍然主要是 inline style。

因此页面级 sticky header 仍应直接在 `display()` 初始化时落 inline style，与仓库现状一致。

## 6. 当前没有证据表明需要 JS 滚动逻辑

- 没有现成的 `scroll` listener、`IntersectionObserver` 或 `requestAnimationFrame` 滚动同步逻辑。
- 页面级 sticky header 已经满足需求，不需要 JS fallback。

## 7. 之前测试锚点也验证了错误方向

- [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts) 之前断言的是：
  - 每个 `settingsCardToggle` 都是 sticky
- 这与用户真实目标冲突。

正确测试应该改成：

1. 存在页面级 `settingsPageHeader`。
2. `settingsPageHeader` 是 sticky。
3. 每个 `settingsCardToggle` 不再 sticky。
4. 每个 `settingsCardToggle` 仍保留标题按钮视觉样式。

## 8. 结论

当前仓库的真实差距不是“section header sticky 还不够强”，而是“页面级标题栏本来就没有 sticky”。

最小、安全、符合真实需求的修复路径是：

1. 在 `display()` 中创建单独的 `settingsPageHeader` 容器并设为 sticky。
2. 将原来的 `h2` 放入该 header 容器。
3. 将卡片列表放到单独的 cards container 下方。
4. 取消每个 `settingsCardToggle` 的 sticky，只保留普通标题条样式。