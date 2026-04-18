# Deck 解析与同步落地计划

## 文档目的

本文档用于指导 GitHub Agent 直接实现新插件中的 deck 解析、优先级决策、同步行为与测试。
本计划只覆盖 deck 相关能力，不扩展到 note type、字段映射、模板编辑、身份迁移等其他模块。

## 实现约束

本计划必须基于当前新插件的 manual-sync 主链路实现，不允许回到旧的 legacy 同步链路。

本轮实现时，接入点固定为：

1. 文件级 deck 提取：`CardIndexingService`
2. deck 优先级解析：`RenderConfigService` 或新增的 `DeckResolutionService`
3. diff 规划：`DiffPlannerService`
4. 同步执行：`ManualSyncService` 与 `AnkiBatchExecutor`
5. 结果与 warning 汇总：manual-sync 结果对象

本轮不要修改或重新启用以下旧链路作为主实现入口：

1. `CardDraft / Card` 旧实体链路
2. `ScanAndPlanSyncUseCase`
3. `ExecuteSyncPlanUseCase`

如果实现时发现旧链路中也有 deck 逻辑，只允许最小限度保持兼容，不允许把本轮 deck 需求主要落在旧链路里。

## 一、范围

### 本轮要实现

1. 全局默认 deck，作为兜底值
2. 文件夹路径映射为 Anki 多级父子牌组
3. 文件级显式 deck，支持 YAML 与正文 `TARGET DECK`
4. deck 解析优先级与冲突处理
5. deck 规范化与合法性校验
6. deck 结果进入同步链路
7. deck 创建能力
8. 相关单元测试与集成测试

### 本轮不实现

1. folder -> tag 映射
2. 同文件多 deck 分配
3. 标题级 deck 覆盖
4. deck 模板 DSL
5. deck 自动迁移 UI
6. deck 历史兼容迁移工具

## 二、最终规则

### 2.1 deck 优先级

最终解析优先级固定为：

1. 文件级显式 deck
2. 文件夹映射 deck
3. 全局默认 deck

只要上层解析成功，下层不再参与。

### 2.2 文件级显式 deck 来源

支持两种来源。

#### YAML

建议字段名固定为：

```yaml
targetDeck: 数学::第一章
```

#### 正文

支持两种语法：

```text
TARGET DECK
数学::第一章
```

或

```text
TARGET DECK: 数学::第一章
```

### 2.3 文件级冲突处理

如果 YAML 与正文同时存在 deck 配置：

1. 两者相同，正常通过
2. 两者不同，视为冲突

冲突时的规则固定为：

1. 报出明确错误或 notice
2. 同步该文件时，先按 YAML 的值建立 deck 并继续作为最终 deck
3. 输出冲突告警，提示用户清理正文或 YAML 中的重复配置

也就是说：

- 结果上，YAML 优先
- 体验上，要明确提示冲突

### 2.4 文件夹映射规则

#### 路径到 deck 的映射

Obsidian 文件路径示例：

`课程/数学/第一章/导数.md`

对应的 Anki deck：

`课程::数学::第一章`

规则是：

1. 取文件所在文件夹路径
2. 用文件夹层级生成 deck
3. 路径分隔符统一转换成 `::`
4. 文件名本身不进入 deck

#### 根目录文件

如果文件直接位于 vault 根目录，没有任何父文件夹层级，则文件夹映射结果为空。

此时直接回退到全局默认 deck。

### 2.5 文件夹名中的 `::`

第一版规则固定为：

- 文件夹映射模式下，源文件夹名里若包含 `::`，直接报错
- 不自动转义
- 不自动替换
- 不静默继续

原因是 `::` 在 Anki 中就是子牌组语义，混入原始文件夹名会产生歧义。

### 2.6 deck 规范化

无论 deck 来自 YAML、正文还是文件夹映射，都必须先做规范化。

规范化规则固定为：

