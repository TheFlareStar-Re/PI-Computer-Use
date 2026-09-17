# Computer Use

PI-Desktop 插件。让 AI 帮你看屏幕、点鼠标、按键盘。

已测过：**Grok 4.6**、**GPT 5.6**、**Kimi K3**。

## 安装

导入 `dist` 里 **0.3.0** 的 `.piplug`，然后彻底退出 PI（含托盘）再开。

第一次打开 **Computer Use: Open Panel**，确认本机已装 cua-driver、状态是 `running`。没有驱动时，面板里确认一下就会装：

```powershell
irm https://cua.ai/driver/install.ps1 | iex
```

## 打包

PI-Desktop 的 PluginCheck / PluginPack，目录 `pi-computer-use`。不要手工压 zip。

## 用法

- 先看一眼窗口，再动手；点完、打完字，别把「已经发出去」当成「事情做完了」
- 要停就按键盘 Esc，或点面板上的停止
- 不会去动密码管理器、终端、锁屏、Windows 安全中心、PI-Desktop、ChatGPT、Codex

## 协议

MPL-2.0。cua-driver 仍是 MIT，见 `THIRD_PARTY_NOTICES.md`。
