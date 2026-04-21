# Obsidian Anki 新插件设计备忘（DDD 讨论稿）

> 归档说明（2026-04-21）：本文包含已移除的 legacy sync / syncRegistry 架构讨论。
> 仓库当前有效实现以 `ManualSyncService` manual-sync 主链为准。

## 文档目的

这不是一个立即开工的实现文档，而是一份面向未来的设计备忘。

目标是把当前已经讨论清楚的方向、边界、约束、DDD 拆分方式、领域模型、同步策略、风险点与后续演进路径完整记录下来，避免之后重新开始时又回到模糊状态。

本文档面向的插件目标是：

- 重新做一个新的 Obsidian -> Anki 插件
- 吸收 `AnkiHelperForCoding` 与 `obsidian-to-anki-plugin-forCoding` 的优点
- 保留“好用的做卡与同步能力”
- 去掉过重、过泛化、过难维护的部分
- 明确以 Obsidian 为唯一真源
- 明确只做单向同步：`Obsidian -> Anki`

库一：/Users/panxiaorong/Documents/ObsidianPluginCode/AnkiHelperForCoding
库二：/Users/panxiaorong/Documents/ObsidianPluginCode/obsidian-to-anki-plugin-forCoding

## 背景与总体判断

现有两个仓库各有优点，但都不适合作为新插件的直接基础。

### 1. `AnkiHelperForCoding` 的优点

- 工作流聚焦
- 功能边界相对清楚
- 对标题式做卡思路明确
- 有轻量的批处理和增量处理思路
- 贴近 Obsidian 内的实际使用方式

### 2. `obsidian-to-anki-plugin-forCoding` 的优点

- 真正具备较完整的 AnkiConnect 同步链路
- 能创建牌组、添加卡片、更新卡片、处理媒体
- 有较成熟的 Markdown/媒体/公式/链接转 Anki 可显示内容的能力
- 有全库扫描、同步状态、hash、批量处理等工程经验

### 3. 为什么不能简单合并

`obsidian-to-anki-plugin-forCoding` 的问题不是“代码不好”，而是产品定位已经变成“通用同步平台”，而不是“聚焦标题式做卡的新插件”。

它变重主要来自以下六层：

1. 输入语法越来越多
2. 配置系统越来越像框架
3. 同步系统承担了太多职责
4. 格式转换链较长
5. 全库扫描和过滤系统复杂化
6. TypeScript 之外还有 Python 旁路与更重的工程负担

新插件的方向不是复制它，而是：

- 保留核心能力
- 重写核心结构
- 主动缩掉产品边界

## 当前已确定的产品方向

下面是当前讨论中已经较明确的决定。

### 1. 输入语法只做“标题段落式”

只支持标题段落式卡片，不做旧插件里的通用语法平台。

规则初步确定为：

- 问答题默认使用四级标题 `H4`
- 填空题默认使用五级标题 `H5`
- 两者都允许用户修改级别
- 一个标题对应一个卡片块
- 卡片内容范围是：
  - 从该标题下一行开始
  - 到下一个“同级或更高标题”之前结束

这意味着第一版明确不做：

- 自定义正则语法
- Inline Note
- Begin/End Note 块语法
- 任意用户定义的卡片语法体系

### 2. 配置系统不做大平台

配置系统要保留必要能力，但不再做成旧插件那种开放式框架。

当前已保留的配置方向：

- 问答题标题级别
- 填空题标题级别
- `TARGET DECK`
- `qa note type`
- `cloze note type`
- 默认 deck
- 扫描范围（包含/排除文件夹）
- 是否添加 Obsidian 文件回链
- 是否为 Cloze 启用高亮转空

明确不做：

- folder -> deck 映射表
- folder -> tag 映射表
- 通用 syntax setting 集合
- 大量用户可编程语法选项
- 复杂 glob 平台

### 3. 同步系统保留核心能力

同步系统虽然重，但其中很多能力是值得保留的。

建议保留的能力：

- 创建 deck
- 新增 note
- 更新已有 note
- 媒体上传
- 批量扫描
- 同步状态持久化
- 增量同步
- orphan 检测

暂不直接做：

- Anki -> Obsidian 反向回写
- 双向同步
- 高复杂度冲突解决
- 第一版直接自动删除 orphan 对应的 Anki 卡片

