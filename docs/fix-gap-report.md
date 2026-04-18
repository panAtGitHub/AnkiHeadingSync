# Fix Gap Report

## 审查结论

本次真实故障链路与 review 结论一致。

### 1. 当前 gateway 仍按 deckName 直接读取 `rawStats[deckName]`

`AnkiConnectGateway.getDeckStats()` 当前通过 `extractDeckNoteCount(rawStats, deckName)` 取统计值，而该 helper 仍然使用：

1. `rawStats[deckName]`
2. 再读取 `total_in_deck`

这隐含假设：`getDeckStats` 的顶层 key 是 deck 名称。

### 2. 实际 AnkiConnect 返回结构不是 deckName-keyed

根据 `get_deck_stats` 文档示例，真实返回结构是：

1. 顶层 key 为 `deck_id` 字符串
2. deck 名称在 value 的 `name` 字段
3. 卡片总数在 value 的 `total_in_deck` 字段

因此当前实现对真实返回值会出现：

1. `rawStats[deckName]` 取不到
2. `noteCount` 变成 `undefined`
3. 上层候选筛选 `noteCount === 0` 全部失败
4. UI 提示“未发现可清理的空牌组”

### 3. 当前测试仍是假阳性

`AnkiConnectGateway.test.ts` 里的 mock 还在用错误结构：

1. 顶层 key 直接写 deckName
2. value 里没有 `name`
3. 正好迎合了错误实现

所以测试绿，不代表真实环境可用。

### 4. Use case 当前安全语义本身没有问题

`CleanupEmptyDecksUseCase` 现在已经保持了 fail-safe 语义：

1. 只有 `noteCount === 0` 才进入候选
2. `undefined` 不会被当成 empty

因此这次真正需要修的是：

1. gateway 对真实返回结构的读取方式
2. gateway tests 的假数据结构
3. 覆盖真实 payload 形状的回归测试

## 修复范围

本次只修：

1. `getDeckStats` 的真实 payload 读取
2. 空牌组候选识别的真实返回链路
3. 对应测试假阳性

不扩展到：

1. 空牌组清理 UI
2. 其他 deck API
3. 普通 sync / rebuild 逻辑