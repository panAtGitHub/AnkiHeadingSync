# 模块 4 实现差距报告

本文以本轮“文件夹范围设置重做为三模式 + 文件夹树勾选”的计划为唯一实现基准，对当前仓库做差距审计。

## 结论

当前仓库已经有基础的文件夹过滤能力，但仍停留在“高级用户手填路径”的旧交互：

- `PluginSettings` 只有 `includeFolders / excludeFolders`，没有显式 `scopeMode`
- 设置页仍是两个逗号分隔文本框
- `ScanScopeService` 仍依赖“include 为空即全库”的隐式规则
- 仓库里没有“列出 vault 文件夹树”的接口
- 当前文件同步命令没有范围门禁，不会在超出范围时直接跳过

这意味着当前实现只覆盖了“底层路径过滤”的一部分，尚未完成计划要求的三模式语义、面向小白的树状勾选交互，以及当前文件同步的范围收口。

## 主要差距

### 1. 设置模型不完整

当前实现：

- `PluginSettings` 只保存 `includeFolders / excludeFolders`
- `DataJsonPluginConfigRepository` 也只合并这两个数组

与计划冲突：

- 缺失显式 `scopeMode: all | include | exclude`
- 旧设置加载时无法明确区分“全库”与“仅 include 为空”

### 2. 设置页交互仍是文本输入

当前实现：

- [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts) 仍渲染 `Include folders` / `Exclude folders` 文本框

与计划冲突：

- 不符合“三模式 + 文件夹树勾选”的交互
- 对新手用户不友好
- 不支持三态父子联动与最小集合保存

### 3. 缺少 vault 文件夹树数据源

当前实现：

- [src/infrastructure/obsidian/ObsidianVaultGateway.ts](src/infrastructure/obsidian/ObsidianVaultGateway.ts) 只支持 Markdown 文件读取和写回

与计划冲突：

- 缺失只读 `listFolderTree()` 接口
- 设置页无法展示真实 vault 文件夹层级
- 无法验证“空文件夹也显示、根目录不勾选”的计划要求

### 4. 范围判定语义仍是隐式的

当前实现：

- [src/application/services/ScanScopeService.ts](src/application/services/ScanScopeService.ts) 以“include 为空”推断全库

与计划冲突：

- `all / include / exclude` 不是显式行为
- `includeFolders` 和 `excludeFolders` 同时存在时语义不够收敛

### 5. 当前文件同步未做范围收口

当前实现：

- 当前文件命令直接进入 `ManualSyncService.syncFile()`

与计划冲突：

- 当前文件不在范围内时，计划要求直接提示并跳过
- 现在不会在命令层给出明确的“当前文件不在插件作用范围内”反馈

### 6. 测试覆盖不足

当前实现：

- 只有旧的 `ScanScopeService` 行为测试
- 设置页测试只覆盖 note type / field mapping

与计划冲突：

- 缺少 `scopeMode` 兼容加载测试
- 缺少文件夹树读取测试
- 缺少三态树选择与最小集合保存测试
- 缺少 UI 回归测试
- 缺少当前文件超范围跳过测试

## 修复方向

模块 4 将按以下方向落地：

1. 为 `PluginSettings` 增加显式 `scopeMode`，默认值为 `all`
2. 为 Obsidian vault gateway 增加只读文件夹树接口
3. 将设置页的两个文本框改为“模式选择 + 树状勾选”
4. 用纯函数收口三态树与最小集合保存逻辑，避免把选择算法揉进 UI 代码
5. 将范围门禁加到当前文件同步链路，并在命令层显示明确 notice