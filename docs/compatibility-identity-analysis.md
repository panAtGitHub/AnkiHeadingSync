# 身份兼容性分析

## 当前 manual-sync 的身份模型

当前主链的真实身份模型是：

- Markdown 里有 `cardId`
- `pluginState.cards[cardId]` 保存 `noteId`
- 扫描阶段优先用 `cardId` 找回旧状态
- 只有在没有 marker 但又能用 `(filePath, rawBlockHash)` 唯一命中旧状态时，才允许无 marker 续命

换句话说，当前主链的第一主键是 `cardId`，`noteId` 只是这个主键之下的外部映射。

## 旧卡的身份模型

用户给出的真实旧样本身份模型是：

- heading block
- 正文
- 尾部 legacy marker：`<!--ID: noteId-->`

它直接把 `noteId` 放在 Markdown 里，但没有 `cardId`，也没有当前 `pluginState` 需要的状态结构。

## 为什么直接接管一定失败

下面是旧样本首次进入当前主链时的真实控制流。

### 第 1 步：legacy marker 不会被识别

`CardMarkerService` 只识别 `<!-- AHS:card=... note=... -->`。

因此旧样本中的：

`<!--ID: 1760624596099-->`

对当前 `extractMarker()` 来说不是 marker，只是普通正文行。

### 第 2 步：legacy marker 会被保留在正文和 hash 里

`CardIndexingService.extractMarker()` 只有识别到 AHS marker 时，才会把 marker 行从 `bodyLines` 里剥掉。

旧样本 marker 不被识别，意味着：

- `markerState = "missing"`
- `bodyMarkdown` 仍包含 legacy marker 行
- `contentEndLine` 落在 legacy marker 那一行
- `rawBlockHash` 是“正文 + legacy marker”一起算出来的

这会带来两个后果：

1. 当前主链拿不到 `markerNoteId`
2. 将来即便写入新 AHS marker，迁移前后的 `rawBlockHash` 也不天然一致

### 第 3 步：`resolveIdentity()` 会生成新的 `cardId`

旧文件首次扫描时通常同时满足：

- 没有 `markerCardId`
- `pluginState.cards` 里没有对应条目
- `(filePath, rawBlockHash)` 也命不中旧状态，因为旧卡还没被迁入 `pluginState`

于是 `resolveIdentity()` 只能走最后一条分支：

- 生成一个新的 `cardId`
- 不附带 `noteId`

### 第 4 步：`DiffPlannerService` 会把旧卡当成新卡

`DiffPlannerService` 的判定非常直接：

- `resolvedNoteId` 为空 -> `toCreate`

所以当前主链不会把旧 note 当成“待更新”，而会把同一个 Markdown block 当成“待新建”。

### 第 5 步：写回还会把新 marker 插到旧 marker 后面

因为旧 marker 没被识别，`MarkdownWriteBackService` 后续写回的 AHS marker 会按当前 `contentEndLine` 插入。

而当前 `contentEndLine` 恰好落在 legacy marker 那行之后。

结果是：

- 旧 `<!--ID: ...-->` 还在
- 新 `<!-- AHS:card=... note=... -->` 又被追加进来

这不是设计好的“双 marker 兼容”，只是直接运行后的副作用。

## 为什么这不是“只能导入为新卡”

虽然直接接管失败，但当前证据同时说明：迁移是可行的。

### 证据 1：旧 Markdown 自带精确 noteId

旧样本不是“模糊匹配标题”，而是每个 block 尾部都内嵌了真实 noteId。

例如：

- `<!--ID: 1760624596099-->`
- `<!--ID: 1760624596121-->`

这使迁移不需要做模糊搜索，不需要猜测哪张 Anki note 属于哪个 block。

### 证据 2：这些 noteId 在当前 Anki 中仍然存在

实时 `notesInfo` / `cardsInfo` 已证实：

- noteId 可取回 live note
- live note 的 model 是 `问答题`
- deck 仍是旧 Markdown 声明的 wikilink deck

所以 legacy noteId 不是死数据，而是可落到当前 Anki 真值上的活锚点。

### 证据 3：当前主链的数据容器能容纳迁移后的身份

当前 `PluginState.CardState` 已经具备迁移后所需的关键字段：

- `cardId`
- `noteId`
- `rawBlockHash`
- `renderConfigHash`
- `deck`
- block line / offset 信息

因此，旧卡不是“没有落点”，而是“没有翻译层”。

## 迁移真正要做的身份翻译

一次可行的迁移，本质是在每个旧 block 上做四件事：

1. 读取 legacy `noteId`
2. 生成新的 `cardId`
3. 把 `<!--ID: noteId-->` 改写成 `<!-- AHS:card=cardId note=noteId -->`
4. 把同一个 block 的当前状态写入 `pluginState.cards[cardId]`

只要这四件事一次完成，下一次 normal sync 时，当前主链就会把这些卡当成原生 AHS 卡来处理。

## 迁移时必须守住的身份不变量

### 不变量 1：hash 必须基于“剥除 legacy marker 后”的 block 内容计算

否则迁移写回之后，未来扫描得到的 `rawBlockHash` 会和迁移时落盘的 `rawBlockHash` 不同，造成后续误判。

### 不变量 2：`pluginState` 必须与 Markdown 写回同时成立

只改 marker 不建状态，下一次主链仍然可能失配。

只建状态不改 marker，则 Markdown 侧没有 `cardId`，主链也无法稳定命中。

### 不变量 3：不能依赖 `syncRegistry`

当前 manual-sync 不消费 `syncRegistry`，所以迁移后的真相必须落在 `pluginState`，而不是旧 registry。

### 不变量 4：缺失 noteId 的 block 必须降级处理

只要某个旧 block 没有可验证的 live noteId，它就不再属于“可接管”的那一类，而应降级为“只能新建导入”。

## 字段是否要在迁移后立即归一

这不是 identity 阻塞点，但它是一个策略位。

### 方案 A：只迁 marker 和状态，不立即重渲染旧 note 字段

- 优点：最保守，review history 不受干扰，旧卡外观暂时保持原样
- 缺点：旧卡会在一段时间内继续保留旧式 front/back HTML

### 方案 B：迁移完成后强制一次重渲染

- 优点：旧卡立即归一到当前 AHS 的 `Open in Obsidian` 渲染风格
- 缺点：会产生一次大批量字段更新

无论选 A 还是 B，都不改变主结论：接管是可行的，但必须先迁移 identity。

## 身份分析结论

当前主链对旧卡的失败方式是确定性的，不是概率性的：

- 认不出旧 marker
- 建不出旧 identity
- 进入 `toCreate`
- 产出重复卡

但同样，迁移后的成功路径也是确定性的，不是模糊匹配式的：

- 旧 Markdown 提供 noteId
- live Anki 验证 noteId 真实存在
- 当前状态模型能容纳迁移结果

所以最终判断应是：

不是“不能接管”，而是“不能直接接管，只能先迁移后接管”。
