# Tag Sync And Pure Tag Line Decisions

## 1. 单向覆盖语义

本次实现统一遵守以下所有权规则：

1. Obsidian 是唯一真源
2. Anki 是被覆盖目标端
3. 标题、正文、tags、deck、QA Group 字段都以当前 Obsidian 计算结果为准
4. 不保留 Anki 手工 tags
5. 不做正文冲突合并
6. 不给 QA Group 单独的所有权例外

## 2. 文件级标签来源

文件级标签统一从 Obsidian 官方 metadata cache 提取：

1. `app.metadataCache.getFileCache(file)`
2. `getAllTags(cache)`

如果 cache 不存在或没有 tags，则返回空数组。

## 3. 标签规范化规则

规范化规则固定为：

1. 去掉前导 `#`
2. 以 `/` 分段
3. 过滤空段
4. 再以 `::` 拼接输出到 Anki
5. 去重并保留首次出现顺序
6. 保留 emoji
7. 保留中文
8. 保留原始大小写

示例固定为：

1. `#3地区 -> 3地区`
2. `#📖/一人公司 -> 📖::一人公司`
3. `#a/b/c -> a::b::c`

## 4. 纯标签行清理的接入位置

纯标签行清理不会放在 metadata tags 提取中，也不会写回源文件。

实现位置固定为共享正文预处理函数，输入输出都是 markdown 文本：

1. 普通卡在 `ManualCardRenderer` 渲染 body 前调用
2. QA Group 在构造 `Sxx_A` 前调用

这样可以满足：

1. basic / cloze / semantic QA 复用同一规则
2. QA Group 复用同一规则
3. 关闭 tags 同步时仍可单独清理正文

## 5. 纯标签行清理规则

纯标签行定义固定为：

1. 行首尾 trim 后
2. 整行只包含一个或多个合法 tag token
3. token 之间允许空白
4. 不允许其他普通文字或说明性标点

处理规则固定为：

1. 删除全文所有纯标签行
2. 不删除行内标签
3. 不删除含普通文字的标签行
4. 不影响标题 trailing hashtags
5. 删除后压缩因删除产生的多余连续空行，保留自然段间距

## 6. 设置与 fingerprint 策略

新增两个布尔设置：

1. `syncObsidianTagsToAnki = true`
2. `keepPureTagLinesInCardBody = true`

并把两者纳入 `createDeckRulesFingerprint()` 的 payload，同时提升 fingerprint version。

决策理由：

1. 这两个设置都会影响同步产物
2. 现有仓库已经用这个 fingerprint 触发文件重读
3. 复用现有失效机制比引入第二套 fingerprint 更小更稳

## 7. 索引与状态策略

普通卡路径：

1. `SourceFile.tags` 承载文件级 tags
2. `CardIndexingService` 为 basic / cloze / semantic QA 写入 `tagsHint`
3. 当 `syncObsidianTagsToAnki = false` 时统一写空数组

QA Group 路径：

1. `IndexedGroupCardBlock` 增加 `tagsHint`
2. `GroupBlockState` 增加 `tagsHint`
3. QA Group 的 tags 也完全由文件级 tags 决定

## 8. Diff 策略

普通卡更新判定新增一条：

1. `existingState.tagsHint` 与 `card.tagsHint` 不同，则进入 `toUpdate`

同时继续依赖 `renderConfigHash` 覆盖纯标签行保留开关变化。

QA Group 更新判定不新增独立 planner，而是在 `QaGroupSyncService` 内部比较：

1. 字段变化
2. deck 变化
3. tags 变化

只要任一变化存在，就执行覆盖更新。

## 9. Anki 标签同步策略

接口层新增：

1. `AnkiNoteSummary.tags?: string[]`
2. `SyncAnkiNoteTagsInput`
3. `AnkiGateway.syncNoteTags()`

执行规则固定为：

1. 新建 note 继续在 `addNote/addNotes` 时直接写入 tags
2. 更新已有 note 时读取当前 tags
3. 计算 `removeTags` 与 `addTags`
4. 同一 note 固定先 remove 后 add
5. 无差异时不发额外请求

## 10. QA Group 仓库兼容决策

计划要求 QA Group 也应用纯标签行清理与 tags 覆盖。

基于当前仓库结构，本次不把 QA Group 重构进普通 renderer，而是：

1. 保持 `QaGroupSyncService` 作为专用同步器
2. 在其字段构造阶段调用共享正文预处理
3. 在其 note 同步阶段调用共享 tag diff 逻辑

这是本次唯一的仓库兼容偏差，目的是最小改动完成同等产品语义。

## 11. 测试范围锁定

本次必须补齐以下测试：

1. Obsidian metadata tag 提取与规范化
2. pure-tag-line cleanup 工具
3. CardIndexingService 的 `tagsHint`
4. DiffPlannerService 的 tag-only / setting-only 更新
5. QA Group 的 tags 与正文清理
6. AnkiConnectGateway 的 note tags 读写
7. AnkiBatchExecutor 的新建 / 更新 tag 行为
8. settings 持久化与设置页 toggle 文案

不扩展以下范围：

1. 反向同步
2. 正文 merge 策略
3. 新的 notice 流程
4. QA Group 的 markdown 渲染重构