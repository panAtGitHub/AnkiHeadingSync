# Cleanup / Reset Gap Report

## 审查范围

本报告只覆盖本任务要求的两个显式管理命令：

1. 清理空牌组
2. 清空当前文件已同步卡片

审查对象：

1. `AnkiGateway` / `AnkiConnectGateway`
2. marker 写回与 Markdown 文件改写链路
3. `pluginState` 读取、删除与持久化
4. 当前文件命令入口与命令注册
5. `NoticeService`
6. 当前 UI 是否已有确认/多选路径
7. 回归风险：是否会误泄漏到普通 sync/rebuild 主链路

## 当前缺口

### 1. 网关层没有任何删除型能力

当前 `AnkiGateway` 只覆盖：

1. note add/update
2. deck ensure/change
3. model 查询
4. media 上传

缺口：

1. 不能删除 note
2. 不能列出 deck
3. 不能查询 deck 是否为空
4. 不能删除 deck

这意味着两个管理命令都无法从基础设施层闭环。

### 2. Markdown 写回只有“插入/替换 marker”，没有“删除 marker”路径

当前 `MarkdownWriteBackService` 只为同步主链路服务：

1. 批量插入 marker
2. 替换 card-only / stale marker
3. 失败时生成 pending write-back

缺口：

1. 没有独立的 marker removal service
2. 删除型命令如果复用现有写回逻辑，会把“同步写 marker”和“管理命令删 marker”混成同一套 pending 语义

### 3. 没有“当前文件重置已同步卡片”的独立 use case

当前只有：

1. `ManualSyncCurrentFileUseCase`
2. `ManualSyncVaultUseCase`
3. `RebuildCardIndexUseCase`

缺口：

1. 没有只按当前文件删 note / 删 marker / 删本地 state 的独立编排
2. 现有 `ManualSyncService` 主链路不应承担删除行为

### 4. Presentation 层没有任何用户确认或多选交互

当前插件入口只注册三个命令：

1. 同步当前文件
2. 同步全库
3. 重建卡片索引

缺口：

1. 没有“当前文件 reset”命令入口
2. 没有“空牌组清理”命令入口
3. 没有 deck 候选列表确认/多选 modal

### 5. Notice 层只会展示普通同步和 rebuild 摘要

当前 `NoticeService` 不支持：

1. 当前文件清空结果摘要
2. 空 deck 清理结果摘要
3. 空结果/手动取消/跳过删除的管理命令提示

### 6. 当前状态模型对“删 note 后 marker 删除失败”的恢复不够安全

现有索引链路会在 marker 仍保留 `noteId` 时继续把该 noteId 当作候选同步身份。

风险：

1. 如果 reset 命令已经删掉 Anki note
2. 但 marker 写回失败，文件里仍保留旧 `noteId`
3. 又把本地 card state 全删掉

那么下次普通同步可能把这个已删除 note 当成可 update 对象，产生错误。

这部分需要一个最小兼容修正，确保失败文件不会伪装成“还在同步中”。

## 范围控制结论

本任务必须新增两条显式管理命令，但不能改动以下默认语义：

1. `sync current file` 不自动删 note
2. `sync vault` 不自动删 note
3. `rebuild index` 不做 note 删除
4. orphan 仍只标记，不自动删除
5. 空 deck 清理只能显式触发，且必须先列候选再手选删除

## 需要补齐的实现块

1. `AnkiGateway` 删除/查询/删除 deck 接口
2. `AnkiConnectGateway` 对应 action 封装
3. 独立 marker removal service
4. `ClearCurrentFileSyncedCardsUseCase`
5. `CleanupEmptyDecksUseCase`
6. Presentation modal / 选择流程
7. 新结果类型与 `NoticeService` 摘要
8. 回归测试与最终验证