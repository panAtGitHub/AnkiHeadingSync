# Anki Heading Sync

## 中文

Anki Heading Sync 是一个 Obsidian 桌面端插件，用来批量地制作 Anki 卡片。
与其他的制卡插件（如expand to anki插件）最大的不同是：它固定将标题级文字（推荐四级标题）作为问题，以减少烦琐的配置工作。
用「标题文字」作为问题的好处在于：
1）可以在「大纲」侧边栏中方便地看到本 md 文件中的问题集
2）可以很方便地做出「卡片级跳转」：在anki里复习时，可以一键精准地跳转到对应的ob卡片中。

另外，我在这个插件中创新性地引入了 标题 + 自定义字符（推荐用标签）的形式，来支持不同的卡片类型。
目前，卡片类型主要为四种。
1）普通问答题
2）多级列表形式的问答题
3）每次挖单空的填空题
4）一次性全部挖空的填空题

### 插件支持什么

- 从 标题 + 自定义字符 生成四类卡片
- 转换当前文件，或批量转换设置范围内的整个库文件
- 通过默认牌组、文件夹映射、文件级自定义牌组进行牌组路由
- 可选同步 Obsidian 反向链接和标签
- 清理当前文件里的同步标记及anki对应的卡片
- 清理 Anki 中的空牌组

### 使用要求

- Obsidian 桌面端 1.5.0 或更高版本
- Anki 桌面端
- Anki 中已安装并启用 AnkiConnect

本插件仅支持桌面端。插件会访问你在设置中配置的 AnkiConnect URL，默认地址是 `http://127.0.0.1:8765`。

### 安装

#### 社区插件

插件被 Obsidian 社区插件目录收录后，可以直接在 Obsidian 的 Community Plugins 页面中搜索并安装。

#### 从 Release 手动安装

1. 下载你需要版本的 release assets。
2. 创建或打开当前 vault 的插件目录：`.obsidian/plugins/anki-heading-sync`。
3. 把以下文件复制到该目录：
   - `main.js`
   - `manifest.json`
   - 如果 release 中包含 `styles.css`，也一起复制
4. 回到 Obsidian，启用 Anki Heading Sync。

### 示例文件

Release 中还提供了两个示例文件：

- `dead-sea-example.md`：Obsidian 里的示例源文件，可以放进你的 vault 中查看标题制卡写法。
- `dead-sea-example.apkg`：Anki 示例牌组，可以导入 Anki，用来获得示例卡片、笔记类型和多级列表问答题模板。

如果你想使用多级列表形式的问答题，建议先导入 `dead-sea-example.apkg`。导入后，再在插件设置里把 QA Group 对应到这个多级列表笔记类型和字段。

### AnkiConnect 设置

1. 在桌面端打开 Anki。
2. 在 Anki 中安装并启用 AnkiConnect 插件。
3. 安装后重启 Anki。
4. 在 Obsidian 中打开 Settings -> Community plugins -> Anki Heading Sync。
5. 如果没有特殊网络配置，保持默认 AnkiConnect URL：`http://127.0.0.1:8765`。
6. 每次同步前确认 Anki 正在运行。

### 初始设置

#### 1. 选择笔记类型和字段映射

打开插件设置页，为你要同步的卡片类型配置 Anki 笔记类型和字段映射。

- 基础问答卡片使用 basic route。
- Cloze 和 cloze-all 使用 cloze routes。
- QA Group 使用专门的 group route。

如果之后在 Anki 中改了笔记类型字段，请回到插件设置页刷新并重新确认字段映射，再继续同步。

#### 2. 配置同步范围

全库同步会按照你配置的运行范围执行。

- `all`：同步插件能索引到的所有 Markdown 文件
- `include`：只同步 `includeFolders` 中列出的文件夹
- `exclude`：同步除 `excludeFolders` 中列出的文件夹以外的内容

如果选择了 `include` 模式，但 include 列表为空，全库同步将没有可处理的文件。

#### 3. 配置牌组行为

先设置一个默认牌组。之后可以按需增加基于文件夹的牌组映射，或在文件中声明文件级自定义牌组。

当前牌组优先级是：

1. 文件级自定义牌组
2. 文件夹映射牌组（建议用这种方式）
3. 默认牌组

### 命令

- `Sync current file to Anki`：同步当前文件到 Anki
- `Sync vault to Anki`：同步整个库范围到 Anki
- `Clear synced cards in current file`：清理当前文件中已同步卡片的标记
- `Clean up empty decks`：清理 Anki 中的空牌组

插件不会为这些命令注册默认快捷键，因此不会覆盖用户已有快捷键。

### 卡片中的「答案提取」范围

插件支持两种「答案提取」模式。

