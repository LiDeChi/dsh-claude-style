<div align="center">

# DSH Claude Style

**A theme plugin that brings the look and feel of Claude Code Desktop to the DeepSeek Harness Web GUI.**

> **Claude Code Desktop, right inside DSH.**

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.en.md) [![简体中文](https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-red.svg)](README.md)

[![version](https://img.shields.io/npm/v/dsh-claude-style?style=flat&label=version&color=D97757)](https://www.npmjs.com/package/dsh-claude-style)
[![downloads](https://img.shields.io/npm/dm/dsh-claude-style?style=flat&label=downloads&color=D97757)](https://www.npmjs.com/package/dsh-claude-style)
[![GitHub stars](https://img.shields.io/github/stars/Nwflower/dsh-claude-style?style=flat&label=%E2%98%85&color=08C)](https://github.com/Nwflower/dsh-claude-style)
[![dsh.so install](https://www.dsh.so/badge/install/dsh-claude-style.svg)](https://www.dsh.so/artifact/dsh-claude-style/)
[![license](https://img.shields.io/badge/license-MIT-2EA44F?style=flat)](LICENSE)

</div>

## Preview

The settings page's Brand mark row switches between the Claude and DeepSeek palettes, and light/dark follows your system's color mode. In each group the top row is the Studio home page and the bottom row a Markdown conversation, light on the left and dark on the right.

### Claude

<table>
  <tr>
    <td align="center" width="50%"><img src="./docs/claude-home-light.png" alt="Claude brand, Studio home — light" /></td>
    <td align="center" width="50%"><img src="./docs/claude-home-dark.png" alt="Claude brand, Studio home — dark" /></td>
  </tr>
  <tr>
    <td align="center" width="50%"><img src="./docs/claude-conversation-light.png" alt="Claude brand, Markdown conversation — light" /></td>
    <td align="center" width="50%"><img src="./docs/claude-conversation-dark.png" alt="Claude brand, Markdown conversation — dark" /></td>
  </tr>
</table>

> Light mode pairs an ivory canvas `#FCFCFB` with a pale sidebar `#FBFBF9`; dark mode uses warm black `#141413`. Ember orange `#D97757` is the single action accent across both canvases, and Claude Code's pixel crab stands on the Studio home page's composer.

### DeepSeek

<table>
  <tr>
    <td align="center" width="50%"><img src="./docs/deepseek-home-light.png" alt="DeepSeek brand, Studio home — light" /></td>
    <td align="center" width="50%"><img src="./docs/deepseek-home-dark.png" alt="DeepSeek brand, Studio home — dark" /></td>
  </tr>
  <tr>
    <td align="center" width="50%"><img src="./docs/deepseek-conversation-light.png" alt="DeepSeek brand, Markdown conversation — light" /></td>
    <td align="center" width="50%"><img src="./docs/deepseek-conversation-dark.png" alt="DeepSeek brand, Markdown conversation — dark" /></td>
  </tr>
</table>

> Light mode is a white with a touch of sky blue, `#F7FAFF`, with the sidebar at `#F3F7FE`; dark mode is a blue-black `#13161D`. The accent is DeepSeek's brand blue `#4D6BFE`, and Deepy the pixel whale stands on the composer on the home page and in conversations alike.
>
> <table>
>   <tr>
>     <td align="center" width="25%"><img src="./showcase/gifs/idle.gif" width="120" alt="Idle" /><br />Idle</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/thinking.gif" width="120" alt="Thinking" /><br />Thinking</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/typing.gif" width="120" alt="Answering and calling tools" /><br />Answering and calling tools</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/conducting.gif" width="120" alt="Conducting subagents" /><br />Conducting subagents</td>
>   </tr>
>   <tr>
>     <td align="center" width="25%"><img src="./showcase/gifs/notification.gif" width="120" alt="Waiting on you" /><br />Waiting on you</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/error.gif" width="120" alt="Failed" /><br />Failed</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/happy.gif" width="120" alt="Finished" /><br />Finished</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/sleeping.gif" width="120" alt="Asleep" /><br />Asleep</td>
>   </tr>
> </table>

> The workspaces, sessions, usage figures and nickname in the screenshots are sample data.

## Fonts

> **Important: the Anthropic fonts are not bundled with the npm package.** They are available for download in this repository under [`fonts/`](fonts/). You can either install them on your system, or skip the install entirely — drop the two `.ttf` files into the plugin package's `fonts/` directory and the host will serve them as webfonts (the files are identical, so the result is the same). Either way, refresh or restart the web UI for the fonts to take effect.

| Font | Used for | File |
|---|---|---|
| Anthropic Sans Web Text | Interface / UI | [`fonts/AnthropicSansWebText.ttf`](https://github.com/Nwflower/dsh-claude-style/raw/main/fonts/AnthropicSansWebText.ttf) |
| Anthropic Serif Web Text | Conversation body / Markdown | [`fonts/AnthropicSerifWebText.ttf`](https://github.com/Nwflower/dsh-claude-style/raw/main/fonts/AnthropicSerifWebText.ttf) |
| JetBrains Mono Variable | Code / code blocks | [`fonts/JetBrainsMonoVariable.ttf`](https://github.com/Nwflower/dsh-claude-style/raw/main/fonts/JetBrainsMonoVariable.ttf), [`fonts/JetBrainsMonoItalicVariable.ttf`](https://github.com/Nwflower/dsh-claude-style/raw/main/fonts/JetBrainsMonoItalicVariable.ttf) |

To enable the Anthropic fonts, choose one of the following:

① Install them on your system — on Windows, double-click each `.ttf` and choose "Install"; on macOS, import them with Font Book.

② Skip the install — copy the `.ttf` files into the plugin package's `fonts/` directory, then refresh the page.

> The Anthropic Sans and Serif fonts are the property of Anthropic, licensed for personal use only, and are not covered by this project's MIT license.

## Installation

1. From the official plugin page, add the plugin below and it installs.

```
dsh-claude-style
```

2. From a terminal:

```bash
dsh plugin --profile web add dsh-claude-style                  # npm package (recommended)
dsh plugin --profile web add Nwflower/dsh-claude-style         # GitHub source
```

3. From the [plugin market](https://github.com/dsh-market/dsh-market)

Keep only one theme enabled at a time. dsh ≥ 0.1.7 is required, and a restart of DeepSeek Harness brings the full feature set.

## Documentation

| Document | Contents |
| --- | --- |
| [Design tokens](docs/STYLE.md) | Palette, typography, shapes, source layout, and host-selector discipline (in English) |
| [Architecture decisions](docs/architecture.md) | Single-file bundling, the single-scheduler rule, the feature contract, the account surface, and their trade-offs |
| [Changelog](CHANGELOG.md) | Version history |
| [Contributing](CONTRIBUTING.md) | Building from `src/`, commit conventions, and the screenshot and regression tooling (in English) |

## Acknowledgements

The animation frames of Deepy the pixel whale come from the Deepy whale theme pack drawn by calmly-eating-bugs ([@wp3171216237](https://github.com/wp3171216237)), and ship with the plugin by the author's permission. Many thanks to the author! GIFs of all 20 animations, contributed by the author, are in [showcase/gifs/](showcase/gifs/).

## Related projects

> Running several themes at once? Try [dsh-skin-manager](https://github.com/xiaoyangcheng84-svg/dsh-skin-manager) — it switches between all installed themes from a single settings page.

> Want to import your Claude Code / Codex session history into DSH and keep the conversation going? Try the author's other plugin, [dsh-chat-import](https://github.com/Nwflower/dsh-chat-import).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Nwflower/dsh-claude-style&type=Date)](https://star-history.com/#Nwflower/dsh-claude-style&Date)
