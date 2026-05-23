<div align="center">

# ChatGPT 全能助手 · Specimen

### 一键导出 9 种主流认证格式 · Plus / Team 订阅链接一站生成

<br>

<sub>Tampermonkey 用户脚本 · 注入到 chatgpt.com · 数据全程本地处理 · 零依赖</sub>

<br>

<sub>**ChatGPT Session All-in-One Toolbox** — Session → auth.json / CPA / Sub2API / Cockpit / 9router / AxonHub / Codex-Manager / Codex / Raw, plus Plus & Team checkout link generator.</sub>

<br>

[![version](https://img.shields.io/badge/版本-2.1.0-ff5722?style=for-the-badge&labelColor=1a1614)](https://github.com/1837620622/chatgpt-specimen-toolbox/releases)
[![tampermonkey](https://img.shields.io/badge/Tampermonkey-required-16a34a?style=for-the-badge&labelColor=1a1614)](https://www.tampermonkey.net/)
[![license](https://img.shields.io/badge/许可证-MIT-6b6660?style=for-the-badge&labelColor=1a1614)](./LICENSE)
[![target](https://img.shields.io/badge/目标域名-chatgpt.com-2563eb?style=for-the-badge&labelColor=1a1614)](https://chatgpt.com)

[功能特性](#一-功能特性) · [格式矩阵](#二-9-种导出格式) · [安装方法](#四-安装方法) · [使用流程](#五-使用流程) · [设计语言](#六-设计语言) · [常见问题](#九-常见问题) · [联系方式](#十一-联系方式)

</div>

---

## 一 · 功能特性

一句话：**把 `https://chatgpt.com/api/auth/session` 那一坨 JSON，一键变成所有主流中转 / Codex / CLI 工具能直接吃的导入文件，顺手生成 Plus / Team 订阅链接。**

完整覆盖以下使用场景：

| 场景 | 说明 |
|:--|:--|
| **多账号管理** | 维护多个 ChatGPT 账号 / 多个 Codex 中转配置的开发者 |
| **中转搭建** | 用 CPA / Sub2API / Cockpit / 9router / AxonHub / Codex-Manager 之一搭中转 |
| **订阅体验** | 频繁拉起 Plus / Team 订阅 checkout 的研究 / 体验工作 |
| **去网页转换** | 厌倦"网页转换器 → 粘贴 → 跑一次"重复操作的玩家 |

---

## 二 · 9 种导出格式

全部对照上游 [`gtxx3600/GPTSession2CPAandSub2API`](https://github.com/gtxx3600/GPTSession2CPAandSub2API) 主分支逐行核对。**上游 schema 更新，本脚本会跟进。**

| 编号 | 格式 | 用途 | 关键字段 |
|:--:|:--|:--|:--|
| 01 | `auth.json`       | Codex CLI 原生（`~/.codex/auth.json`） | `auth_mode` · `tokens.{access,id,refresh}_token` |
| 02 | `Codex Auth`      | 重组 id_token 含 email / profile         | 兼容旧版 codex-auth.js 输出 |
| 03 | `CPA`             | CLI Proxy API 中转                       | 含 `id_token_synthetic` 合成 JWT 兜底 |
| 04 | `Sub2API`         | CPA2sub2API 项目                         | 账号级 `expires_at`（unix 秒）+ `auto_pause_on_expired` |
| 05 | `Cockpit`         | Cockpit Tools 扁平格式                   | `type=codex` · 字段全平铺 |
| 06 | `9router`         | 9router Codex OAuth                      | `providerSpecificData` 嵌套 |
| 07 | `AxonHub`         | AxonHub Codex auth.json                  | 缺 refresh_token 自动写占位 |
| 08 | `Codex-Manager`   | Codex-Manager 批量导入                   | `tokens` + `meta.{label,workspace_id,note}` |
| 09 | `Raw Session`     | 原始 `/api/auth/session` 输出            | 不变换，方便调试 |

---

## 三 · 订阅链接生成

### 3.1 ChatGPT Plus · 多区域

| 区域 | 国家 | 币种 | 备注 |
|:--|:--:|:--:|:--|
| **直绑**  | JP | JPY | 日本区直连，可绑信用卡 |
| **GoPay** | ID | IDR | 印尼区，门槛最低 |
| **PayPal** | US | USD | 美区，PayPal 友好 |

> 一键并发生成 3 个区域 · 自动附带 `plus-1-month-free` 优惠活动 · 最终支付方式由 ChatGPT / Stripe 决定

### 3.2 ChatGPT Team · 工作区订阅

| 配置项 | 说明 |
|:--|:--|
| **工作区名称** | 任意填写，将显示在 ChatGPT 后台 |
| **席位数量** | 最少 2，决定订阅起价 |
| **计费周期** | 按月 / 按年切换 |
| **优惠码** | 默认留空（满网优惠码每天都在失效，强烈建议自行从 linux.do / 蓝灯查最新） |
| **国家 / 币种** | 默认 US / USD，可改 |

> 生成 OpenAI 托管链接 + Stripe 直链，两份链接同时复制 / 打开。

### 3.3 内置 PayPal 0 元试用教程

脚本 Plus 标签页内置可折叠教程横幅（来源：linux.do · bdigu @rsharecn）：

```
┌─ PayPal 通道 · 不到 3 元拿下 PLUS  ──── [查看完整步骤] ─┐
│ 必备物料：Visa / Mastercard 美卡 · PayPal 接码 · 美国家宽 IP │
│ ─ 10 步完整流程（日本 IP 生成 → 美国 IP 打开 → PayPal） │
│ ─ 5 个州的焚决地址参考                                   │
│ ─ 支付失败排查（黄标 / 卡拒 / 验证码）                    │
└──────────────────────────────────────────────────────────┘
```

> 强烈提示：**必须用 Visa 或 Mastercard 美卡**。Amex / Discover / 国卡 / 国内 Visa 均不可。

---

## 四 · 安装方法

### 方法 A · 手动粘贴（最稳）

```bash
# 1. 浏览器装 Tampermonkey
https://www.tampermonkey.net/

# 2. 把脚本内容复制到剪贴板（任选）
pbcopy < ChatGPT全能助手.js                   # macOS
Get-Content ChatGPT全能助手.js | Set-Clipboard # Windows PowerShell

# 3. Tampermonkey 仪表盘 → 添加新脚本 → 全选删除默认 → 粘贴 → Cmd/Ctrl + S
# 4. 打开 https://chatgpt.com  右下角出现橙色"工具箱"按钮 = 成功
```

### 方法 B · `.user.js` 自动安装

把 `ChatGPT全能助手.user.js` 直接拖入浏览器，Tampermonkey 自动弹安装对话框。

> 仓库提供的 `.user.js` 后缀文件可直接用 GitHub raw 链接安装：
> ```
> https://raw.githubusercontent.com/1837620622/chatgpt-specimen-toolbox/main/ChatGPT全能助手.user.js
> ```

---

## 五 · 使用流程

```
                          ╭─[ FAB · 橙色椭圆悬浮按钮 · 可拖动 ]
                          │
                          ▼
   ╔═══════════════════════════════════════════════════════════════╗
   ║  · CKNB · CHATGPT 全能助手                                ✕   ║
   ║                                                               ║
   ║    ChatGPT 全能助手 · 工作台                                  ║
   ║                                                               ║
   ║    v2.1.0  ·  作者 传康KK-CKNB  ·  微信 1837620622             ║
   ╟───────────────────────────────────────────────────────────────╢
   ║   01 鉴权 · 导出      02 Plus 订阅       03 Team 订阅          ║
   ╟───────────────────────────────────────────────────────────────╢
   ║                                                               ║
   ║    [ 账户卡片 ]   邮箱 · 套餐徽章 · 账号 ID · 过期倒计时        ║
   ║                                                               ║
   ║    选择导出格式                                       9 种    ║
   ║    ┌──────────┬──────────┬──────────┬──────────┐              ║
   ║    │ auth.json│ Codex    │  CPA     │ Sub2API  │              ║
   ║    ├──────────┼──────────┼──────────┼──────────┤              ║
   ║    │ Cockpit  │ 9router  │ AxonHub  │ Codex-Mgr│              ║
   ║    └──────────┴──────────┴──────────┴──────────┘              ║
   ║                                                               ║
   ║    [复制当前]  [下载文件]  [打包全部]  [仅 Token]              ║
   ║                                                               ║
   ║    ┌─────────────────────────────────────────────────────┐   ║
   ║    │  {                                                  │   ║
   ║    │    "auth_mode": "chatgpt",                          │   ║
   ║    │    "tokens": { "access_token": "..." }              │   ║
   ║    │  }                                                  │   ║
   ║    └─────────────────────────────────────────────────────┘   ║
   ║                                                               ║
   ╠═══════════════════════════════════════════════════════════════╣
   ║   v2.1.0 · 9 种导出格式 · 3 个支付区域       ⌘⇧K 切换  Esc 关闭║
   ╚═══════════════════════════════════════════════════════════════╝
```

---

## 六 · 设计语言

不是 Linear、不是 Vercel、不是大圆角 macOS —— 一套刻意去 AI 味的中文工业设计：

### 6.1 配色

```
   背景          #fafaf8     纸白（warm paper white）
   表面          #ffffff     纯白卡片
   分隔          #f0eeea     轻分割线
   边框          #e8e6e0     一级边框
   正文          #1a1614     warm near-black
   次要          #6b6660     muted
   弱化          #aaa5a0     dim
   主色          #ff5722     信号橙（vibrant orange）
   主色悬停      #e63b1d     hot
   成功          #16a34a     绿
   危险          #dc2626     红
```

### 6.2 字体

```
   显示标题      得意黑 Smiley Sans      （CDN 加载，CSP 失败时回退）
   中文正文      PingFang SC / HarmonyOS Sans SC / Noto Sans SC
   等宽 / 代码   SF Mono / JetBrains Mono / Berkeley Mono

   禁用          Inter · Roboto · Arial · 任何 generic sans
```

### 6.3 形状与动效

```
   圆角          按钮 6px · 卡片 8-10px · 输入 6px · pill 999px
   边框          一律 1px · 信号色 left-border 3px
   阴影          仅 FAB 和 Modal 用 · 其余用边框
   动画          120-180ms ease-out · 不弹跳
   图标          全 SVG · 1.5px stroke · 零 emoji
```

---

## 七 · 快捷键 / 进阶用法

| 操作 | 入口 |
|:--|:--|
| 切换悬浮面板 | `⌘ + Shift + K`（Mac）/ `Ctrl + Shift + K`（Win） |
| 关闭面板 | `Esc` |
| Tampermonkey 菜单 | 单击 Tampermonkey 图标 → 「打开 CKNB ChatGPT 全能助手」 |
| 拖动 FAB | 鼠标长按 + 拖动（位置自动存 localStorage） |
| 只复制 access_token | Auth 标签 → 「仅 Token」按钮 |
| 全部下载 | 「打包全部」按钮一次触发 9 个文件 |

---

## 八 · 安全 · 隐私 · 风险

- **所有处理本地完成**。Session JSON 从未离开你的浏览器，没有第三方服务器、没有上报、没有 telemetry。
- 但 `access_token` / `session_token` **等同密码**：
  - 别截图发群里
  - 别上传到公开仓库
  - 别贴 GitHub issue / Discord 帮助频道
- Plus / Team 链接生成会调用 ChatGPT 官方 `/backend-api/payments/checkout`，请确认账号风险承受度。
- 优惠码字段空着 = 不附带，安全；写错码会被 OpenAI 服务端拒绝（HTTP 400）。
- 多账号循环 / 重放滥用属灰区，自己拿捏。

---

## 九 · 常见问题

<details>
<summary><b>装上之后右下角没有按钮？</b></summary>

1. **Tampermonkey 图标是不是灰色？** 灰色 = 整体禁用，点亮它。
2. **仪表盘里这个脚本的开关是不是绿色启用？** 红色 = 单独禁用，需要打开。
3. **当前网页是不是 `chatgpt.com/*`？** 老的 `chat.openai.com` 也匹配，但 OpenAI 已重定向到 chatgpt.com。
4. **F12 控制台有红字报错？** 多半是某些扩展（如部分广告拦截）注入 CSP 阻拦了，请把 chatgpt.com 加白名单。
</details>

<details>
<summary><b>auth.json 导出报"缺 session_token"？</b></summary>

ChatGPT 在 2025 Q1 后部分账号的 Web session 已经**不再返回 `sessionToken`**，这是 OpenAI 端的变更。受影响时：
- `auth.json` 这一个格式确实无法生成（按钮会被禁用）
- **但其他 8 个格式不受影响**，会自动跳过这一条
- 解决方案：去 codex CLI 用 `codex login` 重新登录，会生成完整 auth.json
</details>

<details>
<summary><b>Codex-Manager 里 `id_token` 是空字符串？</b></summary>

Codex-Manager **故意**只接受真实的 `id_token`，缺失就保留 `""` 空串。因为 Codex-Manager 后台会尝试用 `id_token` 刷新 token，给个伪造的合成 JWT 反而触发 Auth0 错误。

这是上游设计如此，不是 bug。其他格式（CPA / AxonHub）则会构造合成 JWT 兜底使用。
</details>

<details>
<summary><b>Plus 链接生成失败？</b></summary>

最常见两种原因：
1. **已经是 Plus 订阅了**，不能重复订阅 → 错误信息会包含 `existing_subscription`
2. **区域 country/currency 与账号绑定地区不匹配** → 试试 GoPay/Indonesia（最宽松）
</details>

<details>
<summary><b>会影响 ChatGPT 网页本身吗？</b></summary>

完全不会。脚本：
- `@noframes` 保证不在 iframe 内运行
- `@run-at document-idle` 等 DOM 稳定后再注入
- 所有 DOM 操作都在自己的 `<div id="cknb-specimen-*">` 命名空间内
- 不修改任何 ChatGPT 原生元素
- 不发送任何额外网络请求（除了用户主动点按钮时调用 `/api/auth/session` 和 `/backend-api/payments/checkout`，两者都是 ChatGPT 自身的端点）
</details>

<details>
<summary><b>得意黑字体加载失败 / 显示成系统字体？</b></summary>

正常现象。脚本从 jsDelivr CDN 加载 [得意黑 Smiley Sans](https://github.com/atelier-anchor/smiley-sans)，若 ChatGPT 的 CSP 阻拦了外部字体，浏览器会**静默回退**到：

```
PingFang SC → HarmonyOS Sans SC → Noto Sans SC → Hiragino Sans GB → 系统默认
```

功能完全不受影响，只是大标题没有「斜体得意黑」的帅气感。如果重视，可以在 Tampermonkey 设置里给 chatgpt.com 关闭 CSP 检测。
</details>

---

## 十 · 路线图

- [ ] 多账号 specimen library —— 一次保留多个账号的导出快照
- [ ] 导出格式自定义模板（用户自己写 JS 函数）
- [ ] Codex-Manager 真实 `id_token` 自动刷新（需要 Auth0 PKCE 流程）
- [ ] 浏览器扩展版（Manifest V3，免装 Tampermonkey）
- [ ] 国际化（en / ja / ko）

---

## 十一 · 联系方式

```
   作者     传康KK-CKNB
   微信     1837620622
   GitHub   https://github.com/1837620622
```

任何 bug / feature request / 中转工具新 schema → 优先 GitHub Issues，备用微信。

---

## 十二 · 致谢

- [`gtxx3600/GPTSession2CPAandSub2API`](https://github.com/gtxx3600/GPTSession2CPAandSub2API) —— 9 种格式 schema 的权威来源
- [`penguin-oo/GPTSession2CPAandSub2API-ext`](https://github.com/penguin-oo/GPTSession2CPAandSub2API-ext) —— 浏览器扩展版的参考
- [`atelier-anchor/smiley-sans`](https://github.com/atelier-anchor/smiley-sans) —— 得意黑字体
- linux.do 的中转玩家社区

---

## 许可证

[MIT](./LICENSE) © 2026 传康KK-CKNB

<div align="center">

<sub>本仓库不接受任何形式的 Token 上传、账号分发、滥用请求。<br>
仅供个人学习 / 本地实验 / 授权范围内的研究使用。</sub>

</div>
