# Deck Resolution Decisions

## 1. 实现入口

本轮继续以 manual-sync 主链路为实现入口：

1. `CardIndexingService` 负责文件级显式 deck 提取
2. `RenderConfigService` 通过新的 deck resolution 服务解析最终 deck
3. `DiffPlannerService` 聚合结构化 warnings，并保持 update 判定不受 deck 变化影响
4. `AnkiBatchExecutor` 只在 add 路径使用 resolved deck，update 路径不做 changeDeck
5. `ManualSyncService` 将 warnings 放入最终 `ManualSyncResult`

## 2. 数据语义

1. manual-sync 里的 `deckHint` 继续表示“文件级显式 deck hint”，不混入 folder / default 结果
2. 最终用于同步的 deck 只存在于 `RenderPlan.deck` / `PlannedCard.deck` / `RenderedSyncCard.deck`
3. 文件级 deck warnings 暂挂在 indexed card / state 上，最终在计划阶段去重汇总

## 3. 服务拆分

新增 4 个 deck 相关服务：

1. `DeckNormalizationService`
2. `DeckExtractionService`
3. `FolderDeckMappingService`
4. `DeckResolutionService`

其中：

1. `DeckExtractionService` 负责 YAML / 正文显式 deck 的提取与冲突 warning
2. `DeckResolutionService` 负责优先级决策：显式 deck > folder deck > default deck

## 4. 同步语义

1. 新卡 add 必须使用 resolved deck
2. 旧卡 update 只更新字段，不 changeDeck
3. `renderConfigHash` 改为不包含 deck
4. 为避免旧状态产生无意义 update，保留一个仅用于兼容比较的 legacy hash 分支

## 5. 校验与错误

1. deck normalization 输出空字符串时直接报错
2. folder mapping 命中包含 `::` 的文件夹名时按计划走硬失败，不静默回退
3. YAML / 正文冲突不阻断同步，按 YAML 为准并产生 warning
4. 多个正文声明不阻断同步，只取第一个并产生 warning

## 6. 结果透传

`ManualSyncResult` 新增结构化 `warnings`，用于：

1. deck 冲突
2. multiple body declarations
3. fallback 到 default deck

UI 层可以再把这些 warning 转成 notice，但 notice 不是唯一载体。

## 7. UI 最小改动

设置页只做最小文案修正：

1. 默认 deck 说明补充优先级语义
2. 不新增复杂配置项