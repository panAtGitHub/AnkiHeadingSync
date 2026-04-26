# Plugin Run Scope UI Gap Report

## 审查范围

本次按真实仓库实现审查了以下位置：

1. [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)
2. [src/presentation/i18n/messages/zh.ts](src/presentation/i18n/messages/zh.ts)
3. [src/presentation/i18n/messages/en.ts](src/presentation/i18n/messages/en.ts)
4. [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts)
5. [src/presentation/settings/FolderScopeTree.test.ts](src/presentation/settings/FolderScopeTree.test.ts)
6. [scripts/sync-plugin-dist.mjs](scripts/sync-plugin-dist.mjs)
7. [scripts/obsidian-plugin-path.mjs](scripts/obsidian-plugin-path.mjs)

## 当前实现确认

### 1. 范围卡文案仍是旧版本

当前范围卡使用：

1. 卡片标题 `卡片同步范围`
2. 范围下拉名称 `运行范围`
3. 顶部说明 `保留现有作用范围和文件夹树逻辑；文件夹树按需加载，并支持局部刷新。`

与本轮目标的 `插件运行范围` 不一致。

### 2. 范围卡顶部说明目前仍会渲染

`renderScopeCard()` 当前第一行就是：

1. `containerEl.createEl("p", { text: t("settings.cards.scope.desc") })`

这会直接把旧说明文案渲染到页面上。

### 3. 当前文件夹树行结构还不是固定三列

`renderFolderNode()` 当前实现是：

1. 行容器只用 `paddingLeft = depth * 18px`
2. 行内依次直接放 toggle、checkbox、label
3. 没有固定宽度的展开槽
4. 没有稳定的三列 grid
5. label 也没有单行省略样式

结果是：

1. 无子节点时展开槽不具备明确占位样式
2. checkbox 对齐依赖默认 inline 布局
3. 长文件夹名可能撑乱排版

### 4. 当前没有“已选祖先自动展开”逻辑

当前展开状态只来自：

1. `expandedFolderPaths`
2. 用户点击 `folderToggle`

当前没有：

1. 初次加载树后自动展开已选项祖先
2. 切换到 include / exclude 后补充展开已选祖先
3. refresh 后重新展开已选祖先

因此如果 `includeFolders = ["notes/sub"]`，打开范围卡后 `notes` 不会自动展开。

### 5. 现有局部刷新行为已经满足复用条件

真实代码已经具备以下可复用行为：

1. `refreshFolderTree()` 只重渲染 scope card
2. `updateScopeMode()` 只重渲染 scope card
3. `updateFolderSelection()` 只重渲染 scope card
4. `FolderScopeTree.test.ts` 已经覆盖选择压缩算法

这意味着本次只需要改 UI 结构与补充展开策略，不需要动选择压缩逻辑。

### 6. build/sync 脚本当前已满足目标目录安全要求

当前 [scripts/sync-plugin-dist.mjs](scripts/sync-plugin-dist.mjs) 只会复制：

1. `dist/plugin/main.js`
2. `dist/plugin/manifest.json`
3. `dist/plugin/styles.css`（如果存在）

不会删除目标目录文件，也不会触碰 `data.json`。

## 建议的最小落点

1. 只改 `PluginSettingTab.ts` 的范围卡渲染与树行样式
2. 更新 `settings.cards.scope.title` 与 `settings.scope.name`
3. 删除范围卡顶部说明的渲染，但不改业务逻辑
4. 给树行改为固定三列 grid，并保留现有 dataset
5. 增加“按需补充展开已选祖先”的一次性标志位
6. 在 `PluginSettingTab.test.ts` 补标题、旧说明消失、树行对齐、已选祖先展开测试

## 与计划的显式偏差

没有产品级偏差。

唯一需要记录的是实现层面的仓库现实：

1. 当前 sync 脚本已经是安全复制 built plugin 文件的版本
2. 因此本轮不需要再改 build/sync 脚本，只需要继续按它的产物约束验证和同步