### 4. 格式保真是关键目标

新插件的一个核心目标是：

> 在 Obsidian 里看到的内容，进入 Anki 后也尽量保持可用、可读、可复习。

因此需要保留并重构以下能力：

- Markdown -> HTML
- 数学公式
- 代码块与行内代码尽量不被破坏
- 高亮
- Wikilink
- 图片 embed
- 音频 embed
- Obsidian 回链

### 5. 需要做全局扫描，但边界要收紧

当前讨论结果是：

- 需要全局扫描
- 但只支持用户指定包含文件夹和排除文件夹
- 不做复杂 glob 规则平台

推荐规则：

- `includeFolders` 为空时：扫描整个 vault
- `includeFolders` 非空时：只扫描指定文件夹
- `excludeFolders` 始终生效
- 仅扫描 Markdown 文件

### 6. 工程上不保留 Python 旁路

新插件只保留 TypeScript / Obsidian 插件实现。

明确不做：

- Python CLI
- Python 安装与依赖管理
- 双实现栈同步维护

## 核心产品原则

这是新插件最关键的一条原则：

`Obsidian 是唯一真源，Anki 是同步目标。`

这条原则一旦确定，后续很多设计就会变得稳定：

- Obsidian 中的内容决定 Anki 中的内容
- Anki 中手改正文不会回写
- 下次同步时，Anki 中相关字段会被 Obsidian 内容覆盖
- 不需要做双向冲突合并
- 不需要把 Anki HTML 反解析成 Markdown
- 不需要做“Anki 改动写回标题块”的定位逻辑

## 为什么不做双向同步

虽然理论上可以做 Anki -> Obsidian 回写，但这不适合第一版，也可能永远不值得做。

原因包括：

- 无法轻易决定谁是最终真源
- Anki 中修改的可能是字段、标签、牌组、模型，而不只是正文
- Obsidian 的标题段落结构并不是数据库记录
- 回写时必须重新定位标题块
- 标题改名、移动、层级变化都会让回写不稳定
- HTML/媒体/链接从 Anki 回写为 Markdown 时存在信息损失

因此当前明确决定：

- 只做 `Obsidian -> Anki`
- 不做双向同步
- 不做 Anki 正文回写

## DDD 总体视角

这个插件如果用 DDD 来看，核心不是 UI，也不是 AnkiConnect API，而是：

> 把 Obsidian 中的标题段落块建模为“可同步卡片”，并稳定地同步到 Anki。

因此真正的核心领域不是：

- 设置页
- 命令面板
- HTTP 请求

而是：

- 卡片识别
- 卡片身份稳定性
- 卡片渲染
- 同步计划
- 同步状态演进

## 统一语言（Ubiquitous Language）

下面这些术语建议在整个项目里统一使用，避免后续沟通与实现混乱。

### Source Note

Obsidian 中的一个 Markdown 文件。

### Heading Block

一个标题以及它所管辖的正文范围。

### Card Draft

从标题块中解析出来、但还没有完成渲染和同步决策的卡片草稿。

### Card

领域中的标准化卡片对象，是同步的基本单位。

### Card Type

卡片类型，目前只包括：

- `basic`
- `cloze`

### Deck Target

卡片最终应进入的 Anki 牌组。

### Note Model

Anki 中的 note type / model，例如：

- `Basic`
- `Cloze`

### Rendered Fields

已经转换成可发送给 Anki 的字段内容。

### Sync Record

本地保存的同步记录，用于维护 `cardKey -> noteId` 映射及同步状态。

### Sync Scope

本次扫描或同步覆盖的文件范围。

### Orphan Card

本地同步记录里曾存在，但本次扫描中已经找不到来源卡片的记录。

### Source Hash

源卡片内容计算得到的 hash，用于判断是否变化。

## Bounded Context 拆分

建议把系统拆成四个主要上下文。

## 1. Card Authoring Context

负责从 Obsidian 内容里识别卡片。

### 职责

- 判断哪些标题会被视为卡片
- 判断这是问答题还是填空题
- 提取标题文本
- 提取正文块范围
- 解析文件级 `TARGET DECK`
- 产出 `CardDraft`

