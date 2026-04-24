# 设置页卡片化实现决策

本文锁定本轮“设置页卡片化 + 局部刷新 + 设置驱动卡片识别配置”任务的仓库兼容实现路径。

## 1. 新配置结构

- 在 `PluginSettings` 中新增统一识别配置：`cardTypeConfigs`
- 结构使用固定 key 的对象，而不是自由数组，key 固定为：
  - `basic`
  - `qa-group`
  - `cloze`
  - `semantic-qa`
- 每行配置至少包含：
  - `enabled`
  - `headingLevel`
  - `extraMarker`
  - `noteType`

## 2. 与旧字段的兼容策略

- 旧字段继续保留在 `PluginSettings` 中，避免影响未改造完的调用点与历史数据读取：
  - `qaHeadingLevel`
  - `clozeHeadingLevel`
  - `qaGroupMarker`
  - `semanticQaMarker`
  - `qaNoteType`
  - `clozeNoteType`
  - `semanticQaNoteType`
- 读取旧数据时：
  - 若没有 `cardTypeConfigs`，则由旧字段即时构建默认的 4 行配置
- 保存时：
  - 以 `cardTypeConfigs` 为真源
  - 同步回写旧字段，作为兼容镜像
- `noteFieldMappings` 继续保留并复用，不迁移成新的独立字段结构

## 3. QA Group 行的处理

- QA Group 12 继续走现有托管模型链路
- 表格中该行显示托管 note type / 托管字段，不进入普通字段映射保存流程
- `noteFieldMappings` 只继续服务：
  - `basic`
  - `cloze`
  - `semantic-qa`

## 4. 识别匹配规则

- 运行时不再直接依赖 `qaHeadingLevel/clozeHeadingLevel` 分派类型
- 改为对当前标题按 `cardTypeConfigs` 做匹配：
  - 仅考虑 `enabled = true` 且 `headingLevel` 命中的行
  - 先尝试匹配 `extraMarker` 非空且标题以该 marker 结尾的行
  - 没有 marker 命中时，再使用同级空 `extraMarker` 行作为默认回退
- 若多个非空 marker 都命中：
  - 采用“marker 更长者优先”，再按固定行顺序稳定决策
- 固定顺序为：
  - `qa-group`
  - `semantic-qa`
  - `cloze`
  - `basic`
- 这样能保持现有“特殊类型优先于普通 QA”的直觉，并减少 marker 前后缀重叠时的误判。

## 5. 冲突校验

- 保存时校验：同一 `headingLevel` 下，启用行里最多只允许一个空 `extraMarker`
- 若冲突：
  - 阻止这次保存
  - 第一张卡片内显示错误
- 本轮不额外增加“同级相同非空 marker 禁止保存”的新产品规则，避免超出任务合同

## 6. 设置页渲染架构

- `display()` 只负责：
  - 初始化页面标题
  - 创建 5 张卡片的稳定外壳
  - 首次渲染每张卡片 body
- 卡片外壳只创建一次；后续普通交互不再整页 `display()`
- 每张卡片独立拥有：
  - header
  - body 容器
  - render 方法
- 卡片展开状态仅存于 `PluginSettingTab` 实例内
- 默认展开：
  - 卡片 1
  - 卡片 5
- 默认折叠：
  - 卡片 2
  - 卡片 3
  - 卡片 4

## 7. 局部刷新策略

- card 1：Anki 模板加载、表格行编辑、错误状态，仅刷新 card 1 body
- card 2：同步内容相关设置，仅刷新 card 2 body
- card 3：scope mode 切换刷新 card 3；文件夹展开/勾选优先只刷新 tree region
- card 4：deck 开关和 deck 文本输入，仅刷新 card 4 body
- card 5：纯展示，首次渲染后通常不刷新
- 若必须做整页重建：
  - 记录 scrollTop
  - 重建后恢复 scrollTop

## 8. debounce 策略

- 所有文本输入改为 debounce 自动保存
- 统一目标为 500ms
- debounce 只用于文本输入：
  - marker
  - backlink label
  - default deck
  - file deck marker
  - file deck template
  - Anki URL 高级项
- toggle 与 dropdown 继续即时保存

## 9. Anki 模板加载策略

- card 1 提供一个统一按钮：`手动读取 Anki 里的模板配置`
- 点击后：
  - 加载全部 note models
  - 再为当前 4 行里已选 note type 拉取字段详情（QA Group 行跳过）
- 加载状态仅作用于 card 1
- 字段未加载前，字段列显示稳定占位项，不让表格高度大幅波动

## 10. 文件夹树策略

- 保留现有 folder tree 缓存字段
- 首次只在以下任一条件成立时加载：
  - card 3 被展开
  - scopeMode 从 `all` 切到 `include/exclude`
- 新增 card 3 的局部“刷新文件夹列表”按钮
- 刷新按钮只清空 folder tree 缓存并重载 card 3，不触发整页重建

## 11. 命令说明卡片

- 直接展示当前命令注册中的 5 个命令名称与说明
- 不在本轮新增或修改命令行为

## 12. 测试策略

- 设置页测试以“渲染壳层稳定 + body 局部刷新”为核心
- 若真实滚动断言在当前 fake DOM 中不稳：
  - 用 `display()` 调用次数 / root `empty()` 调用次数作为抗飘代理断言
- 识别测试放在 `CardIndexingService` 与设置模型测试中：
  - 禁用类型不识别
  - marker 优先
  - 空 marker 回退
  - 空 marker 冲突阻止保存
  - 旧设置迁移保持行为

## 13. 有意偏离点

- 任务合同要求“表格真正驱动运行时识别”，这里采用“新识别配置驱动运行时，旧字段仅做兼容镜像”的路径，而不是彻底删除旧字段。
- 这是仓库兼容优先的选择：能在一轮内完成端到端改造，同时避免对尚未迁移的辅助链路造成连锁破坏。