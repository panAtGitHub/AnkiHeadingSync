# Semantic QA Gap Report

## Scope

本报告只针对当前仓库里正在使用的 manual-sync 主链，审查它与“`#标签` 触发的语义 QA 列表拆卡”需求之间的差距。

主链边界是：

- settings / validation
- `CardIndexingService`
- `RenderConfigService`
- `ManualCardRenderer`
- `DiffPlannerService`
- `AnkiBatchExecutor`
- `MarkdownWriteBackService`
- `PluginState`

## Current Reality

### 1. 当前主链确实是 manual-sync，不是旧 syncRegistry 链

真实入口是：

- `FileIndexerService`
- `CardIndexingService`
- `DiffPlannerService`
- `AnkiBatchExecutor`
- `MarkdownWriteBackService`
- `PluginState`

旧 `domain/card/*` 与 `domain/sync/*` 仍在仓库里，但本轮新功能应接入 manual-sync，而不是另起一条平行同步路径。

### 2. 当前 card type 只支持两种内部类型

`CardType` 目前只有：

- `basic`
- `cloze`

这一点贯穿了：

- `PluginSettings`
- `NoteModelFieldMapping`
- `RenderConfigService`
- `NoteFieldMappingService`
- `CardIndexingService`
- `PluginState`
- `ManualCardRenderer`

因此，语义 QA 如果要使用“独立 note type + 独立 field mapping”，就不能只伪装成现有 `basic`。

### 3. 当前索引模型是“一段标题块 -> 一张 IndexedCard”

`CardIndexingService` 现在的基本假设是：

- 命中 QA 标题级别 -> 生成一张 `basic`
- 命中 Cloze 标题级别 -> 生成一张 `cloze`

标题块 body 目前被整体视为一张卡的正文，没有任何“标题块内部拆多卡”的结构。

### 4. 当前 marker / writeback / pending-writeback 已经支持“一个文件多卡”，但默认单位是 block

当前 marker 语义是：

- `<!--ID: noteId-->`
- `MarkdownWriteBackService` 依赖 `blockStartLine + rawBlockHash`
- `CardMarkerService.applyBatch()` 禁止同一个 `blockStartLine` 的重复写回

这意味着：

- 语义 QA 可以接入现有 marker 主链
- 但每张子卡必须拥有自己的 block 定位，而不能继续共用父标题的 `blockStartLine`

### 5. 当前 backlink 使用的是 `headingText`

`ManualCardRenderer` 当前会把 `card.heading` 同时用于：

- 题面标题渲染
- `createBacklink()` 的 heading anchor

这与语义 QA 需求直接冲突：

- 题面应是“父标题 + 子项名”
- backlink 仍应回到原父标题，而不是 synthetic question

所以现有模型缺少“显示题面”和“源 heading anchor”之间的分离。

### 6. 当前 settings UI 只暴露 basic / cloze 两套 mapping

`PluginSettingTab` 当前只支持：

- QA / Basic note type + mapping
- Cloze note type + mapping

没有：

- semantic marker 输入
- semantic QA note type
- semantic QA field mapping
- settings-driven preview area

### 7. 当前 settings validation 是“结构校验 + lazy mapping”，不是“强制所有 mapping 已就绪”

`validatePluginSettings()` 现在会校验：

- 枚举值
- note type 非空
- 已存在 mapping 的结构是否合法

它不会强制 basic/cloze mapping 必须已经存在。

这意味着 prior AI plan 中“全局 settings validation 必须立即强制 semantic mapping 完整”不完全适配当前仓库；若直接照搬，会破坏现有“先刷新 note type 再保存 mapping”的使用方式。

## What Can Be Reused

以下能力可以直接复用：

- 现有 manual-sync 主链
- `RenderConfigService` 的 note type / deck 决策位置
- `NoteFieldMappingService` 的 title/body 映射逻辑
- `ManualCardRenderer` 的 markdown / backlink / media 渲染能力
- `PluginState` 的 noteId 主身份持久化
- `MarkdownWriteBackService` / `pendingWriteBack` / orphan handling 主流程

## What The Prior AI Plan Got Right

以下方向与真实仓库吻合：

- 需要独立内部 card type，不能只伪装成现有 QA/basic
- 应接入当前主链，而不是新建平行路径
- 最适合的解析入口确实是标题解析阶段
- 需要 settings 页输入 marker、note type、field mapping、preview
- 需要稳定子卡 identity，且必须兼顾 marker writeback 与 orphan handling

## What The Prior AI Plan Got Wrong Or Overstated

### 1. “只改标题解析”是不够的

真实仓库里还必须同步改：

- `CardType`
- `PluginSettings`
- `NoteFieldMappingService`
- `RenderConfigService`
- `PluginState`
- `ManualCardRenderer` backlink anchor

### 2. “全局 settings validation 立即强制 semantic mapping 完整”不适合当前仓库

当前仓库的 note field mapping 是 lazy workflow：

- 先选 note type
- 从 Anki 读字段
- 再保存 mapping

所以 semantic mapping 应沿用这套模式，而不是把默认设置直接变成不合法。

### 3. “题面 = 父标题 + 子项名”还需要额外处理 backlink anchor

这不是 prior AI plan 中显式提到的点，但在当前实现里是必须补的模型差距。

## Main Gaps To Implement

1. 扩展 `CardType` 为三态，并让 semantic QA 走 basic-like field mapping 但独立 note type。
2. 在 `PluginSettings` / settings UI 中新增 semantic marker、semantic note type、semantic mapping controls 和 preview。
3. 在 `CardIndexingService` 中实现“带标签的 QA 级标题 -> 按一级列表项拆多卡”。
4. 为子卡引入稳定的 child key / child-local block identity。
5. 分离“显示题面标题”和“backlink 锚点标题”。
6. 让 marker writeback 能在同一父标题块内为多个子卡各自写 `<!--ID: noteId-->`。
7. 补 settings / indexing / rendering / sync / persistence 的测试闭环。

## Scope Risks

本轮容易漂移的点：

- 做成编辑器实时预览
- 引入 emoji / wikilink trigger
- 改动旧 syncRegistry 链
- 重构 deck 逻辑或 orphan 逻辑
- 试图做“一级列表同行正文智能截断”之外的复杂 NLP 解析

这些都不在本轮范围内。