### 不负责

- AnkiConnect 通信
- noteId 管理
- orphan 检测
- HTTP
- UI

### 这里的核心问题

- 标题块切分是否准确
- 标题级别策略是否稳定
- 内容范围是否与用户认知一致

## 2. Rendering Context

负责把卡片内容转成 Anki 可接收的字段内容。

### 职责

- Markdown -> HTML
- 数学公式处理
- 图片与音频处理
- Wikilink 处理
- Obsidian 回链处理
- 高亮与 Cloze 转换
- 生成最终字段值

### 不负责

- 扫描哪些文件
- 判断新增/更新/删除
- 生成 noteId

### 这里的核心问题

- 内容是否保真
- 代码块、公式、高亮等边界是否被破坏
- 媒体是否可上传并正确显示

## 3. Sync Context

负责决定“该如何把卡片同步到 Anki”。

### 职责

- 读取历史同步记录
- 判断新增与更新
- 检测 orphan
- 生成同步计划
- 执行同步动作
- 更新本地同步记录

### 不负责

- 标题块如何识别
- markdown 如何渲染
- 设置 UI

### 这里的核心问题

- 同一张卡如何稳定识别
- 什么情况下是更新
- 什么情况下视为 orphan
- 删除是否自动进行

## 4. Integration Context

负责和外部系统打交道。

### 对 Obsidian

- Vault 文件访问
- MetadataCache
- 当前活动文件
- 命令注册
- 设置页

### 对 Anki

- AnkiConnect 调用
- 创建 deck
- 新增 note
- 更新 note
- 删除 note
- 上传媒体

### 角色定位

这是防腐层，不应该污染领域模型。

## Core Domain / Supporting / Generic

为了防止后续又掉回“大而杂”，建议从战略设计上明确区分：

### Core Domain

- 标题块识别
- 卡片身份生成
- 同步计划生成

### Supporting Subdomains

- Markdown/媒体/链接渲染
- 扫描范围过滤
- orphan 检测
- 同步状态存储

### Generic Subdomains

- 设置页
- 命令注册
- Notice 提示
- JSON 持久化
- HTTP 请求

## 聚合设计建议

不建议在这个项目里设计过多聚合。两个主要聚合已经足够。

## 聚合一：SourceFile Aggregate

聚合根：`SourceFile`

### 包含内容

- 文件路径
- 文件内容
- metadata 快照
- 文件级 deck 信息
- 解析出的标题块
- 解析出的卡片草稿

### 职责

- 在单文件内完成标题块识别
- 保证一个文件中的卡片识别逻辑一致
- 处理文件级 deck 覆盖

### 不应该负责

- Anki noteId
- 全局同步状态
- orphan 判断

## 聚合二：SyncRegistry Aggregate

聚合根：`SyncRegistry`

### 包含内容

- `cardKey -> SyncRecord` 映射
- 历史 noteId
- source hash
- 上次同步时间
- orphan 标记

### 职责

- 管理卡片同步状态生命周期
- 帮助判断新增、更新、orphan
- 与数据持久化边界配合

### 不应该负责

- markdown 渲染
- 标题块切分

## 实体与值对象建议

这里要严格区分 Entity 与 Value Object。

## Entity

### SourceFile

身份由 `filePath` 决定。

### Card

身份由 `cardKey` 决定。

### SyncRecord

身份由 `cardKey` 决定，也可内部持有 `noteId`。

## Value Object

建议作为值对象的内容：

- `CardKey`
- `DeckName`
- `NoteModelName`
- `HeadingLevel`
- `HeadingText`
- `HeadingBlockRange`
- `CardType`
- `RenderedFields`
- `SourceLocation`
- `ContentHash`
- `SyncScope`

## Card 领域对象建议

建议把领域中的 `Card` 明确定义为“标准化同步对象”，而不是随便几段文本。

推荐形状如下：

```ts
type Card = {
  key: CardKey;
  source: SourceLocation;
  type: CardType;
  heading: string;
  bodyMarkdown: string;
  deck: DeckName;
  noteModel: NoteModelName;
  tags: string[];
  fields: Record<string, string>;
  contentHash: ContentHash;
};
```

### 字段意义

- `key`
  - 这张卡在领域中的稳定身份