1. trim 首尾空格
2. 连续的空层级去掉
3. 清理首尾 `:` 与空片段
4. 文件夹路径分隔符统一转成 `::`
5. 结果为空时视为无效 deck
6. 最终统一输出标准 deck 字符串

示例：

`数学/第一章/ `

规范化后：

`数学::第一章`

## 三、同步语义

### 3.1 deck 是否参与 update

本轮明确规则：

- deck 会参与新增卡片时的创建
- deck 不参与旧卡的自动移动

也就是：

1. 新卡 add 时写入当前解析出的 deck
2. 已存在 note 的 update 不因为 deck 变化而自动 changeDeck
3. 文件移动、文件夹调整、默认 deck 改变、文件级 deck 改变，都不会主动把旧卡迁移到新 deck

实现级硬约束：

1. deck 变化不能单独触发已有 note 进入 `toUpdate`
2. 旧卡 update 路径中禁止因为 resolved deck 变化而执行 `changeDeck`
3. `changeDeck` 只允许用于未来单独的 deck 迁移模块，本轮主链路中不启用
4. 新卡 `toCreate` 时，必须使用本轮解析出的最终 `resolvedDeck`

### 3.2 原因

本轮按你的确认执行：

- 文件级 deck 最高
- 旧卡不做自动移动
- 先把 deck 解析逻辑与创建行为做稳
- 避免 deck 规则调整后批量移动旧卡带来不可预期后果

### 3.3 后续可扩展方向

后续如果需要，可单独新增：

- `syncDeckOnUpdate`
- `moveExistingNotesToResolvedDeck`
- 显式的 deck 迁移命令

但本轮不做。

## 四、领域与应用层设计

### 4.1 新增值对象

建议新增：

```ts
type DeckResolutionSource = "frontmatter" | "body" | "folder" | "default";

type ResolvedDeck = {
  value: string;
  source: DeckResolutionSource;
};

type DeckResolutionWarningCode =
  | "deck_conflict_yaml_body"
  | "deck_multiple_body_declarations"
  | "deck_invalid_folder_segment"
  | "deck_fallback_default";

type DeckResolutionWarning = {
  filePath: string;
  code: DeckResolutionWarningCode;
  message: string;
};
```

### 4.2 新增服务

建议新增或完善：

#### DeckNormalizationService

职责：

1. 规范化 deck 字符串
2. 校验 deck 是否为空
3. 校验文件夹映射下是否含非法 `::`

#### DeckExtractionService

职责：

1. 从 YAML 读取 `targetDeck`
2. 从正文读取 `TARGET DECK`
3. 输出显式 deck 结果与冲突信息
4. 不直接决定最终优先级，只负责“显式 deck 来源提取”

#### FolderDeckMappingService

职责：

1. 根据文件所在文件夹生成 deck
2. 仅使用文件夹层级，不含文件名
3. 把 `/` 映射为 `::`

#### DeckResolutionService

职责：

1. 聚合 YAML、正文、文件夹映射、全局默认 deck
2. 按优先级输出唯一 `ResolvedDeck`
3. 在 YAML 与正文冲突时：
   - 记录冲突
   - 以 YAML 为准输出最终结果
4. 统一输出结构化 warnings

### 4.3 输入输出建议

```ts
type DeckResolutionInput = {
  filePath: string;
  vaultRelativeFolderPath: string | null;
  frontmatterDeck?: string;
  bodyDeck?: string;
  defaultDeck: string;
};

type DeckResolutionResult = {
  resolvedDeck: ResolvedDeck;
  warnings: DeckResolutionWarning[];
};
```

## 五、配置模型

### 5.1 保留配置

```ts
type PluginSettings = {
  defaultDeck: string;
  includeFolders: string[];
  excludeFolders: string[];
  // 其他已有字段省略
};
```

### 5.2 默认 deck 继续必填

第一版继续要求 `defaultDeck` 为必填配置，不引入“允许为空”的新语义。

原因：

