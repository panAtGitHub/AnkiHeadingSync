# QA Group 12 Implementation Plan

## Status

本文件用于把本轮需求参考方案落盘到仓库中。它是强参考，不是自动生效的最终实现真相。

最终实现仍需以真实代码审查结果为准，并以：

- `docs/qa-group-12-gap-report.md`
- `docs/qa-group-12-decisions.md`

作为仓库内的实际实施依据。

## Feature Intent

新增一条并行的 `#anki-list` QA Group 12 路线，同时保留现有：

- atomic / basic
- cloze
- semantic-qa / `#anki-list-qa`

不动。

目标行为：

1. 一个命中的 Markdown heading block 同步为一条 Anki note。
2. 该 note 固定使用 `ObsiAnki QA Group 12`。
3. Markdown 只写回一条组级 `GI` marker。
4. `GroupId` 是 GI 丢失恢复的主锚点。
5. v1 固定 12 个 slot，不做动态 arity model。

## Reference Summary

### Marker and routing

- 新增 `qaGroupMarker`
- 默认 `#anki-list`
- 必须是 hashtag token
- 不允许与 `semanticQaMarker` 相同
- 路由优先级：
  - 命中新 `qaGroupMarker` -> group route
  - 命中旧 `semanticQaMarker` -> semantic-qa route
  - 其他 QA 标题 -> 普通 basic route

### Parallel internal model

参考方案要求新路线使用并行数据模型，不强行塞进现有单卡结构。核心概念包括：

- `GroupMarker`
- `GroupItem`
- `IndexedGroupCardBlock`
- `GroupSyncPayload`
- `RecoveredGroupState`

### Parsing protocol

触发条件：

- 标题级别等于当前 QA heading level
- 标题命中 `qaGroupMarker`
- 标题下存在一级列表
- 一级项必须至少有一条二级项才算有效
- 块尾允许存在一条 `GI`

v1 取值规则：

- `Stem` = 标题去 marker
- `Q` = 一级列表项文本
- `A` = 第一条二级列表项文本

GI 目标格式：

```md
<!--GI:n=999;i=a1:1,b2:2,c3:3;f=-->
```

语义：

- `n` = noteId
- `i` = itemId -> slot
- `f` = free slots

### Slot and recovery semantics

- 首次创建按顺序分配 `1..N`
- 删除中间项保留空洞
- 新增项优先复用最小 free slot
- 重排不改变 slot
- 超过 12 项阻止同步
- GI 丢失恢复以 `GroupId` 为主锚点，`Src` 为辅锚点

### Anki model management

参考方案要求补齐 group model 管理能力：

- ensure model exists
- inspect fields/templates
- create model if missing
- add missing fields/templates
- reconcile template/CSS drift
- query notes for recovery

固定目标 model：

- `ObsiAnki QA Group 12`

### Write-back and state

- group block 只保留一条 `GI`
- 命中 group route 的块写回时清理内部旧 `<!--ID: ...-->`
- state 需要新增以 `GroupId` 为主键的 group state

### Required validation surface

最少覆盖：

- GI 解析与序列化
- slot 分配与稳定性
- GI 写回与旧 inner marker 清理
- GroupId 恢复
- model 自动创建/补齐/漂移修复
- 端到端 sibling cards 生成
- 原有 basic/cloze/semantic-qa 不回归

## Implementation Note

本文件只保留参考方案的需求意图和约束摘要，避免后续实现过程中偏离用户 feature contract。