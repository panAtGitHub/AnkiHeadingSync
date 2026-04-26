# Plugin Run Scope UI Decisions

## 1. 最终文案决策

范围卡最终统一为：

1. 中文卡片标题：`插件运行范围`
2. 英文卡片标题：`Plugin run scope`
3. 中文范围下拉名称：`插件运行范围`
4. 英文范围下拉名称：`Plugin run scope`

范围卡顶部旧说明不再渲染。

## 2. 文件夹树行布局决策

每个树行固定为三列：

1. 展开槽
2. checkbox
3. 文件夹名

布局固定为：

1. `display: grid`
2. `grid-template-columns: 24px 24px minmax(0, 1fr)`
3. `align-items: center`
4. 固定最小高度

缩进只由 `depth * 18px` 控制，使用行容器的左边距实现。

## 3. 展开槽与文件夹名决策

展开槽规则固定为：

1. 有子节点时用轻量按钮
2. 无子节点时仍渲染占位元素
3. 两种情况下都保留 `folderToggle` dataset
4. 展开符号继续使用 `▸ / ▾`

文件夹名规则固定为：

1. 单行显示
2. `overflow: hidden`
3. `text-overflow: ellipsis`
4. `white-space: nowrap`

## 4. 已选祖先自动展开策略

补充展开已选祖先的时机固定为：

1. 文件夹树首次成功加载后
2. 作用范围切换到 `include` / `exclude` 后
3. 手动刷新文件夹树后
4. 设置页关闭后再次进入时

不在以下场景强制重置：

1. 用户手动点击展开/折叠后的普通重渲染
2. 勾选/取消勾选文件夹后的普通重渲染

实现方式是一次性“待补充展开”标志位，而不是每次 render 都强行根据已选项重算展开状态。

## 5. refresh 行为决策

`refreshFolderTree()` 保持现有语义：

1. 清空旧展开状态
2. 重新加载树
3. 加载完成后再次补充展开已选祖先

## 6. 保持不变的内容

本次明确保持不变：

1. `all / include / exclude` 的业务含义
2. 设置字段名和枚举值
3. `FolderScopeTree` 的选择压缩算法
4. 作用范围对同步逻辑的影响
5. 设置页局部刷新机制
6. 不新增 CSS 构建链路

## 7. 与计划的显式偏差

没有行为偏差。

仅有一个实现级说明：

1. 当前仓库已经有安全的 built-plugin sync 脚本
2. 因此最终同步继续复用 `build:obsidian` 和现有脚本，而不是再引入新的同步实现