# Module 5 Gap Report

## 审查范围

本报告只审查与模块 5 直接相关的实现：

1. deck 配置模型
2. 设置页 deck UI
3. 文件级 deck 解析
4. 文件夹 deck 映射
5. manual-sync 主链路中的最终 deck 解析
6. warning 透传
7. deck 模板插入能力

## 当前实现与模块 5 计划的主要差距

### 1. 配置模型缺字段

当前 `PluginSettings` 只保留了：

1. `defaultDeck`
2. 范围过滤配置
3. 其他同步与字段映射配置

缺少模块 5 需要的：

1. `fileDeckEnabled`
2. `fileDeckMarker`
3. `fileDeckTemplate`
4. `fileDeckInsertLocation`
5. `folderDeckMode`

### 2. 设置页未实现“显式 deck 模式选择”

当前设置页只有 `Default deck` 文案增强，但没有：

1. 文件级自定义牌组开关
2. 识别名输入
3. 默认模板输入
4. 插入位置单选
5. 向当前文件插入 deck 模板入口
6. 文件夹映射三态选择与示例说明
7. 最终优先级说明区块

### 3. 文件级 deck 解析仍然写死

当前 deck 提取实现仍然固定写死：

1. YAML key 固定 `targetDeck`
2. 正文 marker 固定 `TARGET DECK`

这与模块 5 要求的“YAML key 与正文 marker 统一使用用户配置的 `fileDeckMarker`”不一致。

### 4. 文件级 deck 没有按开关启停

当前 deck 解析总是启用。
模块 5 要求：

1. `fileDeckEnabled = false` 时不解析 YAML
2. `fileDeckEnabled = false` 时不解析正文

### 5. 文件夹映射模式不完整

当前只有一种隐式文件夹映射，等价于“父文件夹映射”。
缺少：

1. `off`
2. `folder`
3. `folder-and-file`

同时当前非法路径片段处理是抛错硬失败，而模块 5 要求：

1. 产出 `deck_invalid_folder_segment` warning
2. 放弃映射
3. 回退到 `defaultDeck`

### 6. 没有 deck 模板插入能力

当前仓库不存在“向当前文件插入 deck 模板”的能力，也没有相关命令或设置页操作入口。

### 7. 同步链路已有 warning 透传，但未覆盖模块 5 的新模式行为

当前 warning 结果对象已存在，但：

1. 还没有 fileDeck 开关影响解析的测试
2. 还没有 marker 改名后的 YAML / 正文解析测试
3. 还没有 `folder-and-file` 模式测试
4. 还没有 invalid folder segment 回退 default 的 warning 测试
5. 还没有 deck 模板插入测试

## 兼容与边界判断

模块 5 明确要求：旧卡行为保持当前实现，不在本模块内改写旧卡 deck update 语义。

因此本轮不能回退到更早的 deck 迁移语义，也不能新增新的 old-card deck migration 逻辑。

## 本轮修复边界

本轮只补齐模块 5 明确要求：

1. deck 模式配置
2. deck 解析按配置启停
3. 可配置 marker
4. 文件夹映射三态
5. deck 模板插入
6. warning 继续沿 manual-sync 结果透传
7. 与当前 old-card 行为兼容的回归测试

不扩展到：

1. deck 迁移模块
2. 模板 DSL 扩展
3. 标题级 deck override
4. 手工 folder -> deck 映射表