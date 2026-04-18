# 模块 3 实现差距报告

本文以 `docs/2026-04-18PLAN4.md` 为唯一实现基准，对当前仓库实现做差距审计。

## 结论

当前仓库主体仍停留在模块 1/2 的架构：

- 身份模型仍以 `cardKey` 和 `embeddedNoteId` 为核心，而不是 `cardId + noteId`
- 扫描阶段会对全部卡片立即 render，而不是先索引、后规划、再延迟渲染
- 本地状态仍是 `syncRegistry` 单层结构，缺失文件层状态和独立 pending write-back 层
- Anki 执行除了 `notesInfo` 外基本仍是逐卡顺序调用
- 命令层缺少 `重建卡片索引`

模块 3 不能在当前 `legacy-card-key` 体系上继续增量补丁，必须引入新的索引、状态、规划和执行主链路。

## 主要差距

### 1. 身份与 marker

当前实现：

- `CardIdentityPolicy` 生成 `cardKey`
- `HeadingSyncMarkerService` 只写 `<!-- AHS:<noteId> -->`
- `CardExtractionService` 只解析旧 marker 里的 `noteId`

与计划冲突：

- 缺失永久 `cardId`
- marker 格式错误，未写入 `cardId`
- 仍保留 `embeddedNoteId` / `identityMode` 这类模块 2 兼容逻辑

### 2. 文件发现与索引

当前实现：

- `ScanAndPlanSyncUseCase` 先取所有 markdown 内容，再过滤，再提取，再 render

与计划冲突：

- 没有路径先过滤再读文件的流程
- 没有文件级跳过
- 没有文件层 `fileHash/lastIndexedAt/cardIds[]`
- 没有卡片级 `rawBlockHash`

### 3. 本地状态

当前实现：

- 仅有 `SyncRegistry`
- 仓库存储只有 `syncRegistry.records`

与计划冲突：

- 缺失 `files`
- 缺失新的 `cards`
- 缺失独立 `pendingWriteBack`
- 缺失 `renderConfigHash`

### 4. Planner

当前实现：

- `SyncPlanningService` 只产出 `toAdd / toUpdate / toMarkOrphan`

与计划冲突：

- 缺失 `toRewriteMarker`
- `toUpdate` 依据的是旧 `contentHash`，不是 `rawBlockHash + renderConfigHash`
- 仍包含 `embeddedNoteId` 的特殊逻辑

### 5. Renderer

当前实现：

- 所有卡片都在扫描阶段立即 render

与计划冲突：

- 未实现“只 render `toCreate / toUpdate`”
- 缺失 `renderConfigHash`
- 渲染输出与原始块变化耦合在一个 `contentHash` 中

### 6. Anki 执行层

当前实现：

- `notesInfo` 已批量化
- `addNote / updateNote / storeMedia` 仍主要是逐卡/逐资源调用

与计划冲突：

- 缺少批处理调度器
- 缺少按操作类型分批执行
- 缺少 deck 分组 `changeDeck`
- 缺少明确的媒体并发控制

### 7. Markdown 回写

当前实现：

- 已有“同文件一次写回、自底向上写回”的局部能力

与计划冲突：

- marker 仍是旧格式
- pending write-back 仍挂在旧 `identityMode`
- 结果汇总里缺少回写冲突文件明细

### 8. 命令与 UX

当前实现：

- 只有“同步当前文件”和“同步全库”命令
- Notice 仅展示少量计数

与计划冲突：

- 缺少“重建卡片索引”
- 结果 notice 缺少扫描文件数、扫描卡片数、跳过数、回写冲突文件明细

### 9. 测试

当前实现：

- 模块 1/2 的 extraction/planning/write-back 测试较多

与计划冲突：

- 缺少 `cardId` 生成与 marker 新格式测试
- 缺少文件级跳过测试
- 缺少 `renderConfigHash` 驱动 update 测试
- 缺少 rebuild index 测试
- 缺少批处理调度与结果汇总测试

## 修复方向

模块 3 将按以下方向落地：

1. 新建 `cardId + noteId` 为核心的 marker / index / state / planner / executor 主链路
2. 保留现有 markdown 渲染逻辑中可复用的部分，但改为延迟渲染
3. 新增文件层状态与 pending write-back 层
4. 新增 rebuild index 命令与 use case
5. 用新的同步 use case 接管插件命令入口