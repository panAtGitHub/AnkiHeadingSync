# Deck Resolution Gap Report

## 审查范围

本报告仅审查 manual-sync 主链路中的 deck 相关实现：

1. `CardIndexingService`
2. `RenderConfigService`
3. `DiffPlannerService`
4. `ManualSyncService`
5. `AnkiBatchExecutor`

不把旧的 legacy 同步链路作为本轮主实现入口。

## 当前实现结论

### 已有能力

1. 设置中已有 `defaultDeck`
2. manual-sync 链路里已有 `deckHint -> RenderConfigService -> plannedCard.deck`
3. add 路径已会在批量执行前调用 `ensureDecks(...)`

### 与计划不一致的核心缺口

1. `CardIndexingService` 只支持正文单行 `TARGET DECK: ...`
2. 当前不支持 YAML `targetDeck`
3. 当前不支持正文双行 `TARGET DECK` 声明
4. 当前不处理 YAML / 正文冲突与 multiple body declarations
5. 当前没有 folder -> deck 映射
6. 当前没有独立的 deck 规范化与合法性校验
7. 当前 `RenderConfigService` 只做 `deckHint || defaultDeck`
8. 当前 `renderConfigHash` 包含 `deck`，会让 deck 变化进入 update 判定
9. 当前 `AnkiBatchExecutor` 在 update 后会调用 `changeDecks(...)`
10. 当前 manual-sync 结果对象没有结构化 deck warnings
11. 当前测试没有覆盖计划要求的大部分 deck 规则

## 架构问题

1. deck 解析逻辑被分散成“正文提取 + 默认兜底”，没有独立服务封装优先级与校验
2. warning 没有通过 manual-sync 结果对象向上汇总
3. update 路径把“字段更新”和“迁移 deck”耦合在一起，违背计划中的同步语义

## 本轮修复边界

本轮只补以下能力：

1. 显式 deck 提取（YAML + 正文两种语法）
2. folder deck 映射
3. default deck fallback
4. deck normalization / validation
5. YAML / 正文冲突 warning
6. warning 沿 manual-sync 结果链路透传
7. add 使用 resolved deck，update 禁止自动 changeDeck
8. 对应单元测试与 manual-sync 回归测试

本轮不扩展到：

1. 旧链路回归改造
2. 标题级 deck override
3. deck 迁移命令
4. 自定义优先级与模板 DSL