- `source`
  - 它来自哪个文件、哪个标题位置
- `type`
  - `basic` 或 `cloze`
- `heading`
  - 标题文本
- `bodyMarkdown`
  - 原始正文
- `deck`
  - 最终牌组
- `noteModel`
  - 最终 note type
- `fields`
  - 已经渲染好的 Anki 字段
- `contentHash`
  - 用于判断内容是否变化

### 一个重要原则

`bodyMarkdown` 与 `fields` 不应混为一谈。

前者是原始领域内容，后者是渲染后的派生内容。二者都应有清晰位置。

## Card Draft 建议

为了让解析与渲染解耦，建议先有 `CardDraft`。

```ts
type CardDraft = {
  source: SourceLocation;
  heading: string;
  headingLevel: number;
  type: "basic" | "cloze";
  bodyMarkdown: string;
  deckHint?: string;
};
```

然后由渲染层把 `CardDraft` 转成正式 `Card`。

这样做的好处是：

- 标题识别逻辑和渲染逻辑解耦
- deck 解析、字段映射可以单独演进
- 未来更容易测试

## Card Type 语义建议

当前只保留两类卡。

### Basic

语义建议：

- 标题 -> Front
- 正文 -> Back

### Cloze

语义建议：

- 正文 -> Cloze 主字段
- 标题不进入主 cloze 字段
- 标题可选进入额外字段，比如 `Extra` 或上下文字段

原因：

- 如果标题也拼进 Cloze 主字段，会干扰 Cloze 语义
- 标题更适合做上下文或辅助定位信息

## Note Model 与 Deck 的区别

必须明确区分：

### Note Model

决定 Anki 里字段结构，例如：

- `Basic`
- `Basic (and reversed card)`
- `Cloze`

### Deck

决定卡片进入哪个牌组，例如：

- `English`
- `English::Words`
- `History::Chapter1`

它们是两个完全不同的维度。

因此配置上建议分别建模，而不是混淆。

## Card Identity（cardKey）策略

这是整个系统最敏感的问题之一。

### 目标

`cardKey` 需要尽量满足：

- 同一文件内唯一
- 同一轮扫描内唯一
- 在小幅编辑下尽量稳定
- 不依赖 Anki noteId

### 第一版推荐策略

第一版可以先用较保守的组合：

```ts
cardKey = hash(
  filePath +
  headingLevel +
  headingText +
  blockStartLine +
  cardType
)
```

### 优点

- 实现简单
- 同文件内冲突概率低
- 足够支撑第一版

### 缺点

- 标题改名会影响 key
- 前面插入内容导致行号变化会影响 key
- 文件移动会影响 key

### 未来可升级方向

未来如果需要更稳定，可以考虑：

- 持久化块级 anchor
- 在标题块内植入不可见标识
- 使用内部 source id 映射

### DDD 视角下的建议

不要把 key 生成逻辑散落在代码中，而应抽成一个领域策略：

- `CardIdentityPolicy`

它属于业务规则，不只是技术细节。

## Deck 解析策略

当前建议的 deck 决策顺序：

1. 文件中显式配置的 `TARGET DECK`
2. 插件默认 deck

第一版不做：

- folder -> deck 映射
- 基于路径的 deck 自动推导
- 标题级单独 deck 覆盖

### `TARGET DECK` 的定位

作为保留下来的最小 syntax setting：

- 只保留 `Target Deck Line`
- 不保留 Begin/End Note 等其它语法开关

## 标题级别策略

当前建议默认值：

- `qaHeadingLevel = 4`
- `clozeHeadingLevel = 5`

### 需要保证的业务规则

- 两个级别都允许用户修改
- 两个级别不应相同
- 如果相同，应在配置层校验并阻止

## 扫描范围模型

虽然保留全局扫描，但需要主动收缩边界。

### 推荐配置

```ts
type ScanScopeConfig = {
  includeFolders: string[];
  excludeFolders: string[];
};
```

### 推荐行为

- `includeFolders` 为空：扫描全部 Markdown 文件
- `includeFolders` 非空：只扫描这些文件夹下的 Markdown 文件
- `excludeFolders` 永远对候选集做排除

### 第一版不做

