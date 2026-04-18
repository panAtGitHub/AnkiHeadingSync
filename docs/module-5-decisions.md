# Module 5 Decisions

## 1. 配置模型

新增并持久化以下字段：

1. `fileDeckEnabled`
2. `fileDeckMarker`
3. `fileDeckTemplate`
4. `fileDeckInsertLocation`
5. `folderDeckMode`

默认值严格按计划：

1. `fileDeckEnabled = false`
2. `fileDeckMarker = "TARGET DECK"`
3. `fileDeckTemplate = "obsidian::filename"`
4. `fileDeckInsertLocation = "body"`
5. `folderDeckMode = "off"`

## 2. 文件级 deck 解析

`DeckExtractionService` 改为接收 `fileDeckMarker` 参数，而不是写死：

1. YAML key 使用同一个 marker
2. 正文单行 / 双行语法也使用同一个 marker
3. 当 `fileDeckEnabled = false` 时，索引阶段完全跳过显式 deck 提取

## 3. 文件夹映射

`FolderDeckMappingService` 改为显式接收 `folderDeckMode`：

1. `off` 不参与映射
2. `folder` 使用父文件夹
3. `folder-and-file` 使用父文件夹 + 当前文件名

非法路径片段包含 `::` 时：

1. 不抛错中断
2. 产出 `deck_invalid_folder_segment` warning
3. 丢弃映射结果
4. 继续回退到 `defaultDeck`

## 4. 模板插入能力

新增单独的 deck 模板插入服务：

1. 负责 `filename` 变量展开
2. 负责 YAML / 正文两种插入模式
3. 负责在已有 YAML key 或正文 deck 声明存在时进行就地替换，避免重复声明

该能力通过设置页按钮触发，目标固定为当前活动 Markdown 文件。

## 5. manual-sync 接入

继续沿用当前 manual-sync 主链路：

1. `CardIndexingService` 只提取“文件级显式 deck 线索”
2. `RenderConfigService` 调用 `DeckResolutionService` 解析最终 deck
3. `DiffPlannerService` 保持当前旧卡行为，不额外改写 update / changeDeck 语义
4. `AnkiBatchExecutor` 继续让 `toCreate` 使用 `resolvedDeck`

## 6. warnings

继续使用结构化 warning 结果对象，不把 notice 当作唯一载体。

模块 5 需要继续保证：

1. `deck_conflict_yaml_body`
2. `deck_multiple_body_declarations`
3. `deck_invalid_folder_segment`
4. `deck_fallback_default`

## 7. UI 选择

为保持改动聚焦，本轮设置页的“单选”使用 dropdown 实现，而不是新增自定义 radio 组件。
语义仍然是互斥单选，不扩展复杂交互。