<div align="center">

# DSH Claude Style

**为 DeepSeek Harness 复刻 Claude Code Desktop 风格与交互体验的主题插件。**

> **在 DSH 里，就是 Claude Code Desktop 的样子。**

[![简体中文](https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-red.svg)](README.md) [![English](https://img.shields.io/badge/lang-English-blue.svg)](README.en.md)

[![version](https://img.shields.io/npm/v/dsh-claude-style?style=flat&label=version&color=D97757)](https://www.npmjs.com/package/dsh-claude-style)
[![downloads](https://img.shields.io/npm/dm/dsh-claude-style?style=flat&label=downloads&color=D97757)](https://www.npmjs.com/package/dsh-claude-style)
[![GitHub stars](https://img.shields.io/github/stars/Nwflower/dsh-claude-style?style=flat&label=%E2%98%85&color=08C)](https://github.com/Nwflower/dsh-claude-style)
[![dsh.so install](https://www.dsh.so/badge/install/dsh-claude-style.svg)](https://www.dsh.so/artifact/dsh-claude-style/)
[![license](https://img.shields.io/badge/license-MIT-2EA44F?style=flat)](LICENSE)

</div>

## 预览

本插件提供了两种主题。通过插件设置，可以在 Claude 与 DeepSeek 两套配色之间切换，亮暗跟随系统颜色模式。

### Claude

<table>
  <tr>
    <td align="center" width="50%"><img src="./docs/claude-home-light.png" alt="Claude 档工作台首页 —— 亮色" /></td>
    <td align="center" width="50%"><img src="./docs/claude-home-dark.png" alt="Claude 档工作台首页 —— 暗色" /></td>
  </tr>
  <tr>
    <td align="center" width="50%"><img src="./docs/claude-conversation-light.png" alt="Claude 档 Markdown 对话 —— 亮色" /></td>
    <td align="center" width="50%"><img src="./docs/claude-conversation-dark.png" alt="Claude 档 Markdown 对话 —— 暗色" /></td>
  </tr>
</table>

> Claude品牌主题，原汁原味。工作台首页（上），对话界面（下），浅色（左），深色（右）

### DeepSeek

<table>
  <tr>
    <td align="center" width="50%"><img src="./docs/deepseek-home-light.png" alt="DeepSeek 档工作台首页 —— 亮色" /></td>
    <td align="center" width="50%"><img src="./docs/deepseek-home-dark.png" alt="DeepSeek 档工作台首页 —— 暗色" /></td>
  </tr>
  <tr>
    <td align="center" width="50%"><img src="./docs/deepseek-conversation-light.png" alt="DeepSeek 档 Markdown 对话 —— 亮色" /></td>
    <td align="center" width="50%"><img src="./docs/deepseek-conversation-dark.png" alt="DeepSeek 档 Markdown 对话 —— 暗色" /></td>
  </tr>
</table>

> DeepSeek品牌主题，拥有特色宠物小鲸鱼Deepy。工作台首页（上），对话界面（下），浅色（左），深色（右）
>
> <table>
>   <tr>
>     <td align="center" width="25%"><img src="./showcase/gifs/idle.gif" width="120" alt="空闲" /><br />空闲</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/thinking.gif" width="120" alt="思考" /><br />思考</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/typing.gif" width="120" alt="写回答、调用工具" /><br />写回答、调用工具</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/conducting.gif" width="120" alt="指挥子代理" /><br />指挥子代理</td>
>   </tr>
>   <tr>
>     <td align="center" width="25%"><img src="./showcase/gifs/notification.gif" width="120" alt="等你操作" /><br />等你操作</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/error.gif" width="120" alt="失败" /><br />失败</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/happy.gif" width="120" alt="完成" /><br />完成</td>
>     <td align="center" width="25%"><img src="./showcase/gifs/sleeping.gif" width="120" alt="睡着" /><br />睡着</td>
>   </tr>
> </table>

## 字体

> 本插件使用的字体如下。
>
> Anthropic Sans/Serif 字体版权归 Anthropic 所有，仅供个人使用，不适用 MIT 许可。
>
> **重要：Anthropic 字体不随 npm 包分发，仅在仓库 [`fonts/`](fonts/) 供下载**。

| 字体 | 用途 | 文件 |
|---|---|---|
| Anthropic Sans Web Text | 界面 / UI | [`fonts/AnthropicSansWebText.ttf`](https://github.com/Nwflower/dsh-claude-style/raw/main/fonts/AnthropicSansWebText.ttf) |
| Anthropic Serif Web Text | 对话正文 / Markdown | [`fonts/AnthropicSerifWebText.ttf`](https://github.com/Nwflower/dsh-claude-style/raw/main/fonts/AnthropicSerifWebText.ttf) |
| JetBrains Mono Variable | 代码 / 代码块 | [`fonts/JetBrainsMonoVariable.ttf`](https://github.com/Nwflower/dsh-claude-style/raw/main/fonts/JetBrainsMonoVariable.ttf)、[`fonts/JetBrainsMonoItalicVariable.ttf`](https://github.com/Nwflower/dsh-claude-style/raw/main/fonts/JetBrainsMonoItalicVariable.ttf) |

Anthropic 字体启用（二选一）：

① 安装到系统——Windows 双击 `.ttf` → 「安装」，macOS 用「字体册」导入；

② 免安装——把 `.ttf` 复制到插件包的 `fonts/` 目录。完成后刷新页面生效。

## 安装

1. 官方插件页，添加以下插件即可快速安装

```
dsh-claude-style
```

2. 通过终端安装

```bash
dsh plugin --profile web add dsh-claude-style                  # npm 包（推荐）
```

3. 通过[插件市场](https://github.com/dsh-market/dsh-market)安装

同一时刻建议只启用一个主题。安装后推荐重启 `DeepSeek Harness`以获得完整能力。

## 文档

| 文档 | 说明 |
| --- | --- |
| [设计令牌](docs/STYLE.md) | 调色板、字体、形状，源码结构与宿主选择器纪律（英文） |
| [架构决策](docs/architecture.md) | 单文件拼接、单一调度器、特性契约、账号表面等决策与权衡 |
| [更新日志](CHANGELOG.md) | 版本历史 |
| [贡献指南](CONTRIBUTING.md) | 如何从 `src/` 构建、提交规范与截图/回归工具（英文） |

## 鸣谢

像素小鲸鱼 Deepy 的动画帧图来自 calmly-eating-bugs（[@wp3171216237](https://github.com/wp3171216237)）绘制的 Deepy 小鲸鱼主题包。

## 友链

> 想把 Claude Code / Codex 等外部代理的会话历史导入 DSH 接着聊？推荐作者的另一个插件 [dsh-chat-import](https://github.com/Nwflower/dsh-chat-import)。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Nwflower/dsh-claude-style&type=Date)](https://star-history.com/#Nwflower/dsh-claude-style&Date)