- 任意 glob
- 单文件模式表达式
- ignore 语法 DSL
- 复杂优先级覆盖规则

## Sync Record 建议

本地同步状态建议保存为独立模型。

```ts
type SyncRecord = {
  cardKey: string;
  noteId: number;
  filePath: string;
  sourceHash: string;
  lastSyncedAt: number;
  orphan: boolean;
};
```

### 字段说明

- `cardKey`
  - 领域卡片身份
- `noteId`
  - Anki 中对应 note 的 id
- `filePath`
  - 便于追踪来源与调试
- `sourceHash`
  - 判断是否发生变化
- `lastSyncedAt`
  - 便于调试和排错
- `orphan`
  - 表示当前扫描未再找到对应来源

## 为什么建议先不做自动删除

虽然同步系统中“删除失效卡片”看起来合理，但第一版不建议直接做自动删除。

### 原因

- 标题改名会被误判为删除旧卡、创建新卡
- 文件移动可能导致 key 变化
- 扫描范围变窄时可能导致误判 orphan
- 用户切换设置后，候选卡集合可能临时变化
- 删除是破坏性动作，风险高

### 第一版建议

- 支持新增
- 支持更新
- 支持 orphan 检测
- 支持手动清理 orphan 的未来扩展点
- 默认不自动删 Anki 卡

## 建议的领域服务

以下领域服务是比较关键的。

## 1. CardExtractionService

### 输入

- `SourceFile`
- `HeadingPolicy`

### 输出

- `CardDraft[]`

### 负责

- 找到有效标题
- 切分正文块
- 判断 `basic` / `cloze`

## 2. DeckResolutionService

### 输入

- 文件级 `TARGET DECK`
- 插件默认 deck
- 卡片配置

### 输出

- `DeckName`

### 负责

- 决定卡片最终牌组

## 3. CardIdentityService

### 输入

- `SourceLocation`
- 标题信息
- 卡片类型

### 输出

- `CardKey`

### 负责

- 生成稳定 identity

## 4. CardRenderingService

### 输入

- `CardDraft`

### 输出

- `Card`

### 负责

- 生成最终字段
- 处理 Markdown/媒体/链接/公式

## 5. SyncPlanningService

### 输入

- 当前扫描得到的 `Card[]`
- 历史 `SyncRecord[]`

### 输出

- `SyncPlan`

### 负责

- 判断 add
- 判断 update
- 判断 orphan

这个服务是整个同步系统的关键，必须单独存在，不应散落在命令或 UI 层中。

## Sync Plan 建议

推荐把同步规划显式建模出来。

```ts
type SyncPlan = {
  toCreateDecks: string[];
  toAdd: Card[];
  toUpdate: Array<{ card: Card; noteId: number }>;
  toMarkOrphan: SyncRecord[];
};
```

### 第一版动作集合建议

第一版先只做：

- `createDeck`
- `add`
- `update`
- `markOrphan`

不做：

- `delete`

## Application Service / Use Case 建议

DDD 中应用服务负责“编排用例”，不承担核心业务规则。

## 1. ScanAndPlanSyncUseCase

### 流程

1. 读取扫描范围
2. 收集候选文件
3. 从文件解析 `CardDraft`
4. 渲染为 `Card`
5. 读取历史 `SyncRecord`
6. 生成 `SyncPlan`

## 2. ExecuteSyncPlanUseCase

### 流程

1. 创建缺失 deck
2. 上传媒体
3. 新增 cards
4. 更新 cards
5. 更新同步状态
6. 标记 orphan

## 3. SyncCurrentFileUseCase

### 流程

只对当前文件执行完整扫描与同步流程。

## 4. SyncVaultUseCase

### 流程

对扫描范围内的文件执行完整扫描与同步流程。

## 5. PreviewSyncUseCase（未来可选）

### 流程

只生成同步计划，不真正执行。

### 价值

- 调试
- 风险确认
- 后续做 UI 预览

## Repository 建议

Repository 主要是持久化边界，不是业务逻辑本身。

## 1. SyncRegistryRepository

### 负责

- 读取同步记录
- 保存同步记录
- upsert 卡片同步状态
- 标记 orphan

### 可能的存储位置

- 插件 `data.json`

## 2. PluginConfigRepository

### 负责

