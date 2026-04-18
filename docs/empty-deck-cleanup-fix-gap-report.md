# Empty Deck Cleanup Fix Gap Report

## 审查范围

本次修复只覆盖空牌组候选判定链路：

1. `AnkiGateway.getDeckStats`
2. `AnkiConnectGateway.getDeckStats`
3. `CleanupEmptyDecksUseCase`
4. 空牌组清理相关测试

## 当前缺口

### 1. gateway 把缺失统计直接映射成 0

`AnkiConnectGateway.getDeckStats` 当前实现：

1. 调用 `getDeckStats`
2. 对每个请求 deck 读取 `rawStats[deckName]?.total_in_deck ?? 0`

问题：

1. 返回对象缺 key 时，会把 unknown 误判成 `0`
2. 返回结构不符合预期时，也会把 unknown 误判成 `0`
3. 这违反了 `missing != empty`

### 2. use case 继续把 unknown 当 empty

`CleanupEmptyDecksUseCase` 当前实现有两处同类问题：

1. `listCandidates()` 直接用 `noteCount === 0`，但上游已经把 unknown 压成了 0
2. `execute()` 用 `(currentDeckStatsByName.get(deckName) ?? 0) === 0` 判定可删除，missing stats 会再次被当成空牌组

### 3. test fake 也把缺失统计默认成 0

`FakeManualSyncAnkiGateway.getDeckStats()` 目前对缺失 deck 返回 `{ noteCount: 0 }`。

这让测试层也继承了同样的危险默认值，无法覆盖“deck 列表存在，但 stats 缺失”的场景。

### 4. 现有测试只覆盖理想返回

当前测试只覆盖：

1. 请求 deck 与返回 stats 一一对应
2. `total_in_deck` 明确为 0 或正数

缺少：

1. 返回缺 key
2. 返回空对象
3. 只返回部分 deck
4. 返回结构不含 `total_in_deck`

## 修复目标

本次修复必须把判定收紧为：

1. 只有 Anki 明确返回 `total_in_deck === 0` 才算 empty
2. 缺失/未知/结构不匹配一律视为 unknown
3. unknown 不进入 cleanup candidates
4. stats 不完整时宁可少列，不可多列