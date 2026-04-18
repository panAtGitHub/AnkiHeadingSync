# Fix Gap Report

## 审查结论

这次真实问题链路有两个点，而且两者叠加后才会出现你截图里的现象：

1. 父牌组被错误列为候选
2. 空的子牌组没有被列出来

### 1. 现有 deck 名单来源不适合做层级 cleanup 判断

当前 `AnkiConnectGateway.listDeckNames()` 仍然走 `deckNames`。

问题不在于接口能不能返回字符串数组，而在于本次 cleanup 需要的是“完整路径视角下的 deck 集合”，否则：

1. 可能只能拿到父级视角名单
2. 即使拿到父 deck，也无法可靠判断它是否还有子 deck
3. 空子牌组就可能根本不在候选计算输入里

对于 cleanup 这种会触发删除的管理命令，更安全的名单源是 `deckNamesAndIds`：

1. 直接拿到完整 deck name -> id 的全集映射
2. 以 key 作为完整 deck 路径集合
3. 再基于完整路径做父子关系判断

### 2. 现有 use case 会把“有子牌组的父 deck”当成空 deck

`CleanupEmptyDecksUseCase.listCandidates()` 当前只看：

1. `noteCount === 0`

这还不够。

在 Anki 的层级牌组里，一个父 deck 即使自己没有直属卡片，只要它下面还有 `Parent::Child` 之类的子 deck，就不能视为 cleanup 候选。

否则会出现：

1. 父 deck direct count 为 0
2. 但它仍然承载子牌组树
3. 插件把父 deck 列为“空牌组候选”

这与你截图中的现象一致。

### 3. 空子牌组没有被列出，根因是缺少“完整路径 + leaf only”判断

你故意保留的两个空牌组在 Anki 里表现为父 deck 下面的空子 deck。

当前链路没有同时满足这两个条件：

1. 拿到完整路径下的 deck 集合
2. 只对 leaf deck 做 empty 判定

所以结果会偏到父 deck，而不是落到真正需要清理的空子 deck。

### 4. 现有测试没有覆盖层级 deck 结构

当前测试主要覆盖：

1. deck stats 是否为 0
2. stats 是否缺失

但没有覆盖：

1. 父 deck + 子 deck 并存
2. 父 deck 自身为 0 但有后代
3. 只有 leaf empty deck 才应进入候选
4. 完整路径 deck 名称的读取

## 修复范围

本次只修以下内容：

1. deck 名单来源改成完整路径集合可用的读取方式
2. cleanup 候选仅允许 leaf deck
3. 真实层级 deck 结构的回归测试

不扩展到：

1. cleanup UI 改版
2. 其他 deck 管理命令
3. 普通 sync / rebuild 逻辑