1. 根目录文件的文件夹映射可能为空
2. 文件级 deck 可能缺失
3. 保持当前设置校验与 UI 语义稳定

也就是说：

- 本轮不改变 `defaultDeck is required` 的现有约束
- deck 解析最终必须总能回落到一个非空默认 deck
### 5.3 不新增复杂配置

本轮不增加：

1. folder -> deck 映射表
2. deck 模板表达式
3. deck 来源优先级自定义
4. per-card deck override 规则

## 六、解析细节

### 6.1 YAML 解析

固定读取：

```yaml
targetDeck: 数学::第一章
```

第一版不做多个 YAML 别名字段。

### 6.2 正文解析

固定支持：

```text
TARGET DECK
数学::第一章
```

和

```text
TARGET DECK: 数学::第一章
```

正文只取第一个合法声明。
如果出现多个正文 deck 声明，建议直接报 warning，并只使用第一个。

正文解析补充约束：

1. 正文中的 `TARGET DECK` 只允许按文件级声明理解，不支持按标题块局部覆盖
2. fenced code block 内的 `TARGET DECK` 必须忽略
3. 多个正文声明不报错中断同步，但必须输出结构化 warning

### 6.3 文件夹路径提取

对于文件：

`课程/数学/第一章/导数.md`

文件夹映射输入应为：

`课程/数学/第一章`

输出：

`课程::数学::第一章`

## 七、同步执行层改动

### 7.1 新卡创建

`toAdd` 中的卡片，必须使用 `ResolvedDeck.value` 作为最终 deck。

如果 deck 不存在：

- 调用 `ensureDeckExists`
- 再执行 `addNote`

### 7.2 旧卡更新

`toUpdate` 中的卡片：

- 只更新字段
- 不自动移动 deck

补充实现要求：

1. 当前 manual-sync 链路下，旧卡 deck 变化不能仅因为 `deck` 改变而进入 `toUpdate`
2. `renderConfigHash` 不得因为 `deck` 变化而导致旧卡进入 update
3. `AnkiBatchExecutor` 的 update 路径中，不得执行基于 resolved deck 的 `changeDeck`
4. 如果当前代码中仍保留 update -> `changeDeck` 逻辑，本轮必须移除或显式短路掉

### 7.3 冲突告警

如果某文件存在 YAML 与正文 deck 冲突：

- 同步继续
- 最终使用 YAML deck
- 输出 warning 或 notice
- 结果中要能看到该告警

### 7.4 warning 传递链路

本轮不要只在底层 `console` 或临时 `Notice` 中输出 warning，必须保留结构化结果，便于上层汇总展示和测试。

建议传递方式固定为：

1. 文件索引阶段输出文件级 warnings
2. `ManualSyncService` 汇总本次同步范围内的所有 warnings
3. 最终同步结果对象中包含 `warnings: DeckResolutionWarning[]`
4. UI 层可再决定是否额外转成 notice

也就是说：

- warning 先是结构化结果
- notice 只是展示形式，不是唯一载体

### 7.5 deck 数据模型命名

为避免“提取结果”和“最终结果”混淆，本轮建议明确区分两类字段：

1. `explicitDeckHint`
   表示文件显式 deck，仅来自 YAML 或正文
2. `resolvedDeck`
   表示最终用于同步的 deck，已经过优先级决策

如果实现时不想大改现有类型命名，至少也要在代码注释和测试命名中保持这个语义区分，避免把 folder deck/default deck 也混进 `deckHint` 的含义里。

## 八、UI 与用户提示

### 8.1 设置页

至少要有：

1. `defaultDeck` 输入框
2. 说明文案，明确 deck 优先级：
   - 文件级 deck
   - 文件夹映射 deck
   - 全局默认 deck

### 8.2 用户提示文案建议

#### 文件级冲突

`检测到同一文件同时在 YAML 和正文中声明了不同的 TARGET DECK，本次已按 YAML 值同步，请清理冲突配置。`

