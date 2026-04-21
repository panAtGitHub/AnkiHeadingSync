# i18n Gap Report

## 审查范围

本次按真实运行链路审查以下实现入口：

1. `src/presentation/AnkiHeadingSyncPlugin.ts`
2. `src/presentation/commands/registerCommands.ts`
3. `src/presentation/settings/PluginSettingTab.ts`
4. `src/presentation/modals/EmptyDeckSelectionModal.ts`
5. `src/presentation/notices/NoticeService.ts`
6. `src/application/config/PluginSettings.ts`
7. `src/application/services/NoteFieldMappingService.ts`
8. `src/application/services/ManualSyncService.ts`
9. `src/domain/manual-sync/services/DeckExtractionService.ts`
10. `src/domain/manual-sync/services/FolderDeckMappingService.ts`
11. `src/domain/manual-sync/services/DeckResolutionService.ts`

## 当前实现结论

### 真实运行路径

1. 插件启动时由 `AnkiHeadingSyncPlugin.onload()` 读取设置、注册命令、挂载设置页。
2. 命令名全部在 `registerCommands.ts` 中注册期硬编码。
3. 设置页所有 UI 文案都由 `PluginSettingTab.display()` 及其私有渲染方法直接写入 `Setting`、`createEl()`、`aria-label`。
4. 空牌组清理弹窗由 `EmptyDeckSelectionModal` 直接创建标题、说明、按钮、计数文案。
5. 所有 summary notice 由 `NoticeService` 直接拼接最终字符串；warning 明细直接展示 `warning.message`。
6. 多个应用层与领域层直接抛出最终用户字符串，展示层通常直接透传 `error.message`。

### 已确认的缺口

1. 仓库内没有统一 i18n 层，也没有 `locale -> message -> render` 的基础设施。
2. 当前语言来源没有统一入口，代码未调用 Obsidian `getLanguage()`。
3. 设置页存在明显中英混排：前半段大多英文，deck/scope 部分大多中文。
4. 命令名当前全部是中文，且无法随 Obsidian 语言切换。
5. `EmptyDeckSelectionModal` 当前全部是中文硬编码。
6. `NoticeService` 当前 summary 文案是英文模板，但插件主类传入的 prefix 又常常是中文，形成混用输出。
7. `DeckResolutionWarning` 当前结构为 `{ filePath, code, message }`，warning key 也依赖最终 `message`，不适合国际化。
8. `DeckExtractionService`、`FolderDeckMappingService`、`DeckResolutionService` 在领域层直接生成中文 warning message。
9. `CurrentFileOutOfScopeError`、`validatePluginSettings()`、`NoteFieldMappingService`、`ManualSyncService.createWriteBackFailureMessage()` 当前都直接生成最终用户字符串。
10. `AnkiHeadingSyncPlugin` 对多个 fallback notice 直接写死最终字符串，没有统一渲染层。
11. `PluginSettingTab` 当前大量动态状态文字直接拼接字符串，例如 note type 加载状态、field 列表、mapping 保存状态、scope 描述、folder tree 状态等。
12. `aria-label` 目前只有文件夹树展开/收起文字，且为中文硬编码。

### 与计划相比的仓库兼容性约束

1. 设置页并不是 schema/JSON 驱动，而是手写 imperative render；所以国际化必须直接切到这些 render 方法，而不是抽象新的设置描述 DSL。
2. 命令名注册发生在 `onload()`，仓库内没有语言变化事件订阅，也没有命令热更新基础设施；这里只能按当前语言注册，后续靠插件重载刷新。
3. 当前 clear/reset/cleanup 结果类型里有 `failureFiles: Array<{ filePath, message }>`，若要避免下层携带最终字符串，需要把这类 failure 改为结构化数据并在 notice 层渲染。
4. `pluginState` 会持久化 `deckWarnings`；因此 warning 结构调整必须同时兼容状态仓储读写与现有测试。

## 本轮修复边界

本轮按计划收敛到以下范围：

1. 新增统一 i18n 基础设施，只支持 `en` 和简体中文。
2. 统一接管插件运行时所有用户可见文案。
3. 把用户错误与 deck warning 改成结构化数据，在上层按 locale 渲染。
4. 更新持久化与测试以适配新的 warning / error 结构。
5. 不修改 `PluginSettings` 持久化 schema。
6. 不改 README、manifest 元数据或发布物料。

## 风险点

1. `PluginSettingTab.test.ts` 和 `EmptyDeckSelectionModal.test.ts` 当前大量断言具体文本，改造后需要成组重写为中英双 locale 断言。
2. 由于 `obsidian` 在测试中普遍被 mock，新增 `getLanguage()` 后需要同步更新 mock/stub，避免测试在导入 i18n 时崩溃。
3. warning 结构变化会穿过 domain、application、persistence、多组测试，必须一次性改全，否则类型和序列化都会断。