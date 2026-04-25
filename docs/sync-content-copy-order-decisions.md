# Sync Content Copy Order Decisions

## 1. 最终分组顺序

`renderSyncContentCard()` 的最终分组顺序固定为：

1. `1. 确定「卡片正文」范围`
2. `2. 确定是否增加回链，方便从 Anki「卡片级跳转」回 Obsidian`
3. `3. 确定是否读取「标签」`
4. `4. 「填空题」专项`

每组内的设置固定为：

1. 正文范围组：`卡片正文截止模式`
2. 回链组：`添加 Obsidian 回链`、`Obsidian 回链显示名称`、`Obsidian 回链放置位置`
3. 标签组：`同步 Obsidian 标签到 Anki`、`在卡片正文中保留纯标签行`
4. 填空题组：`高亮转填空题`

## 2. 英文分组标题

英文 locale 固定使用以下标题：

1. `1. Choose the card body range`
2. `2. Add backlinks for card-level jumps from Anki to Obsidian`
3. `3. Read tags`
4. `4. Cloze-specific options`

## 3. 中文 `Cloze` 文案替换范围

本次把中文用户可见 `Cloze` 统一替换为 `填空题`，覆盖范围包括：

1. 设置页同步内容卡片中的 `高亮转 Cloze` 与其描述
2. 中文设置项 `Cloze 标题层级`
3. 中文字段映射分区里的 `Cloze` 标题、描述和 `Cloze 主字段`
4. 中文设置校验错误里的 `Cloze` 文案
5. 中文字段映射错误里的 `Cloze` 文案

保留不变的部分：

1. 代码里的 `cloze` 标识
2. 配置字段 `convertHighlightsToCloze`
3. 类型名、枚举值、JSON schema、Anki 逻辑
4. 英文 locale 中的 `Cloze`

## 4. 兼容性边界

本次只改 UI copy 和显示顺序，不改变：

1. 设置保存字段名
2. TypeScript 类型名
3. `cloze` 内部标识
4. Anki note type / field mapping 行为
5. 同步逻辑和渲染逻辑

## 5. 范围锁定

本次刻意不改：

1. `settings.cards.syncContent.title`
2. 任何英文 `Cloze` 正文
3. 任何非中文、非用户可见的内部代码标识

原因是本轮合同只要求：

1. sync-content 小标题顺序与序号
2. 中文用户可见 `Cloze` 文案改成 `填空题`

## 6. 与计划的显式偏差

只有一个需要记录的偏差：

1. 未发现单独的计划文档文件
2. 因此按用户消息中的实施合同逐条执行