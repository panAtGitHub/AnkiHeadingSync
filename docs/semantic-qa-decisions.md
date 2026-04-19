# Semantic QA Decisions

## Decision Summary

本轮按真实仓库结构锁定如下实现决策：

1. 新功能接入 current manual-sync 主链，不新增平行 sync path。
2. 新增独立内部 `CardType = "semantic-qa"`。
3. 语义 QA 使用独立 `semanticQaNoteType` 和独立 mapping key，不复用 `basic:...`。
4. 语义 QA 的字段映射行为是 basic-like：仍然走 title/body 两字段。
5. 触发条件是“标题级别等于当前 QA 标题级别，且标题文本末尾包含配置的 hashtag marker”。
6. 拆卡单位只认一级列表项；只有带缩进子内容的一级项生成卡。
7. 一级列表项同行正文不进入答案；答案只取其缩进子内容。
8. 语义 QA 子卡各自写独立 `<!--ID: noteId-->` marker，不共享父标题 marker。
9. 为了兼容当前 backlink 实现，新增“显示题面标题”和“backlink 锚点标题”的分离。
10. settings validation 继续沿用当前仓库的 lazy mapping 模式：
   - marker 语法与 note type 非空做全局校验
   - mapping 结构合法性继续全局校验
   - mapping 完整性在“保存 mapping”和“实际同步使用该 note type”时强制校验

## Concrete Decisions

### 1. Internal card type name

使用：

- `semantic-qa`

原因：

- 语义清晰
- 与当前 `basic` / `cloze` 明确区分
- 仍能在实现里被当作 basic-like 类型处理

### 2. Settings shape

新增设置：

- `semanticQaMarker`
- `semanticQaNoteType`

本轮不新增 `semanticQaEnabled`。

原因：

- 仓库当前没有其他 feature-toggle 先例
- 触发权已经由 marker + 标题级别共同控制
- 可以在不改变当前 settings 生命周期的前提下完成需求

### 3. Marker syntax validation

合法 marker 语法固定为 hashtag token：

- 必须以 `#` 开头
- 后面至少 1 个非空白字符
- 不允许内部再含空白

v1 不支持：

- emoji trigger
- wikilink trigger
- 多 token 组合 trigger

### 4. Parsing integration point

解析入口放在 `CardIndexingService` 内部。

行为：

- 普通 QA 标题：保持一标题一张 `basic`
- 普通 Cloze 标题：保持现状
- 带 semantic marker 的 QA 标题：进入 semantic list parser，产出 0..n 张 `semantic-qa`

原因：

- 当前主链的 identity / note type / deck / writeback 都从 `IndexedCard` 起步
- 在这里拆卡，后续 planner/executor/state 都能自然复用

### 5. Semantic child identity strategy

每张 semantic 子卡的稳定 basis 为：

- file path
- 一级列表项的 `blockStartLine`
- 父标题文本
- 子项稳定键
- 子项答案内容

其中子项稳定键采用：

- `normalized child label + occurrence index among same labels within the same semantic heading`

原因：

- 比“全局顺序号”更稳
- 仍然是 deterministic
- 能处理同一父标题下重复 label 的情况

具体做法：

- 把上述信息编码进 semantic 子卡的 `rawBlockText` / `rawBlockHash`
- `syncKey` 仍使用现有 `filePath + blockStartLine + rawBlockHash`

### 6. Marker placement for semantic child cards

每个 semantic 子卡都在自己所属一级列表项区域内独立写 marker。

默认位置：

- 该子项缩进内容的末尾之后

默认缩进：

- 优先复用已有 marker 行缩进
- 否则复用该子项首个子内容行的缩进
- 若仍不可用，则回退到“一级列表项缩进 + 两个空格”

原因：

- 避免多个子卡争用同一父标题尾部 marker 槽位
- 维持 Markdown 列表结构可读性

### 7. Title vs backlink anchor split

为 indexed/state/render 数据增加一个单独字段：

- `backlinkHeadingText`

语义：

- `heading` = 实际题面标题（父标题 + 子项名）
- `backlinkHeadingText` = 原父标题文本（含 semantic marker）

原因：

- 题面和 backlink anchor 在语义 QA 下不再相同
- 当前仓库的 backlink 生成严格依赖 heading text

### 8. Question/title format

v1 题面格式固定为：

- 父标题原文
- 换行
- 一级列表项标签文本（去掉列表 marker 本身，保留该项 markdown 文本）

原因：

- 符合“父标题 + 子项名”
- 最大程度贴近用户示例

### 9. Answer/body extraction rule

答案只取：

- 该一级列表项下面的缩进子内容

不包含：

- 一级列表项同行正文

若某一级列表项没有任何缩进子内容：

- 不生成卡

### 10. Preview implementation

preview 只放在 settings 页，且只做 settings-driven fixed sample preview。

不做：

- 当前文件实时扫描
- 编辑器内实时提示

实现方式：

- 复用 semantic list parser
- 对固定样例输入做解析
- 展示 marker 是否合法、会拆出多少张卡、每张卡的题面/答案摘要

## Intentional Deviations From The Prior AI Plan

### 1. 不新增 `semanticQaEnabled`

原因：

- 当前仓库并不依赖 feature-toggle 驱动 settings validity
- marker 已经是足够明确的触发约束

### 2. mapping completeness 不在全局 settings load/save 时强制要求“已经存在”

原因：

- 当前 basic/cloze 也不是这样工作的
- 仓库真实模式是 lazy load fields -> save mapping -> runtime validate when used

### 3. 额外引入 `backlinkHeadingText`

原因：

- 这是当前仓库实现决定的必需项
- prior AI plan 没显式覆盖这个模型缺口