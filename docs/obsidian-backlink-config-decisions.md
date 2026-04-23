# Obsidian Backlink Config Decisions

## Decision Summary

本轮按真实仓库结构锁定以下实现决策：

1. 新增 `obsidianBacklinkLabel` 与 `obsidianBacklinkPlacement` 两个 settings，并通过集中 normalize 层处理空 label。
2. 普通 QA / Cloze / 语义 QA 继续只改 `renderedFields.title` 与 `renderedFields.body`，不改现有字段映射结构。
3. Cloze 继续依赖既有 `title<br><br>body` 合并路径，不单独引入第三段字段。
4. 回链 HTML 统一由共享 helper 生成 anchor，普通卡与 QA Group 模板共用同一 escape 规则。
5. QA Group 12 通过“模板生成接收 settings + ensureModel 按当前 settings 校验/漂移更新”实现配置漂移，不改 `Src` 字段语义。
6. `RenderConfigService` 必须把新 label/placement 纳入 hash，确保已同步卡片会随设置变化重渲染。

## Concrete Decisions

### 1. Settings normalization policy

设置层新增两个 helper：

- `normalizeObsidianBacklinkLabel()`
- `normalizePluginSettings()` / `mergePluginSettings()`

用途分工：

- load：旧 snapshot 缺字段时吃默认值，空 label 归一为 `Open in Obsidian`
- save：写回前统一 trim label，空白值写默认文案
- UI：`plugin.updateSettings()` 也走 normalize，避免内存态和持久化态不一致

### 2. Placement rendering policy for normal cards

普通 QA / Cloze / 语义 QA 使用同一 placement 语义：

- `question-last-line`: 在 `renderedFields.title` 末尾追加 `<br>` + backlink anchor
- `answer-first-line`: 在 `renderedFields.body` 开头插入一行仅含 backlink 的块级 HTML
- `answer-last-line`: 在 `renderedFields.body` 末尾追加一行仅含 backlink 的块级 HTML，保持当前默认行为

这里不改变 title/body 的职责边界，只改变 backlink 被拼进哪一段 HTML。

### 3. Shared backlink helper policy

共享 helper 负责两件事：

- 生成 `<a class="anki-heading-sync-backlink" href="...">label</a>`
- 在普通卡与 QA Group 模板中按需 escape href / label

约束：

- 普通卡：escape URL 与 label
- QA Group 模板：href 保持 `{{Src}}` 原样，只 escape label

### 4. QA Group integration policy

`buildQaGroupModelDefinition()` 改为接收：

- `obsidianBacklinkLabel`
- `obsidianBacklinkPlacement`

`QaGroupModelService.ensureModel()` 改为接收当前 settings，并在每次 sync 前按 settings 生成目标模板。

placement 规则锁定为：

- `question-last-line`: `{{FrontSide}}` 后、`<hr id="answer">` 前
- `answer-first-line`: `<div class="a">...</div>` 前
- `answer-last-line`: 答案容器后，保持当前默认位置

### 5. Render hash policy

`renderConfigHash` 继续只表达“字段渲染语义”，因此新增：

- `obsidianBacklinkLabel`
- `obsidianBacklinkPlacement`

这样配置变化会进入现有 diff planner 的 update 判定，无需单独补一套回链迁移机制。

## Intentional Deviation From Draft Plan

本轮预计只有一个实现层面的轻微偏离：

- 普通卡的 `answer-first-line` 采用块级一行 backlink 再接原 body，而不是内联 anchor 紧贴正文开头

原因：

- 当前默认 `answer-last-line` 已是块级 `<p>...</p>` 形态
- 保持 body 两种 placement 都使用独立一行块级 HTML，更稳定，也更接近“第一行 / 最后一行”的视觉语义
- 不会影响 Cloze 合并结构或 note field mapping