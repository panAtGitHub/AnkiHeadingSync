# 模块 3 实现决策

本文锁定模块 3 的具体实现决策，范围以 `docs/2026-04-18PLAN4.md` 为准。

## 1. 主链路替换策略

- 模块 3 采用新的索引/状态/规划/执行主链路。
- 现有模块 1/2 代码保留在仓库中，但插件命令入口改接模块 3 use case。
- 不为旧 `legacy cardKey` / `embeddedNoteId` 做兼容适配。

## 2. marker 与身份

- 统一 marker 格式：`<!-- AHS:card=<cardId> note=<noteId> -->`
- 允许仅写 `cardId`：`<!-- AHS:card=<cardId> -->`
- `cardId` 采用 `ahs_` 前缀加随机唯一片段生成
- 缺失 marker 的块在用户执行命令时生成 `cardId`，平时不自动回写

## 3. 文件级跳过实现

- 为满足“先过滤路径，再读文件内容”，新增文件元数据扫描接口
- 文件状态除计划要求的 `fileHash` 外，额外保存内部 `fileStamp`
- `fileStamp` 采用 `mtime:size`，只用于决定是否需要重新读取文件
- `fileHash` 在真正读取文件内容后计算并持久化

## 4. pending write-back 恢复策略

- 模块 3 的正式身份只认 marker 中的 `cardId`
- 若 marker 丢失，即视为新卡片块，重新生成新的 `cardId`
- pending write-back 仅在 marker 仍保留 `cardId` 时恢复对应 `noteId`
- 不按 `rawBlockHash` 对无 marker 块做长期身份复绑

## 5. 渲染策略

- 扫描阶段只建立 `IndexedFile/IndexedCard`
- 仅 `toCreate / toUpdate` 进入 renderer
- `renderConfigHash` 独立计算，不与 `rawBlockHash` 混用
- 现有 markdown 渲染逻辑保留并抽到新的模块 3 渲染服务里复用

## 6. Anki 批处理策略

- 新增 `BatchScheduler`
- `notesInfo / addNotes / updateNoteFields / changeDeck / storeMedia` 按批执行
- 默认使用保守常量：
  - `notesInfo` batch size 100
  - `addNotes / updateNoteFields` batch size 50
  - `storeMedia` batch size 10，并发 3
- 不为当前模块额外开放用户设置项，先保持范围收敛

## 7. 本地状态结构

- 新状态统一存入 `pluginState`
- 结构包含：
  - `files`
  - `cards`
  - `pendingWriteBack`
- 当前实现不做旧 `syncRegistry` 自动迁移；旧数据保留但模块 3 不读取

## 8. rebuild index

- rebuild index 不调用 Anki 字段更新
- 它会：
  - 全量重建文件状态与卡片状态
  - 为缺失 `cardId` 的块补齐 marker
  - 仅对仍保留 `cardId` 的块恢复本地已知 `noteId`

## 9. 命令与提示

- 命令名称按计划使用中文：
  - `同步当前文件到 Anki`
  - `同步全库到 Anki`
  - `重建卡片索引`
- Notice 展示：扫描文件数、扫描卡片数、新增、更新、orphan、media、跳过未变化卡数
- 若有 markdown 回写冲突，明确列出失败文件

## 10. 范围控制

- 不实现旧插件迁移
- 不实现双向同步
- 不实现实时监听自动同步
- 不为 tags 引入额外语法；当前阶段 `tagsHint` 为空数组，但批处理执行层保留接口位置