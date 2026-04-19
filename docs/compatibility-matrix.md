# 兼容性矩阵

## 维度矩阵

| 维度 | 旧卡现状 | 当前 manual-sync 要求 | 当前兼容性 | 说明 |
| --- | --- | --- | --- | --- |
| Markdown marker 识别 | `<!--ID: noteId-->` | `<!-- AHS:card=... note=... -->` | 不兼容 | 当前 parser 完全不识别旧 marker |
| 首次 identity 建立 | 只有 `noteId` | 需要 `cardId` 或已存在的 `pluginState` | 不兼容 | 没有 `cardId` 就会生成新身份 |
| 旧状态利用 | data.json 里可能还有 `syncRegistry` | manual-sync 只看 `pluginState` | 不兼容 | 旧 registry 不会自动转成新状态 |
| `rawBlockHash` 一致性 | 旧 marker 是正文最后一行的一部分 | 新主链只会剥离 AHS marker 再算 hash | 不兼容 | 直接扫描旧文件时，legacy marker 会进入 hash |
| 首次 diff 规划 | 旧卡应被认领为已有 note | `resolvedNoteId` 为空就 `toCreate` | 不兼容 | 直接运行会建重复卡 |
| Markdown 写回效果 | 理想上应替换旧 marker | 当前 write-back 只会写 AHS marker | 有风险 | 不做迁移时会出现旧 marker + 新 marker 并存 |
| Note model | 旧样本 live note 为 `问答题` | 当前配置的 QA note type 为 `问答题` | 兼容 | 无需 note type 迁移 |
| 字段映射 | 旧样本 live note 为 `正面 / 背面` | 当前映射也是 `正面 / 背面` | 兼容 | 无需字段结构转换 |
| Deck 语义 | 旧样本使用 wikilink deck 名 | 当前 deck normalization 保留 segment 原文 | 兼容 | deck 不是阻塞点 |
| Tag 利用 | 旧卡常带 `Obsidian_to_Anki` | 当前主链不使用 tag 认领 | 条件兼容 | tag 适合审计，不适合作为主 identity |
| 字段渲染风格 | 旧卡 front/back 含旧式 Obsidian 链接 | 当前渲染使用 `Open in Obsidian` backlink | 条件兼容 | 接管后字段可能被归一 |
| 一次性迁移可行性 | Markdown 已含精确 noteId | 新状态可容纳 `cardId -> noteId` | 兼容 | 可以通过一次迁移把旧身份翻译成新身份 |

## 结果分层

### 直接兼容的维度

- note model
- 字段映射
- deck 名字与 deck 提示

### 阻塞直接接管的维度

- marker 识别
- 首次 identity 建立
- 旧状态复用
- 首次 diff 规划
- 直接写回行为

### 只有迁移后才兼容的维度

- `cardId -> noteId` 状态落盘
- 新 marker 写回
- 后续 normal sync 的稳定更新与改 deck

## 四种结论类别映射

| 结论类别 | 与当前证据的匹配度 | 判断 |
| --- | --- | --- |
| 可直接接管 | 低 | 否 |
| 可接管，但必须先做一次迁移写回 | 高 | 是 |
| 不可安全接管，只能导入为新卡 | 中 | 否，除非某些块缺 noteId 或 note 已丢失 |
| 需要双 marker 过渡期 | 低到中 | 否，当前证据不要求双 marker 才能安全完成迁移 |

## 最核心的矩阵结论

如果只看 Anki 侧数据模型，旧卡与当前主链是兼容的。

如果看 identity 进入主链的入口，旧卡与当前主链是不兼容的。

所以真正的系统级判断不是“不能接管”，而是“不能直接接管，但可以通过一次显式迁移接管”。
