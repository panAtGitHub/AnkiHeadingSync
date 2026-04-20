# QA Group 12 Decisions

## Decision Summary

基于真实仓库结构，本轮锁定如下实现决策：

1. 保留现有 atomic/basic、cloze、semantic-qa 路线不变。
2. 新增一条并行的 QA Group 路线，使用单独 marker：`qaGroupMarker`。
3. 新路线不强塞进 `IndexedCard` / `DiffPlannerService` / `AnkiBatchExecutor` 的单卡单 note 主链。
4. group route 使用专用 block model、state、write-back 和 sync executor。
5. `GroupId` 是 GI 丢失恢复的主锚点；`Src` 只做辅锚点。
6. v1 固定目标 model：`ObsiAnki QA Group 12`。
7. v1 不做 group model 的 settings field mapping UI。
8. v1 的 `A` 只取第一条二级列表项文本。

## Concrete Decisions

### 1. New setting name and validation

新增设置：

- `qaGroupMarker`

默认值：

- `#anki-list`

校验规则：

- 必须符合与 semantic marker 同级的 hashtag token 规则
- 不允许等于 `semanticQaMarker`

实现上复用现有 hashtag-style validation helper，而不是创建第二套正则协议。

### 2. Routing priority

QA heading 路由顺序固定为：

1. 命中 `qaGroupMarker` -> QA Group route
2. 命中 `semanticQaMarker` -> existing semantic-qa route
3. 其他命中 QA level 的 heading -> existing basic route

这样能确保两个 marker 可并存且互不吞噬。

### 3. Group route data model stays parallel

新增并行模型，不复用 `IndexedCard` 作为 group block 的核心表示。仓库中应存在这些概念：

- group marker representation
- group item representation
- indexed group block representation
- group note payload builder
- recovered group state

原因：

- 当前 `IndexedCard` 强绑定单 `noteId`
- 当前 `PluginState.cards` 强绑定 noteId-keyed atomic state
- Group 12 需要在一条 note 内维护 slot identity

### 4. Parser rules for v1

v1 固定规则：

- `Stem` = heading 去 marker 后的文本
- `Q` = 一级列表项文本
- `A` = 第一条二级列表项文本
- deeper nested content 不进入 `A`
- fenced code blocks 不能被误判成列表
- 块尾允许存在一条 `GI`

无效一级项定义：

- 没有二级列表项

处理策略：

- 直接跳过，不生成 group item

### 5. GI protocol is explicit and strict

采用目标格式：

```md
<!--GI:n=999;i=a1:1,b2:2,c3:3;f=-->
```

语义锁定：

- `n` = noteId
- `i` = itemId -> slot
- `f` = free slots

附加规则：

- GI 固定写在 group block 尾部
- group write-back 只保留一条 GI
- 命中 group route 的块会清理内部旧 `<!--ID: ...-->`

### 6. Item identity strategy

首次进入组时，插件为每个 item 分配短 token `itemId`。

本轮采用：

- 轻量 deterministic short token generator
- 一旦分配并写入 GI/state，后续重排不改 `itemId`

slot 规则：

- 首次 `1..N`
- 删除中间项时进入 `freeSlots`
- 新增项优先复用最小 free slot
- 重排不改 slot
- 超过 12 项直接阻止同步

### 7. Recovery order

GI 丢失恢复顺序固定：

1. 先查本地 group state by `GroupId`
2. 若本地无充分信息，再查询 Anki 中同 model note 的 `GroupId`
3. `Src` 仅用于辅助缩小范围和校验唯一性
4. 唯一命中可重建 GI
5. 多命中返回 warning/error，不自动认领
6. 未命中则走首次创建

### 8. Model management strategy

`AnkiGateway` 扩展 group model 管理接口，至少支持：

- ensure model exists
- inspect fields
- inspect templates
- create model
- add fields
- add templates
- update templates
- update styling
- query note ids for recovery
- read note fields for recovery

但这些能力只为 group route 服务，不反向改造 basic/cloze/semantic-qa 的 note field mapping 工作流。

### 9. Execution integration point

group route 的执行入口放在 `ManualSyncService` 中，与现有 atomic sync 并列。

原因：

- `ManualSyncService` 已持有 index / render / execute / write-back / save state 的总编排能力
- 在这里并联 group 流最容易共享 deck / vault / repository / gateway 能力
- 也最容易保证旧路线不受影响

### 10. Settings UI scope control

只新增最小设置项：

- `QA Group marker`

本轮不新增：

- group model selector
- group field mapping panel
- group preview complex panel

原因：

- v1 模型固定
- 字段协议固定
- 复杂 UI 会扩大 scope 而不增加正确性

## Intentional Deviations From The Reference Plan

### 1. 不把 group route 接进现有 `DiffPlannerService`

这是对参考方案的结构性调整。

原因：当前仓库的 planner/executor/state 都是单卡单 note 语义；强行复用会显著增加回归风险。

### 2. parser 层不引入大而全 warning 总线

原因：当前仓库没有统一 parser warnings 模型。本轮只在需要阻止同步的地方返回结构化错误，其余无效项直接跳过。

### 3. `A` 只取第一条二级列表项纯文本/markdown 内容

原因：这是最符合当前仓库复杂度预算的 v1 规则，也更容易保证 slot 稳定与恢复逻辑清晰。

### 4. 不做 group field mapping UI

原因：目标 model 固定，直接生成完整 field payload 更适合当前代码结构。