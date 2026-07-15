# ChatGPT 全能助手 · Specimen（浏览器扩展版）

**版本 2.5.2**（与 `manifest.json` / `content.js` 的 `VERSION` 一致）。

把同名油猴脚本 `ChatGPT全能助手.user.js`（注意后缀是 `.user.js`，不是 `.js`）1:1 移植为 Manifest V3 浏览器扩展。
Chrome、Microsoft Edge、Mozilla Firefox 共用同一份目录与代码。

## 功能

与油猴版功能对齐，不增不减：

- 在 ChatGPT 页面右下角注入一颗 Specimen 风格浮窗按钮，点击打开「全能助手」面板。
- ChatGPT Session 一键导出 9 种主流格式：`auth.json` / Cockpit / Codex Auth / CPA / Sub2API / 9router / AxonHub / Codex-Manager / 原始 Session。
- **导入 · 转换** Tab：任意 JSON（11 种来源自动识别：Sub2API / Cockpit / auth.json / CPA / 9router / AxonHub / Codex-Manager / 原 Session / Codex Auth / 裸 JWT / 数组形式）互转出 9 种目标格式；支持多账号批量**导出**（注意：这是格式互转的批量，不是 Plus 区域批量生成）。
- **v2.4.x 长链引擎**：Stripe `payment_pages/{cs}/init` + host 重写为 `pay.openai.com`；跨域由 background service worker 代发；失败时可经 `codex-bypass.chuankangkk.top` 代理兜底。
- **Plus 订阅链接**：15 个区域预设（欧元区 PayPal 池、日区直绑、印尼 GoPay、印度 UPI、巴西 PIX、英区、美区兜底）+ 自定义 country/currency；**仅单条生成**——点选一个区域或自定义参数；**后生成的链接会使先前链接失效**。已移除「批量生成全部区域」「仅批量欧元区 PayPal 池」。
- **Team 工作区订阅链接**：自定义工作区名、座位数、促销码、国家/币种/周期；字段实时持久化。
- **v2.5.1**：
  - Plus 横幅改为「代充已封控 · 请购买成品号」（微信 **传康KK / 1837620622**，加好友请备注「购买成品号」· **无无偿服务**）；旧版「不到 3 元拿下 PLUS」教程已删除，不再维护。
  - 外壳 chrome + Plus 横幅/详情中英双语：按系统时区自动切换，面板右上角可手动覆盖并记住偏好。
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
├── manifest.json        MV3 清单，三家浏览器共用（version 2.5.1）
├── content.js           主脚本（由 .user.js 截取 IIFE 主体 + 追加扩展消息桥）
├── background.js        Service Worker：图标点击 / 右键菜单 / Stripe init 代发
├── rules.json           declarativeNetRequest：剥离 Stripe 请求 Origin（长链兼容）
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

功能对齐（导出 / 导入互转 / Plus·Team 单条取链 / 双语外壳 / 代充封控提示）。除下列**预期桥接**外，业务逻辑应与 `ChatGPT全能助手.user.js` 保持同步；改一端时请对照另一端。

1. 头部去掉 `// ==UserScript== ... // ==/UserScript==` 元数据块（扩展不使用）。
2. IIFE 内部 `init()` 之前追加 `chrome.runtime.onMessage` 监听，用于接收 background.js 转发的 `CKNB_OPEN_MODAL` 消息。
3. **v2.4.x 长链引擎跨域桥**：油猴版第 2 步（Stripe `payment_pages/{cs}/init`）用 `GM_xmlhttpRequest` 直接跨域发；扩展版 content script 受所在页面 CORS 约束，改为通过 `CKNB_STRIPE_INIT` 消息把 url / headers / body 转交 background service worker 代发（manifest `host_permissions` 含 `https://api.stripe.com/*` 与代理域 `https://codex-bypass.chuankangkk.top/*`），再把响应回传。`rules.json` 在网络层剥离发往 Stripe 的 `Origin` 头。
4. 调试日志文案可略有不同；**取链兜底策略应对齐**（Stripe init 无 hosted URL 时用 `client_secret` 拼片段；整段 init 失败再回退 `buildBothCheckoutUrls`）。

油猴 API 在扩展环境下自动降级：

- `GM_setClipboard` → 走脚本内已有的 `navigator.clipboard.writeText()` / `document.execCommand('copy')` 双重 fallback。
- `GM_registerMenuCommand` → 由 background.js 用 `chrome.contextMenus` + `chrome.action.onClicked` 等价实现。
- `GM_xmlhttpRequest`（长链第 2 步跨域）→ 由 background service worker 持主机权限代发，绕过 content script 的 CORS 限制。

## 与主 README 一致的使用约束（v2.5.2）

| 约束 | 说明 |
|:--|:--|
| 代充已封控 | 不再提供低价代充 /「不到 3 元拿下 PLUS」教程；成品号联系微信 **传康KK（1837620622）**（备注「购买成品号」· **无无偿服务**） |
| 仅单条生成 | Plus 一次只生成一条；不要连续狂点多个区域 |
| 后链失效前链 | 新 checkout 生成后，旧链接往往会失效；只用最新一条付款 |
| 双语范围 | 外壳 + Plus 封控横幅/详情；Auth / Team / 导入正文仍以中文为主 |

完整格式表、区域表、FAQ 见仓库根目录 [`README.md`](../README.md)。

## 作者

- 微信：1837620622（传康KK）· 加好友请备注「购买成品号」· **无无偿服务**
- 邮箱：2040168455@qq.com
- B 站 / 咸鱼：万能程序员
- GitHub：https://github.com/1837620622