#### 非法文件夹名

`检测到文件夹名包含 ::，无法安全映射为 Anki 子牌组，请修改文件夹名。`

#### fallback 到默认 deck

`该文件没有显式 deck，且所在位置无法生成文件夹牌组，已回退到默认 deck。`

## 九、测试计划

### 9.1 DeckNormalizationService

覆盖：

1. trim 首尾空格
2. `/` 转 `::`
3. 清理空层级
4. 空 deck 报错
5. 文件夹映射模式下 `::` 非法报错

### 9.2 DeckExtractionService

覆盖：

1. 只存在 YAML
2. 只存在正文单行语法
3. 只存在正文双行语法
4. YAML 与正文相同
5. YAML 与正文不同
6. 正文多个 TARGET DECK，只取第一个并 warning

### 9.3 FolderDeckMappingService

覆盖：

1. 多级文件夹映射
2. 单级文件夹映射
3. 根目录文件返回空
4. 文件夹名带 `::` 报错

### 9.4 DeckResolutionService

覆盖：

1. 文件级 deck 覆盖文件夹 deck
2. 文件夹 deck 覆盖默认 deck
3. 根目录文件回退默认 deck
4. YAML 与正文冲突时：
   - 结果取 YAML
   - warning 正确输出

### 9.5 manual-sync 链路回归测试

覆盖：

1. 新卡使用 `resolvedDeck` 创建
2. 旧卡仅 deck 变化时，不进入 `toUpdate`
3. 旧卡仅 deck 变化时，不触发 `changeDeck`
4. 旧卡正文变化且 deck 不变时，正常 update
5. YAML 与正文冲突时，warning 能沿链路出现在最终 sync result 中
6. 根目录文件无显式 deck 时，回退到必填的 `defaultDeck`
### 9.6 同步用例

覆盖：

1. 新卡使用解析出的 deck 创建
2. 缺失 deck 时使用默认 deck
3. deck 不存在时先创建 deck 再 add
4. 旧卡 update 不自动 changeDeck
5. 文件移动后，旧卡仍不自动迁移 deck
6. 文件级 deck 改变后，旧卡仍不自动迁移 deck

## 十、GitHub Agent 实施顺序

### 阶段 1：审查当前实现

检查：

1. 当前默认 deck 的保存位置
2. 当前 `TARGET DECK` 的解析逻辑
3. 当前同步 add / update 是否已经区分 deck 行为
4. 当前是否存在 folder deck 映射雏形

输出：

`docs/deck-resolution-gap-report.md`

### 阶段 2：锁定决策

写入：

`docs/deck-resolution-decisions.md`

至少写清：

1. 优先级
2. YAML 冲突处理
3. 文件夹映射规则
4. 根目录 fallback
5. update 不自动移动 deck

### 阶段 3：实现服务层

新增或修改：

1. `DeckNormalizationService`
2. `DeckExtractionService`
3. `FolderDeckMappingService`
4. `DeckResolutionService`

### 阶段 4：接入同步链路

修改：

1. `CardIndexingService`
2. `RenderConfigService` 或新增 `DeckResolutionService`
3. `DiffPlannerService`
4. `ManualSyncService`
5. `AnkiBatchExecutor`
6. `AnkiGateway.ensureDecks(...)` / `ensureDeckExists(...)`

不要把主实现落到旧的 `ScanAndPlanSyncUseCase / ExecuteSyncPlanUseCase` 链路里。

### 阶段 5：补测试与验证

执行：

```bash
npm test
npm run build
npm run lint
```

## 十一、最终成功标准

满足以下条件即视为完成：

1. 文件级显式 deck 生效
2. 文件夹可自动映射为 Anki 多级父子牌组
3. 根目录文件正确回退到默认 deck
4. YAML 与正文冲突时，YAML 生效且有告警
5. 旧卡 update 不自动移动 deck
6. 所有关键路径都有测试覆盖
7. build、test、lint 通过
