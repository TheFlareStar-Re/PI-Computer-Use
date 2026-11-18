# Computer Use

PI-Desktop 插件。复刻 Codex 的操控功能，让 AI 直接操控电脑完成简单作业。

已测过：**Grok 4.6**、**GPT 5.6**、**Kimi K3**。

## 安装

导入 `dist` 里 **0.5.0** 的 `.piplug`，然后彻底退出 PI（含托盘）再开。

打开 **Computer Use: Open Panel**。在面板确认安装或升级到 **cua-driver 0.53.0**，然后点击「启动」，确认状态为 `running`。也可以在 PowerShell 中手动安装同一版本：

```powershell
$env:CUA_DRIVER_RS_VERSION = '0.53.0'
$env:CUA_DRIVER_NO_CONNECT = '1'
$env:CUA_DRIVER_NO_TEST = '1'
irm https://cua.ai/driver/install.ps1 | iex
```

安装仅用于本插件，已关闭安装器自动连接其他客户端和安装后自测。驱动 0.53.0 默认启用不含操作内容的产品遥测，可用 `cua-driver telemetry disable` 关闭。

## 打包

PI-Desktop 的 PluginCheck / PluginPack，目录 `pi-computer-use`。不要手工压 zip。

## 用法

- 先看一眼窗口，再动手；点完、打完字，别把「已经发出去」当成「事情做完了」
- 要停就按键盘 Esc，或点面板上的停止
- 不会去动密码管理器、终端、锁屏、Windows 安全中心、PI-Desktop、ChatGPT、Codex

## 协议

MPL-2.0。cua-driver 仍是 MIT，见 `THIRD_PARTY_NOTICES.md`。
