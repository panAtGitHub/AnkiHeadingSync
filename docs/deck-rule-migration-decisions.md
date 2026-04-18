# Deck Rule Migration Decisions

## 1. 规则失效策略

新增 `deckRulesFingerprint`，并持久化到 `FileState`。

指纹内容固定包含：

1. `defaultDeck`
2. `fileDeckEnabled`
3. `fileDeckMarker`
4. `folderDeckMode`
5. 规则版本常量

当文件内容未变但指纹变化时，普通全库同步必须强制重读文件并重新提取 deck 线索。

## 2. 计划语义

`renderConfigHash` 继续只表达字段渲染语义，不再承担 deck 兼容豁免。

新增 `ManualSyncPlan.toChangeDeck`：

1. 仅 deck 变化时进入 `toChangeDeck`
2. 字段变化且 deck 变化时，同时进入 `toUpdate` 与 `toChangeDeck`
3. 仅字段变化时，不触发 deck 迁移

## 3. 执行语义

`AnkiBatchExecutor` 在主链路正式启用 `ankiGateway.changeDecks(...)`：

1. `updateNotes` 只更新字段
2. `changeDecks` 只迁移 deck
3. deck 迁移基于 note summary 的 `cardIds`
4. 为避免迁移到不存在的 deck，add 和 changeDeck 目标 deck 都先走 `ensureDecks`

## 4. 结果统计

新增迁移统计字段：

1. `ManualSyncPlan.toChangeDeck`
2. `AnkiBatchExecutionResult.migratedDecks`
3. `ManualSyncResult.migratedDecks`

统计口径按“计划迁移的 note 数量”计算，而不是按 Anki card 数量计算。

## 5. 状态回写

`ManualSyncService.buildNextState` 继续把最新 resolved deck 写回 `CardState.deck`，并把当前 `deckRulesFingerprint` 写回 `FileState.deckRulesFingerprint`，作为下一次普通同步的比较基线。

## 6. rebuildIndex 语义

`rebuildIndex` 仍只负责：

1. 索引刷新
2. marker 修复

即使规则变了，也不执行 `changeDecks`。

## 7. 类型兼容策略

`UpdateAnkiNoteInput.deckName` 保留为可选字段，仅用于兼容旧测试桩和调用面；主链路不再依赖它承载 deck 迁移语义。

## 8. 文档语义

仓库文档统一改为以下产品语义：

1. 普通同步会按最新 deck 规则重算旧卡
2. 若 resolved deck 变化，普通同步会迁移旧 note 到新 deck
3. rebuildIndex 不负责 Anki deck 迁移