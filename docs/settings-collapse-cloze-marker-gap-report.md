# 设置页默认折叠与填空题标记差距审计

本文基于当前仓库真实实现，定位本轮两项行为调整的实际接入点：设置页默认折叠，以及填空题默认识别从 `H5 + 空标签` 切换为 `H4 + #anki-cloze`。

## 1. 当前设置页仍有默认展开卡片

- 入口在 [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)。
- 当前 `expandedCardIds` 初始化仍是：

```ts
new Set<SettingsCardId>(["card-types", "commands"])
```

结果是：首次进入设置页时，`卡片类型及基础设置` 和 `命令说明` 默认展开，和本轮“5 张卡片全部默认折叠”的目标不一致。

## 2. 当前点击展开/折叠与局部刷新边界已经正确

- `toggleCard()` 只改 `expandedCardIds`。
- `renderCard()` 只重绘单卡 `bodyEl`。
- 现有测试也覆盖了：
  - 卡片展开/折叠不整页重建
  - card 1 刷新不整页重建
  - scope/deck 局部刷新

因此本轮只需要把默认展开集合改为空，并同步更新测试，不需要改卡片 shell 结构或刷新逻辑。

## 3. 当前 cloze 默认仍是旧规则 `H5 + 空标签`

- 当前默认值在 [src/application/config/PluginSettings.ts](src/application/config/PluginSettings.ts) 中仍是：
  - `DEFAULT_CLOZE_HEADING_LEVEL = 5`
  - `createDefaultCardTypeConfigs().cloze.extraMarker = ""`

这意味着当前默认识别规则仍是：

1. 普通问答：`H4 + 空标签`
2. 多级列表问答：`H4 + #anki-list`
3. 填空题：`H5 + 空标签`

与本轮要求的：

1. 普通问答：`H4 + 空标签`
2. 多级列表问答：`H4 + #anki-list`
3. 填空题：`H4 + #anki-cloze`

不一致。

## 4. 当前设置合并逻辑还没有旧默认迁移

- `normalizePluginSettings()` 通过 `mergeCardTypeConfigs()` 合并默认值、旧字段和 `cardTypeConfigs`。
- 目前 `mergeCardTypeConfigs()` 只做：
  - 回填默认值
  - sanitize
  - 衍生 legacy 字段
- 还没有“旧默认 cloze 配置自动迁移到新默认”的规则。

因此已有用户如果保存的是：

- `headingLevel: 5`
- `extraMarker: ""`

当前加载后仍会保持旧行为。

## 5. 当前识别优先级已经支持同级 marker 分流

- 真正识别入口在 [src/domain/manual-sync/services/CardIndexingService.ts](src/domain/manual-sync/services/CardIndexingService.ts)。
- `resolveHeadingConfig()` 当前规则是：
  - 先在同级 enabled 配置中找 marker 精确尾随匹配
  - 再退回到同级 enabled 的空 marker 默认行
- 匹配顺序是：
  - `qa-group`
  - `semantic-qa`
  - `cloze`
  - `basic`

这说明本轮无需重写识别算法，只要把 cloze 默认改成 `H4 + #anki-cloze`，同级分流就会自然成立。

## 6. 需要适配的测试切片

- `PluginSettingTab.test.ts` 当前大量测试默认依赖 `card-types` 已展开。
- 一旦默认改成全部折叠，相关测试必须先点击展开对应卡片，再断言局部刷新内容。
- `PluginSettings.test.ts` 当前默认值和 legacy snapshot 断言仍写着 cloze 的旧默认。
- `CardIndexingService.test.ts` 当前已有一些显式 `clozeHeadingLevel: 5` 的兼容测试，这些应保留；但还缺少“默认 H4 + #anki-cloze”路由断言。

## 7. 结论

当前真实差距是：

1. 设置页仍默认展开两张卡片。
2. cloze 默认仍是 `H5 + 空标签`。
3. 设置合并逻辑没有旧默认迁移。
4. 识别算法本身已经支持同级 marker 优先，不需要重写。
5. 测试需要适配“默认全部折叠”与“默认 cloze marker 已改”的新事实。

最小修复路径是：

1. 把 `expandedCardIds` 默认改为空集合。
2. 把 cloze 默认改成 `H4 + #anki-cloze`。
3. 在 `mergeCardTypeConfigs()` 中补旧默认迁移，只覆盖旧默认识别配置，不覆盖用户自定义 cloze 识别配置。
4. 更新设置页、设置模型、识别测试与局部刷新测试。