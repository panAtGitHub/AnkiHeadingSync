# 文件夹级牌组模式覆盖 gap report

## 当前运行范围文件树结构

- 运行范围卡片由 `src/presentation/settings/PluginSettingTab.ts` 的 `renderScopeCard()` 渲染。
- scope 模式切换保存在 `PluginSettings.scopeMode`，文件夹选择保存在 `includeFolders` / `excludeFolders`。
- 文件树数据来自插件接口 `listFolderTree()`，在设置页内通过 `ensureFolderTreeLoaded()` 懒加载。
- 文件树选择状态由 `src/presentation/settings/FolderScopeTree.ts` 的 `buildFolderTreeSelection()` 与 `toggleFolderTreeSelection()` 计算。
- 单行 UI 由 `renderFolderNode()` 负责，现有 dataset 包括：`folderRow`、`folderToggle`、`folderPath`、`folderPathLabel`、`folderChildren`。
- 现有文件夹行是三列 grid：展开按钮、运行范围 checkbox、文件夹标签。

## 当前文件夹牌组映射流程

- 全局设置字段是 `PluginSettings.folderDeckMode`，取值 `off | folder | folder-and-file`。
- 普通卡片路径在 `src/application/services/RenderConfigService.ts` 中通过 `DeckResolutionService.resolve(card, defaultDeck, folderDeckMode)` 决定最终 deck。
- QA Group 路径在 `src/application/services/QaGroupSyncService.ts` 中也直接调用同一个 `DeckResolutionService.resolve(...)`。
- `src/domain/manual-sync/services/DeckResolutionService.ts` 当前优先顺序是：
  1. `card.deckHint`
  2. `FolderDeckMappingService.mapFilePathToDeck(filePath, folderDeckMode)`
  3. `defaultDeck`
- `src/domain/manual-sync/services/FolderDeckMappingService.ts` 只按 `filePath` 和 `mode` 计算 deck，不知道运行范围或文件夹覆盖。

## 当前牌组优先级实现

- 文件级显式 deck hint 仍然是最高优先级，这一层已经在 `DeckResolutionService.resolve()` 最前面短路返回。
- 文件夹映射层完全依赖 `FolderDeckMappingService`。
- 只有当前两层都没有产出 deck 时才回退到默认牌组并附加 `deck_fallback_default` warning。

## 覆盖设置应存放的位置

- 新字段应加入 `src/application/config/PluginSettings.ts` 的 `PluginSettings` 接口与 `DEFAULT_SETTINGS`。
- 加载/保存路径通过 `mergePluginSettings()` 与 `normalizePluginSettings()` 进入 `DataJsonPluginConfigRepository`。
- 现有 include/exclude 文件夹列表只做“数组 + 字符串”校验，没有统一去重或路径规范化 helper；新字段应沿用同样约定，避免引入与仓库现状不一致的新归一化语义。

## UI 应插入的位置

- 只应插入到 `renderFolderNode()` 的 include 模式行内。
- 行内现有顺序是 toggle、scope checkbox、label；新增控件应追加在 label 后侧，并保持现有 dataset 不变。
- 仅当 `scopeMode === "include"`、当前行已选中、且全局 `folderDeckMode !== "off"` 时显示。
- 取消 include 勾选的清理逻辑不应放在 UI 层分散处理，而应合并进 `updateFolderSelection()`，这样任何同一路径的取消动作都能统一清理子树覆盖记录。

## 指纹更新位置

- deck 规则指纹在 `src/application/services/FileIndexerService.ts` 的 `createDeckRulesFingerprint()` 中生成。
- `indexVault()` 通过比较 `existingFileState.deckRulesFingerprint !== deckRulesFingerprint` 强制重读；因此覆盖规则必须进入该指纹。
- 当前版本号为 `deck-rules-v4`，实现覆盖后需要升级版本。

## 预计修改的测试文件

- `src/application/config/PluginSettings.test.ts`
- `src/infrastructure/persistence/DataJsonPluginConfigRepository.test.ts`
- `src/presentation/settings/PluginSettingTab.test.ts`
- `src/domain/manual-sync/services/FolderDeckMappingService.test.ts`
- `src/domain/manual-sync/services/DeckResolutionService.test.ts`
- `src/application/services/FileIndexerService.test.ts`
- 可能还要更新 `src/test-support/manualSyncFakes.ts` 的默认设置工厂，以便新字段默认值在各类测试夹具中可用。

## 风险点

- `toggleFolderTreeSelection()` 会压缩选择结果；覆盖清理必须基于“被取消的目标路径及其后代”，不能误删其他分支。
- 父文件夹覆盖应对子孙路径生效，但不能把 `notes` 误匹配到 `notes2`；应复用仓库里现有的 `path === folder || path.startsWith(folder + "/")` 规则。
- `DeckResolutionService.resolve()` 当前签名被多处调用，若扩展参数需要同步更新 `RenderConfigService`、`QaGroupSyncService` 和直接单测。
- 作用范围树的测试大量依赖现有 dataset；新增控件不能破坏 `folderRow`、`folderToggle`、`folderPath`、`folderPathLabel` 的查找方式。
- 设置页行布局当前是固定 grid，新增圆形 checkbox 后需要补 CSS，避免标签挤压或破坏缩进对齐。
- 当全局 `folderDeckMode` 为 `off` 时必须忽略覆盖列表，但不能清空已保存数据。