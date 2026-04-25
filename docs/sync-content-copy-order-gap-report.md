# Sync Content Copy Order Gap Report

## 审查范围

本次按真实仓库实现审查了以下位置：

1. [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts) 的 `renderSyncContentCard()`
2. [src/presentation/i18n/messages/zh.ts](src/presentation/i18n/messages/zh.ts)
3. [src/presentation/i18n/messages/en.ts](src/presentation/i18n/messages/en.ts)
4. [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts)

## 当前实现确认

### 1. `renderSyncContentCard()` 还没有真正的分组结构

当前实现只是：

1. 先渲染一段描述文案
2. 直接连续创建 7 个 `Setting`

没有：

1. 分组标题
2. 分组容器
3. 序号标题

### 2. 当前顺序与目标顺序不一致

当前 `sync-content` 卡片中的设置顺序是：

1. 卡片正文截止模式
2. 添加 Obsidian 回链
3. Obsidian 回链显示名称
4. Obsidian 回链放置位置
5. 高亮转 Cloze
6. 同步 Obsidian 标签到 Anki
7. 在卡片正文中保留纯标签行

与本轮要求相比，问题是：

1. `高亮转 Cloze` 目前出现在标签设置之前
2. 没有 4 个带序号的小标题

### 3. `settings.cards.syncContent.sections.*` 还不存在

中英文 locale 当前都只有：

1. `settings.cards.syncContent.title`
2. `settings.cards.syncContent.desc`

还没有本轮要求的：

1. `settings.cards.syncContent.sections.bodyRange`
2. `settings.cards.syncContent.sections.backlink`
3. `settings.cards.syncContent.sections.tags`
4. `settings.cards.syncContent.sections.clozeSpecial`

### 4. 中文用户可见文案里仍有多处 `Cloze`

已确认当前中文 locale 中至少还有这些用户可见 `Cloze`：

1. `Cloze 标题层级`
2. `高亮转 Cloze`
3. `把 ==highlight== 片段转换成 cloze 卡片使用的挖空格式。`
4. `Cloze`
5. `选择 Cloze 笔记类型，从 Anki 读取字段，然后确认主字段映射。`
6. `Cloze 主字段`
7. 多条设置校验和字段映射错误消息中的 `Cloze`

其中 `settings.cards.cardTypes.rows.cloze` 已经是 `填空题`，这部分不需要改。

### 5. 现有设置页测试还没覆盖 `sync-content` 的顺序和文案

当前 [src/presentation/settings/PluginSettingTab.test.ts](src/presentation/settings/PluginSettingTab.test.ts) 已覆盖：

1. 卡片默认折叠
2. sticky header
3. card-types 局部刷新与状态文案
4. deck / scope 等设置行为

但还没有专门验证：

1. `sync-content` 分组标题顺序
2. `高亮转填空题` 替代 `高亮转 Cloze`
3. 该 toggle 仍写回 `convertHighlightsToCloze`

## 建议的最小落点

1. 在 `renderSyncContentCard()` 中加入 4 个分组容器和标题
2. 按目标顺序把 7 个现有 `Setting` 重新分配到 4 个分组
3. 在 `zh.ts` / `en.ts` 增补 `settings.cards.syncContent.sections.*`
4. 把中文用户可见 `Cloze` 文案统一替换为 `填空题`
5. 在 `PluginSettingTab.test.ts` 补充 `sync-content` 顺序、文案和保存字段测试

## 与计划的显式偏差

有一个需要记录的仓库现实差异：

1. 仓库里没有发现单独可读的“attached plan document”文件路径
2. 本次实现以用户提示文本本身作为执行合同