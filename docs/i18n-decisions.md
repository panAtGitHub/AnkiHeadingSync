# i18n Decisions

## 1. 实现入口

本轮继续沿用现有分层，不做额外框架化改造：

1. `src/presentation/i18n/` 放 locale、消息字典、`t()`、`formatList()`。
2. 展示层入口继续是 `AnkiHeadingSyncPlugin`、`registerCommands`、`PluginSettingTab`、`EmptyDeckSelectionModal`、`NoticeService`。
3. 结构化用户错误定义放在 `src/application/errors/`，供 application / presentation 共用。

## 2. locale 策略

1. 运行时唯一来源是 `obsidian.getLanguage()`。
2. 仅当返回值严格等于 `zh` 时使用简体中文。
3. 其他所有语言码都回退到英文，包括 `en`、`en-GB`、`ja`、`zh-TW`。
4. 不缓存 locale 常量；`t()` 与 `renderUserMessage()` 每次调用都重新解析当前语言。

## 3. message 结构

按计划固定以下 key 分组：

1. `commands.*`
2. `settings.*`
3. `modal.emptyDeck.*`
4. `notice.*`
5. `errors.*`
6. `warnings.deck.*`

`zh.ts` 通过 `satisfies typeof en` 约束字典 shape，避免漏 key。

## 4. 用户错误模型

1. 新增 `PluginUserError`，仅承载 `key` 与 `params`。
2. 新增 `isPluginUserError()` 与 `renderUserMessage()`。
3. 插件自有、会冒泡到 Notice/UI 的错误统一抛 `PluginUserError`。
4. 未结构化的第三方或底层异常继续允许透传 `error.message` 作为诊断信息。

## 5. warning / failure 结构

1. `DeckResolutionWarning` 改为 `{ filePath, code, params? }`。
2. `getDeckResolutionWarningKey()` 使用 `filePath + code + stable(params)` 去重，不再依赖最终展示文案。
3. deck 相关领域服务只输出 warning code/params；最终显示由 `NoticeService` 渲染。
4. clear/reset/write-back 类失败项也改为结构化 `code + params`，避免 lower layer 直接生成最终字符串。

## 6. 设置页集成方式

1. 保持现有 imperative render，不引入新的设置元描述层。
2. 所有标题、说明、按钮、状态文案、preview、dropdown label、scope 文案、aria-label 直接切到 `t()`。
3. 动态状态统一改成 key + params，而不是继续内联拼接。
4. note type、field name、deck name、folder path 等业务数据原样透传，不做翻译。

## 7. 仓库兼容性偏差

相对草案，采用以下更贴合仓库的落地方式：

1. `PluginUserError` 放在 application 层而不是 presentation 层，因为 `validatePluginSettings()`、`ManualSyncService`、`NoteFieldMappingService` 都在 application。
2. `NoticeService` 负责 summary、warning 列表和结构化 failure 的最终格式化，避免在 plugin 主类里重复拼接。
3. 对 `pluginState` 中持久化的 `deckWarnings` 直接升级为结构化 payload，不做兼容旧 message 字段的额外迁移逻辑，因为本任务明确不要求 settings schema 迁移，且 warning 不属于设置 schema。

## 8. 验证策略

1. 先做 locale / i18n 单测，确保基础设施稳定。
2. 再补 settings / modal / notice 的双语表现测试。
3. 最后更新 error / warning / persistence 相关测试，跑完整 `npm test`、`npm run build`、`npm run lint`。