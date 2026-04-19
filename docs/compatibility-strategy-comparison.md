# 兼容策略对比

## 对比对象

本次按用户要求，对四种结论类别逐一对照当前证据：

1. 可直接接管
2. 可接管，但必须先做一次迁移写回
3. 不可安全接管，只能导入为新卡
4. 需要双 marker 过渡期

## 策略总表

| 策略 | 核心做法 | 对当前证据的适配度 | 数据安全性 | 实施复杂度 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 可直接接管 | 不改旧 marker，不做状态迁移，直接让 current manual-sync 扫旧文件 | 低 | 低 | 低 | 否决 |
| 先迁移写回再接管 | 先把 legacy noteId 翻译成新 `cardId + noteId`，再让 current manual-sync 接管 | 高 | 高 | 中 | 推荐 |
| 只能导入为新卡 | 放弃认领旧 noteId，全部按新 note 创建 | 中 | 中到低 | 低 | 仅作失败降级 |
| 双 marker 过渡期 | 同时兼容旧 marker 和新 marker 一段时间 | 低到中 | 中 | 高 | 非必要 |

## 1. 可直接接管

### 假设

假设当前主链即使不懂旧 marker，也能靠别的方式认领旧 note。

### 为什么被证据否掉

- 当前 marker parser 不识别 `<!--ID: ...-->`
- 当前状态层不消费 `syncRegistry`
- 当前 indexer 首次进入旧文件时没有 `cardId` 可用
- `DiffPlannerService` 会把 `resolvedNoteId` 为空的卡直接放进 `toCreate`

### 实际后果

- 新建重复 note
- 旧 marker 仍留在 Markdown
- 新 AHS marker 追加写回

### 判断

不能选。

## 2. 可接管，但必须先做一次迁移写回

### 核心思路

在进入 current manual-sync 之前，先把旧卡翻译成当前主链原生能理解的形态：

- legacy marker -> AHS marker
- noteId-only -> `cardId + noteId`
- 无新状态 -> `pluginState.cards`

### 为什么它和当前证据最匹配

- 旧 Markdown 已经给出精确 noteId
- Anki live note 仍存在
- note model / fields 与当前设置兼容
- deck 字符串兼容
- 当前主链只缺一层 identity translation

### 风险控制点

- 必须 dry-run 检查 noteId 是否仍存在
- 必须在写回时同时落 `pluginState`
- 必须按“剥掉 legacy marker 后”的 block 计算 `rawBlockHash`
- 必须拒绝一对多或多对一的异常映射

### 判断

这是当前最合理的主方案。

## 3. 不可安全接管，只能导入为新卡

### 这种判断成立的前提

只有在以下情况才应把某些卡降级为“只能新建”：

- Markdown 中没有可验证的旧 noteId
- noteId 指向的 live note 已经不存在
- 同一个 noteId 被多个 block 复用
- 旧卡 model 与当前映射不兼容

### 为什么它不是本次样本的总判断

当前样本并不满足这些失败前提：

- noteId 在 Markdown 中明确存在
- live note 能通过 `notesInfo` / `cardsInfo` 取回
- model 和 fields 兼容
- deck 也兼容

### 判断

不能作为总方案，只能作为迁移过程中的按块降级策略。

## 4. 需要双 marker 过渡期

### 这种策略通常解决什么问题

- 不能原子迁移整批 Markdown
- 需要多客户端、多版本并存一段时间
- 需要新旧插件同时读写同一批文件

### 当前证据为什么不支持它成为必要条件

- 旧样本已经给出精确 noteId，不需要靠双 marker 维持身份连续性
- 当前 manual-sync 的稳定态只认识 AHS marker，保留双 marker 反而会引入长期 parser 负担
- 用户当前要的是“接管旧卡”，不是“长期同时运行两套身份协议”

### 什么时候它才值得考虑

只有在 rollout 约束非常强，无法保证一次性写回，才应把双 marker 作为临时发布策略，而不是兼容性的核心答案。

### 判断

不是必要条件。

## 策略对比后的落点

最稳妥的归纳是：

- 总体结论属于第 2 类
- 第 3 类是迁移失败块的兜底分流
- 第 4 类只在部署方式受限时才可能作为临时工程手段

也就是说，正确问题不是“要不要直接支持旧 marker 一辈子”，而是“要不要做一次确定性的身份迁移，然后把系统收敛到单一的新 marker 协议”。
