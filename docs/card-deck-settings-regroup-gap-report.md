# Card Deck Settings Regroup Gap Report

## 审查范围

本次按真实仓库实现审查了以下位置：

1. [src/presentation/settings/PluginSettingTab.ts](src/presentation/settings/PluginSettingTab.ts)
2. [src/presentation/i18n/messages/zh.ts](src/presentation/i18n/messages/zh.ts)
3. [src/presentation/i18n/messages/en.ts](src/presentation/i18n/messages/en.ts)
4. [src/application/config/PluginSettings.ts](src/application/config/PluginSettings.ts)
5. [src/application/config/PluginSettings.test.ts](src/application/config/PluginSettings.test.ts)
6. [src/infrastructure/persistence/DataJsonPluginConfigRepository.ts](src/infrastructure/persistence/DataJsonPluginConfigRepository.ts)
7. [src/infrastructure/persistence/DataJsonPluginConfigRepository.test.ts](src/infrastructure/persistence/DataJsonPluginConfigRepository.test.ts)
8. [scripts/sync-plugin-dist.mjs](scripts/sync-plugin-dist.mjs)

## 当前实现确认

### 1. Deck 卡目前仍是线性渲染

当前 `renderDeckCard()` 的真实顺序是：

1. 顶部说明段落
2. `默认牌组`
3. `开启文件级自定义牌组`
4. 文件级自定义牌组展开项
5. `文件夹映射模式`
6. 两条映射示例
7. 优先级说明

还没有：

1. 三个带序号的小分组
2. `data-deck-section`
3. `data-deck-section-title`

### 2. 顶部说明仍在渲染

`renderDeckCard()` 当前第一行仍然是：

1. `containerEl.createEl("p", { text: t("settings.cards.deck.desc") })`

因此旧说明 `保留现有 deck 行为；切换文件级 deck 开关时只刷新这一张卡片。` 仍会显示。

### 3. 中文 Deck 设置文案仍有明显中英文混杂

当前中文 `settings.deck.*` / `settings.cards.deck.*` 中仍存在这些混用示例：

1. `Deck 与牌组规则`
2. `文件级 deck`
3. `deck 模板`
4. `deck 声明`
5. `最终 deck 优先级`

这与本轮“中文设置页统一使用牌组”的目标不一致。

### 4. 新安装默认 `folderDeckMode` 仍是 `off`

当前 [src/application/config/PluginSettings.ts](src/application/config/PluginSettings.ts) 中：

1. `DEFAULT_SETTINGS.folderDeckMode = "off"`

因此：

1. 新安装默认行为与“推荐用文件夹及文件名映射”的 UI 不一致
2. legacy settings 缺失该字段时，也会通过 `mergePluginSettings()` 合并到 `off`

### 5. legacy 缺字段行为当前由默认合并控制

[src/infrastructure/persistence/DataJsonPluginConfigRepository.ts](src/infrastructure/persistence/DataJsonPluginConfigRepository.ts) 的 `load()` 直接调用：

1. `mergePluginSettings(snapshot.settings)`

因此只要 `DEFAULT_SETTINGS.folderDeckMode` 改为 `folder-and-file`：

1. 缺字段 legacy snapshot 会自动得到新默认值
2. 已显式保存该字段的用户值不会被覆盖

### 6. 当前已有局部刷新行为可直接复用

当前 `开启文件级自定义牌组` toggle 已经：

1. 更新 `fileDeckEnabled`
2. 只调用 `this.renderCard("deck")`

这说明本次只需改 UI 分组和文案，不需要动刷新机制。

## 建议的最小落点

1. 在 `PluginSettingTab.ts` 新增轻量 `createDeckSection()` helper
2. 在 `renderDeckCard()` 内把现有控件重新分配到 3 个分组
3. 删除顶部说明的渲染
4. 统一 `settings.deck.*` 与 `settings.cards.deck.*` 的中文牌组文案
5. 把 `DEFAULT_SETTINGS.folderDeckMode` 改为 `folder-and-file`
6. 在 `PluginSettingTab.test.ts`、`PluginSettings.test.ts`、`DataJsonPluginConfigRepository.test.ts` 补对应断言

## 与计划的显式偏差

没有行为偏差。

唯一需要记录的是：

1. 当前仓库的 built-plugin sync 脚本已经符合“只复制 main.js / manifest.json / 可选 styles.css，不碰 data.json”的要求
2. 因此最终同步继续复用现有 `build:obsidian` 路径