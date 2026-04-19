# 最终建议

## 最终分类

**可接管，但必须先做一次迁移写回。**

这是本次分析在 current manual-sync 主链边界内的最终判断。

## 为什么是这个结论

### 不是第 1 类：可直接接管

因为当前主链并不会把旧 `<!--ID: ...-->` 识别为已有身份。

直接运行只会：

- 生成新的 `cardId`
- 把卡放进 `toCreate`
- 在 Markdown 里追加新 AHS marker
- 在 Anki 里创建重复 note

### 也不是第 3 类：只能当新卡导入

因为当前样本已经证明旧卡具备可迁移条件：

- Markdown 里有精确 noteId
- noteId 在 live Anki 中可验证存在
- note model / fields 与当前配置兼容
- deck 语义也兼容

所以“完全不能接管”的判断过于悲观。

### 更不是第 4 类：必须双 marker 过渡

因为当前证据没有显示必须长期维护双协议。

一次确定性的 migration write-back 就足以把旧身份翻译进新身份模型。双 marker 只会增加长期 parser 和写回复杂度。

## 推荐策略

### 主策略

做一次显式迁移，把旧块一次性转换成 current manual-sync 的原生形态：

1. 读出旧 block 的 legacy `noteId`
2. 验证该 `noteId` 在 Anki 中真实存在
3. 为该 block 生成新的 `cardId`
4. 把 `<!--ID: noteId-->` 改写成 `<!-- AHS:card=cardId note=noteId -->`
5. 同步写入 `pluginState.files` 与 `pluginState.cards`
6. 之后再让 normal sync 接管

### 迁移完成后的系统状态

迁移完成后，这批旧卡在系统里应当表现得和原生 AHS 卡完全一样：

- Markdown 里只有 AHS marker
- `pluginState.cards[cardId].noteId` 已存在
- 后续改内容走 `toUpdate`
- 后续改 deck 走 `toChangeDeck`
- 不再依赖 legacy marker 或旧 `syncRegistry`

## 迁移必须满足的验收门槛

### 门槛 1：dry-run 必须先给出审计结果

至少要列出：

- 可迁移块数量
- 缺失 noteId 的块数量
- noteId 在 Anki 中不存在的块数量
- 一对多 / 多对一冲突数量

### 门槛 2：迁移后 Markdown 中不能再残留 legacy marker

理想结果是：

- 一个 block 只有一个 marker
- 该 marker 一定是 AHS marker

### 门槛 3：迁移后 `pluginState` 必须成为唯一真相源

迁移完成后，后续接管不应再依赖 `syncRegistry` 或 tag 搜索。

### 门槛 4：首次接管验证必须做到“零重复建卡”

对未修改内容的迁移样本，迁移后的第一次 normal sync 应满足：

- `created = 0`
- 不新增重复 note
- marker 与 state 不再漂移

### 门槛 5：旧显式 deck 不得被错误改写

像 `[[anki背诵]]::[[《城市居住区规划设计标准》图解2021年]]` 这样的 deck 字面量，在迁移后必须继续解析为同一 deck。

## 关于字段是否立即归一

这是迁移后的策略位，不影响本次最终分类。

### 保守模式

- 先只迁 identity
- 不立即触发字段重渲染
- 优先保证 review history 与 note continuity

### 归一模式

- 迁移后主动触发一次字段更新
- 把旧 front/back HTML 统一到当前 AHS 渲染风格
- 代价是会发生一次批量 note update

无论选哪种，前提都相同：先迁 identity，再谈后续同步。

## 何时应局部降级为“只能新建”

以下 block 不应强行接管，应当单独降级为第 3 类：

- legacy marker 缺失
- noteId 非法
- noteId 对应的 live note 不存在
- live note 的 note model 与当前映射不兼容
- 一个 noteId 被多个 block 竞争认领

## 一句话建议

把“旧卡兼容”定义成一次确定性的身份迁移问题，而不是长期同时维护两套 marker 协议的问题。

在当前证据下，最稳的结论不是“直接支持旧卡”，也不是“放弃旧卡”，而是：

**先迁移写回，再交给 current manual-sync 正常维护。**
