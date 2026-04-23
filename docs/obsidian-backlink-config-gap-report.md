# Obsidian Backlink Config Gap Report

## Scope

本报告基于当前仓库真实代码审查，聚焦这五条链路与计划差距：

- settings 默认值、校验、持久化与旧 data.json 兼容
- 普通 QA / Cloze / 语义 QA 的回链渲染入口
- Cloze title/body 合并影响面
- QA Group 12 模板生成与 model drift 更新链路
- renderConfigHash 对已同步卡片的失效机制

## Confirmed Gaps

### 1. 普通卡回链仍硬编码在 ManualCardRenderer

`src/domain/manual-sync/services/ManualCardRenderer.ts` 当前只在一个分支里决定回链行为：

- `addObsidianBacklink = true` 时始终向 `renderedFields.body` 末尾追加 `<p><a ...>Open in Obsidian</a></p>`
- 没有 label 配置入口
- 没有 placement 配置入口

这意味着普通 QA、Cloze、语义 QA 目前共享同一个“答案末尾 + 固定文案”硬编码。

### 2. Cloze 兼容点不在 renderer，而在现有字段映射合并逻辑

当前仓库结构里，Cloze 仍然由 renderer 先产出 `title` / `body`，再由 note field mapping 把它们合并进主字段。

因此实现时不需要改 Cloze 的字段结构；只要保证 `question-last-line` 改的是 `title`，`answer-first-line` / `answer-last-line` 改的是 `body`，现有 `title<br><br>body` 合并形状就会自然继承新位置。

### 3. QA Group 12 也仍然硬编码默认回链

`src/application/services/QaGroupModelDefinition.ts` 当前在模板生成里写死：

- back 模板固定把 `<a class="anki-heading-sync-backlink" href="{{Src}}">Open in Obsidian</a>` 放在答案容器后
- `buildQaGroupModelDefinition()` 没有接收 settings 或其他配置参数

`src/application/services/QaGroupModelService.ts` 的 `ensureModel()` 也始终调用无参 `buildQaGroupModelDefinition()`，所以模板漂移更新机制存在，但暂时无法感知用户配置。

### 4. QA Group note 字段链路已经独立，不需要改字段结构

`src/application/services/QaGroupSyncService.ts` 当前行为已符合计划的结构约束：

- `Src` 仍由 `buildGroupBacklink()` 生成并写入 note fields
- `buildQaGroupNoteFields()` 仍固定写 `Stem / GroupId / Src / S01..S12`
- 没有通过普通 note field mapping 去映射 QA Group 字段

因此本轮不需要新增字段，也不需要改变 `Src` 含义，只需让 model template 生成使用当前 settings。

### 5. settings 持久化只做默认值合并，没有空 label 归一

`src/infrastructure/persistence/DataJsonPluginConfigRepository.ts` 当前对 settings 的处理是：

- load 时直接用 `DEFAULT_SETTINGS` 合并旧 snapshot
- save 时直接校验后原样写回

这能处理“缺字段”，但不能处理：

- 旧 / 异常 data.json 中 `obsidianBacklinkLabel` 为空字符串或全空格
- UI 保存时把全空格文案写进 settings

计划要求的空 label 归一，需要引入一个显式 normalize 层。

### 6. renderConfigHash 目前还不感知新配置

`src/application/services/RenderConfigService.ts` 当前 hash 只包含：

- note model / mapping
- `addObsidianBacklink`
- `convertHighlightsToCloze`
- `keepPureTagLinesInCardBody`

如果只修改 label 或 placement，当前 diff planner 不会把已同步卡片判定为需要更新。

### 7. settings UI 与 i18n 尚未暴露新配置

`src/presentation/settings/PluginSettingTab.ts` 当前只在 sync options 区域渲染了 `addObsidianBacklink` toggle，没有：

- label 文本输入
- placement 下拉

中英文消息文件里也尚未存在这两组设置文案与 placement 校验错误文案。

### 8. 现有测试覆盖还缺四个关键面

当前仓库已有：

- `PluginSettings.test.ts`
- `PluginSettingTab.test.ts`
- `ManualCardRenderer.test.ts`
- `QaGroupModelService.test.ts`
- `QaGroupSyncService.test.ts`

但还缺或不足：

- settings 归一化与 placement 校验
- label / placement 改变引起的 renderConfigHash 变化
- 普通卡三种 placement 的断言
- QA Group 模板三种 placement 与 drift 更新断言

## Repository-Compatible Fix Direction

最安全的仓库兼容方案是：

1. 在 settings 层新增集中 normalize 函数，供 load/save/UI 共用。
2. 把普通卡回链渲染收口成共享 helper，并在 `ManualCardRenderer` 内按 placement 分流到 `title` 或 `body`。
3. 让 `buildQaGroupModelDefinition()` 接收 label/placement，并让 `QaGroupModelService.ensureModel()` 按 settings 生成模板。
4. 把 label/placement 纳入 `RenderConfigService` hash。
5. 只扩展现有测试锚点，不改 note 字段结构、不改 `Src` 语义、不做无关重构。

## Out Of Scope

本轮不扩张到：

- 新增 note 字段
- 改写 QA Group field contract
- 修改 Cloze 合并结构
- 新增独立的 QA Group settings 面板
- 调整现有 Obsidian backlink 开关语义