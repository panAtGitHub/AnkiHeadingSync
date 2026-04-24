# 设置页卡片化差距审计

本文以本轮“设置页卡片化 + 局部刷新 + 设置驱动卡片识别配置”任务合同为唯一验收基准，对当前仓库做真实实现审计。

## 1. 当前设置页仍是单入口整页重建

- 设置页入口位于 `src/presentation/settings/PluginSettingTab.ts`。
- `display()` 里直接执行 `containerEl.empty()`，随后把所有设置项重新创建。
- 多个普通交互会再次调用 `this.display()`，包括：
  - 语义 QA 标记变更
  - note type 切换
  - Anki 字段加载
  - 字段映射保存
  - 文件级 deck 开关
  - 范围模式切换
  - 文件夹树勾选
  - 文件夹树展开/收起
- 这与“稳定卡片外壳 + 卡片内部局部刷新”的任务目标直接冲突，也是当前页面跳动和滚动漂移的根因。

## 2. 现有 UI 结构与目标 5 卡片结构不一致

- 当前设置页是按顺序平铺的 imperative render，没有稳定分区壳层。
- 不存在折叠卡片，也没有设置页实例级展开状态。
- deck、scope、mapping、semantic preview 等内容都混在一个 `display()` 流程里。
- 不满足“5 张可折叠卡片、默认展开 1/5、默认折叠 2/3/4”的要求。

## 3. 第一张卡片的数据模型还没有成为识别真源

- 当前设置模型只保留旧的离散字段：
  - `qaHeadingLevel`
  - `clozeHeadingLevel`
  - `qaGroupMarker`
  - `semanticQaMarker`
  - `qaNoteType`
  - `clozeNoteType`
  - `semanticQaNoteType`
  - `noteFieldMappings`
- 运行时识别入口仍是 `src/domain/manual-sync/services/CardIndexingService.ts`：
  - 先按 `qaHeadingLevel/clozeHeadingLevel` 把标题判成 `basic/cloze`
  - 再仅在 `basic` 分支内部，用 `qaGroupMarker/semanticQaMarker` 特判 QA Group 与 Semantic QA
- 当前不存在统一的“4 行配置 -> 识别匹配规则 -> 运行时类型”的结构。
- 因此即便只改 UI，也无法让表格真正驱动同步识别。

## 4. 当前识别规则不足以支持新任务合同

- `CardIndexingService` 只支持：
  - 一个 QA/basic 标题级别
  - 一个 cloze 标题级别
  - basic 上的两个 marker 分流
- 当前不支持：
  - `enabled` 控制识别开关
  - 同一标题级别下多行配置的优先级匹配
  - 同级默认行（空 extra marker）回退
  - 保存时检测“同级多个启用默认行”并阻止保存
- 现有 `validatePluginSettings()` 还显式禁止 `qaHeadingLevel === clozeHeadingLevel`，这与新合同允许同级依赖 extra marker 分流的方向冲突。

## 5. 现有字段映射能力可复用，但需要换接入方式

- `noteFieldMappings`、`NoteFieldMappingService`、Anki note model 读取接口、字段详情读取接口都已存在，可复用。
- 但当前 UI 采用“每个 section 单独选择 note type、单独读取字段、再单独点保存映射”的流程。
- 这与新的直接编辑表格、自动保存、按需 debounce 保存不一致。
- QA Group 12 已经有独立的托管模型链路：
  - `QaGroupModelDefinition`
  - `QaGroupSyncService`
- 这说明 QA Group 行不应该被硬塞进普通 `noteFieldMappings` 保存流程；该行应显示为托管模型/托管字段。

## 6. 第二、三、四张卡片已有局部能力基础，但刷新策略不对

- “同步内容”相关设置已经存在，但散落在整页 render 中。
- 范围设置已经具备：
  - `scopeMode`
  - 文件夹树纯函数
  - lazy load
  - 缓存字段 `folderTree` / `hasLoadedFolderTree` / `folderTreeLoadPromise`
- deck 设置已经具备完整字段和按钮能力。
- 但 scope、deck 的普通交互仍回到整页 `display()`，所以已有能力还没有被组织成局部刷新架构。

## 7. 文件夹树缓存已存在，但缺少局部刷新按钮

- 当前文件夹树只在 `scopeMode !== all` 时触发加载。
- 已有缓存字段能支撑“按展开时加载”和“重复打开不重复遍历”。
- 但没有局部“刷新文件夹列表”入口。
- 加载完成后仍调用整页 `display()`，不满足“只刷新 card 3 / tree region”的目标。

## 8. Anki 模板加载路径存在，但还是 section 级旧交互

- 当前已有：
  - `listNoteModels()`
  - `getNoteModelDetails(modelName)`
- 但交互仍是：先刷新 note types，再按 section 读取字段。
- 新合同要求 card 1 提供一个统一按钮，一次刷新模板列表，并补齐当前表格已选模板的字段选项。
- 当前状态字段 `availableNoteModels`、`loadedModelDetails`、`draftMappings` 可部分复用，但需要调整成表格行驱动。

## 9. 迁移链路尚未实现

- `mergePluginSettings()` 目前只做默认值合并，不会从旧字段构建新识别配置。
- `normalizePluginSettings()` 当前只处理 backlink label 标准化。
- `DataJsonPluginConfigRepository.load()` / `save()` 会依赖 `mergePluginSettings()` 与 `validatePluginSettings()`，所以迁移和兼容必须落在设置模型层，而不是仅在 UI 层补丁。

## 10. 现有测试缺口

- 设置页测试目前主要覆盖：
  - note type / field mapping
  - scope tree 交互
  - deck 开关
- 还没有覆盖：
  - 5 卡片结构
  - 默认展开状态
  - 表格直编 + debounce 自动保存
  - 普通交互不触发整页重建
  - 新识别规则与冲突阻止保存
  - 旧设置迁移到新识别结构后行为保持不变

## 11. 可复用与必须替换

可复用：

- `noteFieldMappings` 与 `NoteFieldMappingService`
- `listNoteModels()` / `getNoteModelDetails()`
- QA Group 托管模型链路
- scope tree 纯函数与缓存字段
- deck 设置字段与插入模板能力
- `PluginSettingTab` 现有各段业务渲染逻辑中的具体设置项语义

必须替换或重组：

- `PluginSettingTab.display()` 的整页重建模式
- 运行时基于旧离散字段的识别分派方式
- 设置模型里缺失的新识别配置与迁移逻辑
- 设置页测试夹具中无法表达“局部清空/局部重绘”的部分

## 12. 结论

当前仓库具备完成本任务的大部分业务能力，但缺少三个关键骨架：

1. 稳定卡片壳层与局部 render 机制
2. 新的卡片识别配置模型及其向旧字段的兼容迁移
3. 让运行时识别直接消费新配置的匹配逻辑

因此本轮实现应聚焦于：

- 先在设置模型层建立新配置与迁移
- 再改运行时识别入口
- 最后将设置页重组为 5 张稳定卡片并接入局部刷新