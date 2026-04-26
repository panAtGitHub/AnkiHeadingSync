# Card Deck Settings Regroup Decisions

## 1. Deck 卡标题与分组结构

Deck 卡最终标题固定为：

1. 中文：`卡片牌组设置`
2. 英文：`Card deck settings`

卡片内容固定分为 3 个小分组：

1. `1，推荐用「文件夹及文件名」作为「Anki牌组」`
2. `2，可打开「文件级自定义牌组」，作为个性化定制`
3. `3，默认牌组作为兜底`

每组分别承载：

1. 第 1 组：文件夹映射模式 + 两条映射示例
2. 第 2 组：文件级自定义牌组开关 + 条件展开项
3. 第 3 组：默认牌组输入 + 新兜底说明 + 最终优先级说明

## 2. 中文牌组文案规范

本次对中文 Deck 设置文案统一采用：

1. `牌组`
2. `牌组模板`
3. `牌组声明`
4. `文件夹映射牌组`

不翻译的技术值包括：

1. `folderDeckMode`
2. `off`
3. `folder`
4. `folder-and-file`
5. `yaml`
6. `body`
7. `TARGET DECK`

## 3. 默认 `folderDeckMode` 决策

新的默认行为固定为：

1. `DEFAULT_SETTINGS.folderDeckMode = "folder-and-file"`

由此带来的兼容性行为固定为：

1. 新安装用户默认就是 `folder-and-file`
2. legacy settings 缺失该字段时，通过 `mergePluginSettings()` 自动落到 `folder-and-file`
3. 已显式保存 `folderDeckMode` 的老用户保持原值不变

## 4. 保持不变的内容

本次明确不改：

1. deck resolution 顺序
2. 文件级牌组解析逻辑
3. 文件夹映射计算逻辑
4. 设置字段名与枚举值
5. 同步流程
6. `build:obsidian` 的安全复制约束

## 5. 与计划的显式偏差

没有行为偏差。

实现层面唯一说明是：

1. 现有 `build:obsidian` 已通过安全脚本复制 built plugin 文件
2. 因此最终同步直接复用仓库现有流程