- 读取插件配置
- 输出面向领域的配置对象

### 注意

不要让领域层直接消费 Obsidian 原始 Setting UI 数据结构。

## 3. ScanScopeRepository（可选）

如果未来扫描配置较复杂，可以单独抽象。

## Anti-Corruption Layer（防腐层）建议

这个项目非常需要防腐层，否则外部 API 会把领域污染掉。

## 对 Obsidian 的防腐层

不要让领域层直接依赖：

- `App`
- `TFile`
- `CachedMetadata`

建议由基础设施层封装为：

- `ObsidianVaultGateway`
- `ObsidianMetadataGateway`
- `ObsidianWorkspaceGateway`

然后向应用层提供干净 DTO。

## 对 AnkiConnect 的防腐层

不要让领域层直接拼 action JSON。

建议封装为：

- `AnkiGateway`

对外提供的方法应是业务语义，而不是裸 `invoke("addNote")`：

- `ensureDeckExists`
- `addNote`
- `updateNote`
- `deleteNotes`
- `storeMedia`

## 领域不变量建议

这些不变量建议尽早确立。

### 卡片识别相关

- 一个标题块最多生成一张卡
- 一张卡必须属于且只属于一种 `CardType`
- 同一次扫描内 `cardKey` 不可重复

### 配置相关

- 问答题级别和填空题级别不能相同
- 每张卡必须解析出 deck
- 每张卡必须解析出 note model

### Basic / Cloze 相关

- `basic` 必须有 front/back 字段映射
- `cloze` 必须映射到支持 cloze 的 note model

### 同步相关

- 一个 `cardKey` 只能对应一个活动同步记录
- 一个 `noteId` 不应对应多个不同 `cardKey`
- orphan 默认不能自动删除

## 建议的目录结构

如果未来真的开工，建议从一开始就按边界建目录，而不是继续堆在 `main.ts` 和工具函数里。

```text
src/
  domain/
    card/
      entities/
      value-objects/
      services/
      policies/
    sync/
      entities/
      value-objects/
      services/
    shared/
      value-objects/
  application/
    use-cases/
    dto/
  infrastructure/
    obsidian/
    anki/
    persistence/
  presentation/
    commands/
    settings/
    notices/
```

可以进一步细化为：

```text
src/domain/card/entities/Card.ts
src/domain/card/entities/SourceFile.ts
src/domain/card/value-objects/CardKey.ts
src/domain/card/value-objects/DeckName.ts
src/domain/card/value-objects/SourceLocation.ts
src/domain/card/services/CardExtractionService.ts
src/domain/card/services/CardRenderingService.ts
src/domain/card/policies/CardIdentityPolicy.ts

src/domain/sync/entities/SyncRecord.ts
src/domain/sync/entities/SyncRegistry.ts
src/domain/sync/services/SyncPlanningService.ts

src/application/use-cases/SyncCurrentFileUseCase.ts
src/application/use-cases/SyncVaultUseCase.ts
src/application/use-cases/ScanAndPlanSyncUseCase.ts
src/application/use-cases/ExecuteSyncPlanUseCase.ts

src/infrastructure/obsidian/ObsidianVaultGateway.ts
src/infrastructure/obsidian/ObsidianMetadataGateway.ts
src/infrastructure/anki/AnkiConnectGateway.ts
src/infrastructure/persistence/DataJsonSyncRegistryRepository.ts

src/presentation/commands/registerCommands.ts
src/presentation/settings/PluginSettingTab.ts
src/presentation/notices/NoticeService.ts
```

## 需要保留和重写的部分

这是从两个旧仓库中提炼出的结论。

## 可以借鉴的方向

### 来自 `AnkiHelperForCoding`

- 聚焦标题级工作流
- 批处理与增量处理思路
- 与 Obsidian 工作流贴近的命令设计

### 来自 `obsidian-to-anki-plugin-forCoding`

- AnkiConnect 通信层思路
- Markdown/链接/媒体/公式转 Anki 的处理经验
- 媒体上传与 deck 创建
- 同步状态管理经验

## 必须重写的部分

- 领域模型
- 卡片解析流程
- 同步计划生成方式
- 配置模型
- 扫描范围模型
- 旧仓库里与通用语法平台强耦合的部分

