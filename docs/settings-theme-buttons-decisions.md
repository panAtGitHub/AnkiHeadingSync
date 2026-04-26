# Settings Theme Buttons Decisions

## 1. 最终作用域 class

设置页根容器统一使用：

1. `anki-heading-sync-settings`

所有新增按钮与开关样式都必须挂在这个作用域下。

## 2. 最终 class 命名

本轮主题化控件 class 固定为：

1. 按钮：`ahs-theme-action-button`
2. 开关：`ahs-theme-toggle`

开关状态属性固定为：

1. `data-ahs-toggle-state="on"`
2. `data-ahs-toggle-state="off"`

## 3. 纳入主题按钮的范围

本轮只纳入以下设置页操作按钮：

1. 加载 / 刷新 Anki 卡片类型配置按钮
2. 刷新文件夹列表按钮
3. 向当前文件插入牌组模板按钮

没有额外扩张到其他设置页元素。

## 4. 明确排除的按钮

本轮明确不纳入主题按钮样式：

1. 设置卡片折叠标题按钮
2. 文件夹树展开 / 收起箭头按钮
3. 设置页之外的 modal 或其他 Obsidian UI 按钮

## 5. 开关状态同步策略

开关统一使用一个共享 helper：

1. 给 `toggle.toggleEl` 打上 `ahs-theme-toggle`
2. 初始化时写入 `data-ahs-toggle-state`
3. 在 `onChange` 包装层里先更新 `data-ahs-toggle-state`
4. 再执行原有设置保存逻辑

这样可以避免改动任何设置字段语义，同时保证测试可直接断言开关视觉状态。

## 6. 按钮样式策略

按钮样式只依赖 Obsidian 主题变量：

1. 默认背景：`--interactive-accent`
2. hover 背景：`--interactive-accent-hover`
3. 文本颜色：`--text-on-accent`
4. disabled 使用中性边框与透明度弱化

不引入固定品牌色，也不把卡片标题按钮或文件夹箭头按钮伪装成 CTA。

## 7. 开关样式策略

开关视觉策略固定为：

1. `on` 状态使用 `--interactive-accent`
2. `off` 状态使用 `--background-secondary`
3. 边框使用 `--background-modifier-border`
4. hover 使用 `--background-modifier-hover` 或 accent hover

不改点击逻辑，不改可访问性，不改 Obsidian 默认结构。

## 8. 构建打包决策

`stage-plugin-dist.mjs` 最终行为固定为：

1. 继续复制 `manifest.json`
2. 继续复制 `versions.json`
3. 根目录存在 `styles.css` 时额外复制到 `dist/plugin/styles.css`
4. README 说明同步补充 `styles.css`（仅在存在时）

`sync-plugin-dist.mjs` 保持不变。

## 9. 与计划的显式偏差

没有行为偏差。

实现上仅补充一个仓库现实：

1. 开关状态更新通过共享 helper 的包装层完成
2. 不是在每个 `onChange` 回调里手写重复的 dataset 更新逻辑