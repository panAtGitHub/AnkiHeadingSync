# Settings Theme Buttons Gap Report

## 审查范围

本次按真实仓库实现审查了以下位置：

1. [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)
2. [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts)
3. [scripts/stage-plugin-dist.mjs](scripts/stage-plugin-dist.mjs)
4. [scripts/sync-plugin-dist.mjs](scripts/sync-plugin-dist.mjs)
5. [manifest.json](manifest.json)
6. [package.json](package.json)
7. [node_modules/obsidian/obsidian.d.ts](node_modules/obsidian/obsidian.d.ts)

## 当前实现确认

### 1. 设置页根容器目前没有插件专用 class

`display()` 当前直接复用 `containerEl` 并写入 sticky header、cards container 与 card body，但没有任何类似 `anki-heading-sync-settings` 的作用域 class。

结果是：

1. 当前仓库还没有安全的设置页局部样式挂点
2. 如果直接写按钮或开关样式，只能继续依赖 inline style 或全局选择器

### 2. 目标操作按钮目前确实分成两种创建方式

真实代码里的设置页操作按钮有三处：

1. `renderCardTypesCard()` 里的原生 `loadButton`
2. `renderScopeCard()` 里的原生 `refreshButton`
3. `renderDeckCard()` 里 `Setting.addButton()` 创建的插入模板按钮

当前这三处都没有统一主题按钮 class。

### 3. 必须排除的按钮也确实存在独立创建点

当前不应被主题化的按钮有两个明确来源：

1. `initializeCards()` 里的卡片折叠标题按钮 `headerEl`
2. `renderFolderNode()` 里的文件夹展开/收起按钮 `toggleControl`

这两类按钮各自已经有独立 dataset 和 inline style，可直接排除，不需要模糊匹配。

### 4. 所有设置页开关都走 `Setting.addToggle()`

当前设置页里的主题化目标开关共有五处，全部由 `Setting.addToggle()` 创建：

1. `addObsidianBacklink`
2. `syncObsidianTagsToAnki`
3. `keepPureTagLinesInCardBody`
4. `convertHighlightsToCloze`
5. `fileDeckEnabled`

原生复选框不在本次范围内：

1. 卡片类型启用 checkbox
2. QA 警告接受 checkbox
3. 文件夹树 checkbox

### 5. 真实 Obsidian 类型声明已提供 `buttonEl` 与 `toggleEl`

本地安装的 [node_modules/obsidian/obsidian.d.ts](node_modules/obsidian/obsidian.d.ts) 已确认：

1. `ButtonComponent.buttonEl: HTMLButtonElement`
2. `ToggleComponent.toggleEl: HTMLElement`

因此不需要绕过 API，也不需要依赖私有字段。

### 6. 测试假组件目前还没有暴露 DOM 元素字段

当前 [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts) 里的 fake：

1. `HoistedFakeButtonComponent` 只有 `text` 和 `click()`，没有 `buttonEl`
2. `HoistedFakeToggleComponent` 只有 `value` 和 `triggerChange()`，没有 `toggleEl`
3. `HoistedFakeElement` 也还没有 `classList`

这意味着如果直接在生产代码里给 `buttonEl` / `toggleEl` 打 class，测试会先失败。

### 7. 根目录目前没有 `styles.css`

仓库根目录当前不存在 `styles.css`，说明设置页视觉增强还没有独立样式产物。

### 8. stage 脚本目前不会复制 `styles.css`

当前 [scripts/stage-plugin-dist.mjs](scripts/stage-plugin-dist.mjs) 只会处理：

1. `manifest.json`
2. `versions.json`
3. 自动生成 `dist/plugin/README.md`

不会检查或复制根目录 `styles.css` 到 `dist/plugin/styles.css`。

### 9. sync 脚本已经符合本次目标

当前 [scripts/sync-plugin-dist.mjs](scripts/sync-plugin-dist.mjs) 已经：

1. 复制 `main.js`
2. 复制 `manifest.json`
3. 如果 `dist/plugin/styles.css` 存在则复制它
4. 不删除目标目录文件
5. 不触碰 `data.json`

因此本轮不需要改 sync 逻辑。

## 建议的最小落点

1. 在 `PluginSettingTab.ts` 给设置页根容器增加专用 class
2. 为目标操作按钮与 `Setting.addToggle()` 开关增加显式 theme 标记 helper
3. 新增根目录 `styles.css`，只在设置页根容器下生效
4. 更新 `PluginSettingTab.test.ts` fake 组件，使测试可观察 `buttonEl`、`toggleEl`、class 与 data 属性
5. 更新 `stage-plugin-dist.mjs`，在根目录存在 `styles.css` 时复制到 `dist/plugin/styles.css`

## 与计划的显式偏差

没有产品级偏差。

仅有一个实现级确认：

1. 当前仓库的 `sync-plugin-dist.mjs` 已经只同步 `main.js`、`manifest.json` 和可选的 `styles.css`
2. 因此最终同步可以继续复用现有脚本，不需要额外改写同步逻辑