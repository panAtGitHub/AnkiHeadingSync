# 模块 4 实现决策

本文锁定本轮“文件夹范围设置重做”为三模式 + 文件夹树勾选的具体实现决策。

## 1. 设置模型

- `PluginSettings` 新增 `scopeMode: "all" | "include" | "exclude"`
- 默认值固定为 `"all"`
- `includeFolders / excludeFolders` 继续保留为持久化数组
- 旧数据加载时不迁移、不清空旧数组，只是默认按 `scopeMode = "all"` 生效

## 2. 范围语义

- `all`：忽略 `includeFolders / excludeFolders`，扫描全部 Markdown 文件
- `include`：只扫描 `includeFolders` 中的文件夹及其子文件夹
- `exclude`：扫描全部 Markdown 文件，但排除 `excludeFolders` 中的文件夹及其子文件夹
- 不再保留“include 为空即全库”的隐式规则

## 3. 文件夹树接口

- 在 `ManualSyncVaultGateway` 上新增只读 `listFolderTree()`
- `FolderTreeNode` 只包含：
  - `path`
  - `name`
  - `children`
- `ObsidianVaultGateway` 直接从 vault 根目录递归收集真实文件夹
- 返回根目录的子文件夹列表，根目录本身不作为可勾选节点

## 4. 设置页交互

- 范围设置使用一个固定模式下拉：
  - `全部文件`
  - `仅在指定文件夹`
  - `排除指定文件夹`
- `scopeMode = all` 时隐藏文件夹树
- `scopeMode = include / exclude` 时展示树状复选框
- 目录树按 Windows 风格三态规则运行：全选、半选、未选

## 5. 选择状态与保存格式

- 三态勾选与最小集合压缩放到独立纯函数中处理，而不是散落在 UI 事件回调里
- 保存时始终压缩为最小集合：
  - 父目录完整选中则只保存父目录
  - 只选部分子目录则只保存子目录
- 不支持在 UI 中手工输入任意路径

## 6. 当前文件同步门禁

- 当前文件同步仍保留命令入口
- 范围检查放到 `ManualSyncService.syncFile()` 中，避免只有 UI 层知道范围规则
- 若当前文件不在范围内，抛出专用错误，由插件入口转成 info notice：`当前文件不在插件作用范围内`

## 7. 范围控制

- 本模块只改“文件夹范围设置”相关能力
- 不改 deck、note type、字段映射设置
- 不引入单文件路径白名单/黑名单
- 不改 marker 写回与手动同步主流程