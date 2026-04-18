# Deck Rule Migration Gap Report

## 审查范围

本报告只审查 deck 规则变更后“旧卡未按最新规则重梳理”的主链路实现：

1. `FileIndexerService`
2. `RenderConfigService`
3. `DiffPlannerService`
4. `ManualSyncPlan` / `ManualSyncResult`
5. `AnkiBatchExecutor`
6. `ManualSyncService`
7. `PluginState` / `FileState` 持久化

## 审查结论

修复前，旧卡不会在普通同步中按最新 deck 规则重梳理，原因不是单点 bug，而是三层实现同时把这种变化当作“可忽略”：

### 1. 索引复用条件缺少规则失效

`FileIndexerService` 只按文件时间戳、pending write-back、缺卡状态判断是否重读文件。

缺口：

1. deck 规则变化时，未改动文件仍会直接复用旧 `deckHint`
2. 旧 `CardState.deck` 会继续作为比较基线
3. 普通同步无法感知“规则变了但内容没变”

### 2. 计划阶段把 deck-only 变化视为 unchanged

`RenderConfigService` 的 `renderConfigHash` 本来已经不包含 deck，但 `DiffPlannerService` 仍通过兼容 hash 逻辑把历史 deck 差异豁免掉。

缺口：

1. deck-only 变化不会进入执行计划
2. 仅 deck 变化的卡会继续计入 `unchangedCards`
3. 缺少单独的 `toChangeDeck` 计划集合

### 3. 执行阶段没有主链路 deck 迁移

`AnkiBatchExecutor` 只做：

1. `ensureDecks + addNotes`
2. `updateNotes`
3. marker write-back

缺口：

1. 主链路没有使用 `ankiGateway.changeDecks(...)`
2. `UpdateAnkiNoteInput.deckName` 仍让接口看起来像 update 会顺带迁移 deck
3. 同步结果没有统计 migrated decks

### 4. 状态层缺少规则版本比较基准

`FileState` 中没有任何 deck 规则指纹，因此即使 settings 变了，也没有稳定方式让旧索引失效。

### 5. 文档与测试仍锁定旧语义

仓库中的模块 5 文档和旧的 deck 决策文档仍写着：

1. 旧卡不自动移动
2. `changeDeck` 不启用
3. deck 变化不应触发普通同步迁移

这些表述已经和新任务目标冲突，必须同步修正。

## 本轮修复边界

本轮只解决 deck 规则变更后的旧卡重梳理：

1. deck 规则指纹失效
2. 旧卡 deck 迁移计划生成
3. `changeDecks` 主链路执行
4. 迁移统计与状态回写
5. rebuildIndex 保持不迁移
6. 文档和测试改成新语义

不扩展到：

1. note type 迁移
2. 字段映射迁移
3. card identity 迁移
4. 单独的 deck migration 命令 UI