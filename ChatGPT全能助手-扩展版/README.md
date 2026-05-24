# ChatGPT 全能助手 · Specimen（浏览器扩展版）

把同名油猴脚本 `ChatGPT全能助手.user.js` 1:1 移植为 Manifest V3 浏览器扩展。
Chrome、Microsoft Edge、Mozilla Firefox 共用同一份目录与代码。

## 功能

与油猴版完全一致，不增不减：

- 在 ChatGPT 页面右下角注入一颗 Specimen 风格浮窗按钮，点击打开「全能助手」面板。
- ChatGPT Session 一键导出 9 种主流格式：`auth.json` / Cockpit / Codex Auth / CPA / Sub2API / 9router / AxonHub / Codex-Manager / 原始 Session。
- **v2.3.0 新增**：「导入 · 转换」Tab —— 把别人给的任意 JSON 文件（11 种来源自动识别：Sub2API / Cockpit / auth.json / CPA / 9router / AxonHub / Codex-Manager / 原 Session / Codex Auth / 裸 JWT / 数组形式）粘进来，互转出 9 种目标格式中任意一种或全部，支持多账号批量。
- 生成 Plus 多区域订阅链接（PayPal 欧元区、法区、日区直绑、印尼 GoPay）。
- 生成 Team 工作区订阅链接，自定义工作区名、座位数、促销码、国家/币种/周期。
- 浮窗位置可拖拽并持久化到 `localStorage`。

## 触发入口（功能等价于油猴菜单）

| 入口 | 油猴版 | 扩展版 |
| --- | --- | --- |
| 浮窗按钮 | 右下角圆形按钮 | 完全保留 |
| 菜单命令 | Tampermonkey 油猴菜单「打开 CKNB ChatGPT 全能助手」 | 浏览器工具栏图标 + 页面右键菜单 |
| 快捷键 | `Cmd/Ctrl + Shift + K`（脚本内监听） | 完全一致，由 content.js 内同一份 keydown 监听器处理，未引入扩展级快捷键以避免双重路径 |

## 目录结构

```
ChatGPT全能助手-扩展版/
├── manifest.json        MV3 清单，三家浏览器共用
├── content.js           主脚本（由 .user.js 截取 IIFE 主体 + 追加扩展消息桥）
├── background.js        Service Worker：图标点击 / 右键菜单 → 消息转发
├── icons/
│   ├── icon-16.png      工具栏小图标
│   ├── icon-48.png      扩展管理页中等图标
│   └── icon-128.png     商店大图标
├── README.md            本文件
└── 安装说明.md          Chrome / Edge / Firefox × Mac / Windows 装载步骤
```

## 站点匹配

仅在以下两个域名启用，与油猴版 `@match` 等价：

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

不在其他网站执行任何脚本，工具栏图标在非匹配站点点击会自动跳转到 ChatGPT 主页。

## 与油猴版的代码差异

为保证「功能完全一样」，主体逻辑零修改，仅有两处必要桥接：

1. 头部去掉 `// ==UserScript== ... // ==/UserScript==` 元数据块（扩展不使用）。
2. IIFE 内部 `init()` 之前追加 18 行 `chrome.runtime.onMessage` 监听，用于接收 background.js 转发的 `CKNB_OPEN_MODAL` 消息。

油猴 API 在扩展环境下自动降级：

- `GM_setClipboard` → 走脚本内已有的 `navigator.clipboard.writeText()` / `document.execCommand('copy')` 双重 fallback。
- `GM_registerMenuCommand` → 由 background.js 用 `chrome.contextMenus` + `chrome.action.onClicked` 等价实现。

## 作者

- 微信：1837620622（传康Kk）
- 邮箱：2040168455@qq.com
- B 站 / 咸鱼：万能程序员
- GitHub：https://github.com/1837620622