## 第一版建议做什么

虽然当前阶段不是立即开发，但为了将来回头时不迷失，仍建议记录“第一版的可交付边界”。

### 第一版建议包含

- 标题段落式卡片解析
- `H4` 问答题、`H5` 填空题默认配置
- 标题级别可配置
- `Basic` / `Cloze` 两类卡片
- `qaNoteType` / `clozeNoteType` 可配置
- 默认 deck
- 文件级 `TARGET DECK`
- 全局扫描
- include/exclude 文件夹
- 增量同步
- deck 创建
- note 新增
- note 更新
- 媒体上传
- markdown/html 转换
- Obsidian 回链
- orphan 检测（不自动删）

## 第一版明确不做什么

- 自定义正则系统
- inline note
- begin/end note 语法体系
- folder -> deck 映射
- folder -> tag 映射
- 双向同步
- Anki -> Obsidian 回写
- Python CLI
- 自动删除 orphan 对应 Anki 卡片
- 复杂 glob 系统

## 风险点与尚未完全拍板的问题

虽然方向已经清楚，但仍有一些点需要在未来真正开工前再确认。

## 1. `cardKey` 稳定性

当前推荐方案足以起步，但并不完美。

需要后续根据实际使用情况决定：

- 是否接受标题改名导致新卡
- 是否接受文件移动导致重建
- 是否需要更稳定的内部 source id

## 2. Cloze 标题是否写入字段

当前倾向是：

- Cloze 主字段只放正文
- 标题作为上下文信息另放

但这一点未来仍可在使用体验上再验证。

## 3. orphan 的后续处理策略

当前明确是：

- 先检测
- 先标记
- 不自动删

未来是否要加“手动清理 orphan”，可以再评估。

## 4. 媒体处理边界

第一版建议保留图片和音频支持，但需要注意：

- 不同格式是否都支持
- 文件定位是否稳定
- 上传后是否做重复检测

## 5. 渲染保真度边界

需要明确接受一个现实：

- 不可能一开始就 100% 复刻 Obsidian 显示效果

更现实的目标是：

- 保证常用内容结构可读、可复习
- 保证不轻易破坏数学、代码和媒体

## 未来扩展方向

以下方向可以保留想法，但不应现在就进第一版边界。

### 1. 预览同步计划

在真正同步前，让用户看到：

- 将新增几张
- 将更新几张
- 哪些是 orphan

### 2. 当前标题同步

相较于当前文件同步，进一步细化到只同步当前标题块。

### 3. 手动 orphan 清理

用户明确确认后，删除失效 Anki 卡片。

### 4. 更稳定的 card identity

引入块级 anchor 或内部 source id。

### 5. 更多上下文字段

例如：

- 文件名
- 标题路径
- Obsidian 链接
- 上级标题

## 结论

当前讨论已经形成一个较稳定的产品方向：

- 这是一个新的、聚焦“标题段落式做卡”的 Obsidian -> Anki 插件
- 它借鉴旧项目经验，但不继承旧项目的通用框架定位
- 它明确以 Obsidian 为唯一真源
- 它只做单向同步
- 它保留强同步能力、保留较高内容保真度、保留全局扫描
- 它主动砍掉通用语法平台、folder 映射、Python 旁路、双向同步与自动删除等高复杂度设计

从 DDD 视角看，真正应被认真设计的核心只有三件事：

1. 如何把标题块稳定识别为领域卡片
2. 如何生成尽量稳定的卡片身份
3. 如何在不失控的前提下生成和执行同步计划

只要这三点做对，未来无论是否真的开工，这个插件的方向都不会再轻易漂移。

## 建议的下一步（未来恢复此 idea 时）

当未来决定真正开始做这个插件时，建议按下面顺序继续：

1. 先把 `Card`、`CardDraft`、`SyncRecord` 的精确定义拍板
2. 再拍板 `cardKey` 策略
3. 再定义 `Basic` / `Cloze` 的字段映射策略
4. 再实现 `CardExtractionService`
5. 再实现 `CardRenderingService`
6. 再实现 `SyncPlanningService`
7. 最后接 Obsidian UI 与 AnkiConnect 集成

在真正动手写代码之前，都不要跳过前面三个建模步骤。
