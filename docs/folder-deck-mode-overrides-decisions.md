# 文件夹级牌组模式覆盖决策

## 设置结构

- 新增 `PluginSettings.alternateFolderDeckModeFolders: string[]`。
- 默认值为 `[]`。
- 缺失字段按旧数据迁移到 `[]`。
- 校验规则与 `includeFolders` / `excludeFolders` 保持一致：必须是数组，且成员必须是字符串。
- 不额外引入全局路径规范化或去重 helper；保持与现有配置层行为一致。

## UI 放置位置

- 在 `PluginSettingTab.renderFolderNode()` 内，仅对 include 模式且当前行已选中的文件夹渲染覆盖控件。
- 新控件追加在文件夹标签后，不替换现有运行范围 checkbox。
- 保留现有 dataset：`folderRow`、`folderToggle`、`folderPath`、`folderPathLabel`。
- 新增 dataset 供测试使用：
  - `folderDeckModeOverride`
  - `folderDeckModeOverrideHint`

## 圆形 checkbox 行为

- 控件只读写 `alternateFolderDeckModeFolders`。
- 不改动 include 勾选状态。
- 点击时阻止冒泡，避免触发展开按钮或运行范围 checkbox 的副作用。
- 使用原生 checkbox，CSS 改成圆形外观并保留 `aria-label` / `title`。

## 提示文案

- 全局 `folder-and-file` 时，启用提示显示：`本文件夹单独采用「文件夹」作为牌组名`。
- 全局 `folder` 时，启用提示显示：`本文件夹单独采用「文件夹及文件名」作为牌组名`。
- 全局 `off` 时不显示控件和提示，但保留已保存的覆盖列表。

## 路径匹配规则

- 覆盖匹配使用规范：`filePath === folderPath || filePath.startsWith(folderPath + "/")`。
- 父文件夹覆盖对子孙路径全部生效。
- 不支持“子文件夹反向恢复全局模式”的三态语义，本次仍是二元开关。

## 覆盖模式解析

- 全局 `folder-and-file` 时，命中覆盖文件夹改用 `folder`。
- 全局 `folder` 时，命中覆盖文件夹改用 `folder-and-file`。
- 全局 `off` 时，忽略覆盖列表。

## include 取消勾选清理

- 当 include 模式取消勾选某个文件夹时，清理该路径及所有后代路径在 `alternateFolderDeckModeFolders` 中的记录。
- 该清理仅影响覆盖列表，不影响其他 include 选择。
- exclude/all 模式下不显示控件，也不触发这套清理逻辑。

## 牌组解析接入点

- 在 `FolderDeckMappingService` 中增加“基于覆盖列表求实际 mode”的能力。
- `DeckResolutionService.resolve()` 接收完整 `PluginSettings`，从而统一处理默认 deck、全局 mode 与覆盖列表。
- 普通卡片通过 `RenderConfigService` 传入完整 settings。
- QA Group 继续复用同一个 `DeckResolutionService`，保持优先级一致。

## 指纹变更

- `createDeckRulesFingerprint()` 纳入 `alternateFolderDeckModeFolders`。
- 指纹版本升级到下一版。
- 为减少纯顺序变动引起的无意义重算，指纹内部对覆盖文件夹列表做排序后再哈希；这只影响 fingerprint，不改变实际设置保存顺序。

## 与原计划的偏差

- 偏差 1：配置层不新增全局路径规范化/去重。原因：现有 `includeFolders` / `excludeFolders` 没有这样做，新字段若单独增强会造成配置行为不一致。
- 偏差 2：DeckResolution 直接改为接收完整 `settings`。原因：当前普通卡片和 QA Group 都通过该服务决策 deck，把覆盖规则聚合在这里最小且一致，避免在多个调用点重复计算“反向 mode”。