- `heading-block`：除非遇到有效同步标记，否则保留整个标题块作为卡片内容
- `double-blank-lines`：除非遇到有效同步标记，否则在第一次出现连续 2 个或更多空行前停止

如果已经存在有效的 `<!--ID: ...-->` 或 `<!--GI: ...-->` 标记，该标记的优先级高于空行截断规则。


## English

Anki Heading Sync is an Obsidian desktop plugin for creating Anki cards in batches.

Compared with other card-making plugins, such as Expand to Anki, its main difference is that it consistently uses heading text, preferably H4 headings, as the question. This reduces the amount of configuration needed before you can start making cards.

Using heading text as the question has two practical benefits:

1. You can use Obsidian's Outline sidebar to see the question set inside the current Markdown file.
2. You can create card-level navigation: while reviewing in Anki, you can jump precisely back to the corresponding Obsidian card with one click.

The plugin also introduces a flexible pattern: heading plus custom marker text, with tags recommended as the marker format. This makes it possible to support different card types from the same heading-based workflow.

Currently, the plugin mainly supports four card types:

1. Basic Q&A cards
2. Multi-level list Q&A cards
3. Cloze cards that reveal one blank at a time
4. Cloze cards that reveal all blanks at once

### What the plugin supports

- Creating four card types from heading text plus custom marker text
- Converting the current file, or converting all files inside the configured vault scope in batches
- Deck routing through default deck, folder mapping, and optional file-level custom deck
- Optional Obsidian backlinks and tag sync
- Clearing synced markers in the current file and the corresponding Anki cards
- Cleaning up empty decks in Anki

### Requirements

- Obsidian desktop 1.5.0 or newer
- Anki desktop
- AnkiConnect enabled in Anki

This plugin is desktop-only. It talks to the configured AnkiConnect URL, which defaults to `http://127.0.0.1:8765`.

### Install

#### Community Plugins

Once the plugin is accepted into the Obsidian Community Plugins directory, install it from Obsidian's Community Plugins browser.

#### Manual install from a release

1. Download the release assets for the version you want.
2. Create or open your vault plugin folder: `.obsidian/plugins/anki-heading-sync`.
3. Copy these release assets into that folder:
   - `main.js`
   - `manifest.json`
   - `styles.css` when present
4. Enable Anki Heading Sync in Obsidian.

### Example files

The release also includes two example files:

- `dead-sea-example.md`: an Obsidian Markdown source example that you can place in your vault to inspect the heading-based card format.
- `dead-sea-example.apkg`: a sample Anki deck that you can import into Anki to get example cards, note types, and the multi-level list Q&A template.

If you want to use multi-level list Q&A cards, import `dead-sea-example.apkg` first. After importing it, map the QA Group route in the plugin settings to the imported multi-level list note type and fields.

### AnkiConnect setup

1. Open Anki on your desktop.
2. Install and enable the AnkiConnect add-on in Anki.
3. Restart Anki after installing the add-on.
4. In Obsidian, open Settings -> Community plugins -> Anki Heading Sync.
5. Keep the default AnkiConnect URL `http://127.0.0.1:8765` unless you intentionally expose AnkiConnect on another address.
6. Confirm that Anki is running before you start a sync.

### Initial plugin setup

#### 1. Choose note types and field mappings

Open the plugin settings and configure the note types and field mappings used by the routes you want to sync.

- Basic cards use the basic route.
- Cloze and cloze-all use the cloze routes.
- QA Group uses the dedicated group route.

If you change note model fields in Anki later, revisit the plugin settings and refresh the mappings before syncing again.

#### 2. Configure sync scope

Vault sync uses the configured run scope.

- `all`: sync every Markdown file the plugin can index
- `include`: sync only the folders listed in `includeFolders`
- `exclude`: sync everything except the folders listed in `excludeFolders`

If `include` mode is selected and the include list is empty, vault sync has no in-scope files to process.

#### 3. Configure deck behavior

Set a default deck first. You can then optionally add folder-based deck routing and file-level custom deck declarations.

Current deck priority is:

1. File-level custom deck
2. Folder mapping deck, which is the recommended approach
3. Default deck

### Commands

- `Sync current file to Anki`
- `Sync vault to Anki`
- `Clear synced cards in current file`
- `Clean up empty decks`

The plugin registers these commands without default hotkeys so they do not override user shortcuts.

### Answer extraction range inside cards

The plugin supports two answer extraction modes.

- `heading-block`: keep the entire heading block as card content unless a valid sync marker is present
- `double-blank-lines`: stop before the first run of 2 or more blank lines unless a valid sync marker is present

If a valid `<!--ID: ...-->` or `<!--GI: ...-->` marker already exists, that marker takes precedence over the blank-line cutoff.
