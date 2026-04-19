# 兼容性样本对照表

## 样本边界

- 旧 Markdown 样本：`9Anki背诵/《城市居住区规划设计标准》图解2021年.md`
- 新 Markdown 样本：`999，试验卡片/课件2/卡片试验.md`
- 当前插件设置来源：`.obsidian/plugins/Anki Heading Sync/data.json`
- 当前 Anki 真值来源：`/tmp/ahs_compat_raw/*.json`

## Anki 侧样本发现快照

| 查询 | 返回结果 | 解释 |
| --- | --- | --- |
| `findNotes tag:Obsidian_to_Anki` | 返回大量 noteId，包含旧样本里的 `1760624596099` 等 noteId | 说明旧卡语料真实存在于当前 Anki 中 |
| `findNotes deck:"999，试验卡片::课件2::卡片试验"` | `[1776515511480, 1776515511477]` | 说明新链路样本 2 张卡也真实存在于当前 Anki 中 |

## 旧样本 5 张卡

| noteId | cardId | Markdown 标题 | Markdown marker | Markdown deck hint | Anki deck | model / tags | 字段形态摘要 | 样本结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1760624596099 | 1760624596105 | 城市居住区，定义？ | `<!--ID: 1760624596099-->` | `[[anki背诵]]::[[《城市居住区规划设计标准》图解2021年]]` | `[[anki背诵]]::[[《城市居住区规划设计标准》图解2021年]]` | `问答题` / `Obsidian_to_Anki` | Front 含题目和 Obsidian 链接；Back 含块级 backlink + 正文 | noteId 在 Markdown 与 Anki 间可直接对上 |
| 1760624596121 | 1760624596122 | 居住区依据其居住人口规模，可分为几类？ | `<!--ID: 1760624596121-->` | 同上 | 同上 | `问答题` / `Obsidian_to_Anki` | Front 含题目与 Obsidian 链接；Back 为列表 HTML | 数据模型与当前设置兼容 |
| 1760624596130 | 1760624596131 | 十五分钟生活圈居住区？定义？ | `<!--ID: 1760624596130-->` | 同上 | 同上 | `问答题` / `Obsidian_to_Anki` | Back 含强调、标记、旧样式链接 | deck 与字段都能继续沿用 |
| 1760624596139 | 1760624596140 | 十分钟生活圈居住区？定义？ | `<!--ID: 1760624596139-->` | 同上 | 同上 | `问答题` / `Obsidian_to_Anki` | Back 含旧渲染 HTML，含强调与标记 | 接管后字段可能被新渲染归一 |
| 1760624596147 | 1760624596147 | 五分钟生活圈居住区 | `<!--ID: 1760624596147-->` | 同上 | 同上 | `问答题` / `Obsidian_to_Anki` | Front 含题目与 Obsidian 链接；Back 为旧链路 HTML | 旧卡确有可认领的 live note |

## 新样本 2 张卡

| noteId | cardId | Markdown 标题 | Markdown marker | Deck 来源 | Anki deck | model / tags | 字段形态摘要 | 样本结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1776515511477 | `ahs_a217324b` | 试验的2 | `<!-- AHS:card=ahs_a217324b note=1776515511477 -->` | 文件夹 + 文件名 | `999，试验卡片::课件2::卡片试验` | `问答题` / 无 tag | Front 只有题目；Back 含 `Open in Obsidian` backlink | 当前主链是 `cardId + noteId` 双锚点 |
| 1776515511480 | `ahs_dca62365` | 试验2333 | `<!-- AHS:card=ahs_dca62365 note=1776515511480 -->` | 文件夹 + 文件名 | `999，试验卡片::课件2::卡片试验` | `问答题` / 无 tag | Front 只有题目；Back 含 `Open in Obsidian` backlink | 新链路不依赖 Anki tag 识别 |

## 旧样本 Markdown 与新样本 Markdown 的直接差异

| 维度 | 旧样本 | 新样本 | 含义 |
| --- | --- | --- | --- |
| heading 层级 | `####` | `######` | 当前设置里 `qaHeadingLevel=6`，旧样本若直接进入当前主链，是否被识别为 QA 卡还取决于设置或迁移策略 |
| marker 格式 | `<!--ID: noteId-->` | `<!-- AHS:card=... note=... -->` | identity 模型已经换代 |
| deck 来源 | 文件内 `TARGET DECK` | `folder-and-file` | deck 决策来源不同，但都能映射到 live Anki deck |
| Front 字段内容 | 题目后通常拼接一个 Obsidian 链接 | 仅保留题目 | 接管后若做字段归一，旧卡正面会被改写 |
| Back 字段内容 | 旧链路 HTML，常带块级 backlink | 新链路 HTML，统一 `Open in Obsidian` | 迁移后是否强制重渲染，是一个策略位 |
| Tag | 常带 `Obsidian_to_Anki` | 通常为空 | tag 可用于审计，但不是当前主链 identity 输入 |

## 三侧真值归纳

1. 旧 Markdown 已经提供了最关键的身份锚点：`noteId`。
2. 旧卡 live Anki 中的 note model 与字段映射和当前插件设置兼容。
3. 旧卡 live deck 与旧 Markdown 中的 `TARGET DECK` 完全一致，且当前 deck normalization 不会破坏 wikilink deck 名。
4. 新链路真正新增的是 `cardId` 这一层主键，而不是新的 note model。
5. 因此旧卡“无法接管”的原因不是数据不够，而是当前主链没有把旧身份格式翻译进新身份模型。
