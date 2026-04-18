# Empty Deck Cleanup Fix Decisions

## 1. DeckStat 语义

`DeckStat.noteCount` 改为可选值。

语义固定为：

1. `0` 表示明确为空
2. 正数表示明确非空
3. `undefined` 表示未知或缺失统计

## 2. Gateway 解析策略

`AnkiConnectGateway.getDeckStats` 不再使用任何把缺失统计映射成 `0` 的 fallback。

解析规则：

1. 只接受对象形态的 `rawStats[deckName]`
2. 只接受数值型 `total_in_deck`
3. 缺 key、字段缺失、字段类型不对、整体结构不对，都返回 `noteCount: undefined`

这保证未知不会伪装成 empty。

## 3. Candidate 筛选策略

`CleanupEmptyDecksUseCase.listCandidates()` 只接受：

1. `stat.noteCount === 0`

其他情况全部跳过：

1. `undefined`
2. 正数

## 4. 删除前再校验策略

`CleanupEmptyDecksUseCase.execute()` 在实际删除前继续重新读取 deck stats，但只把满足以下条件的 deck 视为可删：

1. deck 当前仍存在
2. `currentDeckStatsByName.get(deckName) === 0`

不再使用 `?? 0`。

因此：

1. missing stats -> skipped
2. unknown stats -> skipped
3. nonzero stats -> skipped

## 5. 测试策略

新增并锁定以下 fail-safe 测试：

1. stats 缺 key 时不判空
2. stats 空对象时候选为空
3. 只返回部分 deck 时，只接受显式为 0 的 deck
4. 返回结构缺少 `total_in_deck` 时，不把该 deck 视为空

## 6. 范围控制

本次只修空牌组候选误判，不扩展：

1. deck cleanup UI
2. deck cleanup 交互文案
3. 普通 sync/rebuild 行为
4. 其他 AnkiConnect payload 兼容逻辑