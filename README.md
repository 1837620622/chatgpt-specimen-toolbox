<div align="center">

```
   ┌─────────────────────────────────────────────────┐
   │                                                 │
   │        C  K  N  B   ·   S P E C I M E N         │
   │                                                 │
   │    CHATGPT  ·  全能助手  ·  TAMPERMONKEY        │
   │                                                 │
   └─────────────────────────────────────────────────┘
```

**ChatGPT 工作台 · 一键导出 9 种主流认证格式 · 多区域订阅链接生成**

`Session → 9 Formats` · `Plus × 3 Regions` · `Team Workspace`

<sub>Tampermonkey 用户脚本 · ES2020+ · 零依赖 · 数据全程本地处理</sub>

<br>

![version](https://img.shields.io/badge/version-2.0.0-e8a737?style=flat-square&labelColor=15110b)
![tampermonkey](https://img.shields.io/badge/tampermonkey-required-7eb693?style=flat-square&labelColor=15110b)
![license](https://img.shields.io/badge/license-MIT-a89c83?style=flat-square&labelColor=15110b)
![chatgpt](https://img.shields.io/badge/target-chatgpt.com-d8972a?style=flat-square&labelColor=15110b)

</div>

---

## I · 这是什么

一句话：**把 `https://chatgpt.com/api/auth/session` 那一坨 JSON，一键变成所有主流中转 / Codex / CLI 工具能直接吃的导入文件，顺手生成 Plus / Team 订阅链接。**

不用打开网页转换器、不用复制粘贴、不用手改字段。脚本注入到 `chatgpt.com` 后会在右下角放一个标本化的悬浮入口，整个工作流都在你浏览器里跑完。

完美适合：

- 维护多个 ChatGPT 账号 / 多个 Codex 中转配置的开发者
- 用 CPA / Sub2API / Cockpit / 9router / AxonHub / Codex-Manager 之一搭中转的玩家
- 经常需要拉起 Plus / Team 订阅 checkout 的体验研究员
- 厌倦"网页转换器粘贴一次跑一次"的人

---

## II · 9 种导出格式 · 全部上游对齐

| 格式 | 用途 | 字段亮点 | 状态 |
|:--|:--|:--|:--:|
| `auth.json` | Codex CLI 原生（`~/.codex/auth.json`） | `auth_mode` · `tokens.{access,id,refresh}_token` | ✓ |
| `Codex Auth` | 重组 id_token 含 email/profile | 兼容旧版 codex-auth.js 输出 | ✓ |
| `CPA` | CLI Proxy API 中转 | 含 `id_token_synthetic` 兜底合成 JWT | ✓ |
| `Sub2API` | CPA2sub2API 项目 | 账号级 `expires_at`（unix 秒）+ `auto_pause_on_expired` | ✓ |
| `Cockpit` | Cockpit Tools 扁平格式 | `type=codex` · 字段全平铺 | ✓ |
| `9router` | 9router Codex OAuth | `providerSpecificData` 嵌套 | ✓ |
| `AxonHub` | AxonHub Codex auth.json | 缺 refresh_token 自动写占位 | ✓ |
| `Codex-Manager` | Codex-Manager 批量导入 | `tokens` + `meta.{label,workspace_id,note}` | ✓ |
| `Raw Session` | 原始 `/api/auth/session` 输出 | 不变换，方便调试 | ✓ |

> Schema 全部对照上游 [`gtxx3600/GPTSession2CPAandSub2API`](https://github.com/gtxx3600/GPTSession2CPAandSub2API) 主分支逐行核对，**任何中转工具 README 改字段，本脚本会跟进**。

---

## III · 订阅链接生成

```
┌────────────── PLUS ──────────────┐    ┌────────────── TEAM ──────────────┐
│                                  │    │                                  │
│  · 直绑    JP  /  JPY            │    │  · 工作区名称（自由填）           │
│  · GoPay   ID  /  IDR            │    │  · 席位数量（最少 2）             │
│  · PayPal  US  /  USD            │    │  · 月付 / 年付 切换              │
│                                  │    │  · 优惠码（留空 = 不用）          │
│  一键并发生成全部 3 个区域链接    │    │  · 国家 / 币种 自定义             │
│  自动附带 plus-1-month-free       │    │  生成 OpenAI + Stripe 双链接     │
│                                  │    │                                  │
└──────────────────────────────────┘    └──────────────────────────────────┘
```

> 优惠码默认**留空**——满网络优惠码每天都在失效，留写死的反而误事。请自行从 linux.do / 蓝灯查最新可用码。

---

## IV · 安装

### 方法 A · 直接装（推荐）

```bash
# 1. 浏览器装 Tampermonkey
#    https://www.tampermonkey.net/
# 2. 把脚本内容复制到剪贴板（任选其一）：
#    pbcopy < ChatGPT全能助手.js                              # macOS
#    cat ChatGPT全能助手.js | clip                            # Windows
# 3. Tampermonkey 仪表盘 → 添加新脚本 → 全选删除默认 → 粘贴 → Cmd/Ctrl+S
# 4. 打开 https://chatgpt.com  右下角出现琥珀色方形悬浮按钮 = 成功
```

### 方法 B · `.user.js` 自动安装

把 `ChatGPT全能助手.js` 重命名成 `ChatGPT全能助手.user.js`，浏览器双击该文件，Tampermonkey 会自动弹出安装对话框。

---

## V · 工作流图解

```
        ╭─ FAB（琥珀色悬浮按钮，可拖动）
        │
        ▼
   ╔═══════════════════════════════════════════════════════╗
   ║  CKNB · SPECIMEN  ·  v2.0.0                       ✕   ║
   ║                                                       ║
   ║  All-in-one for Session, Plus, Team                   ║
   ║                                                       ║
   ║  ── BY 传康KK-CKNB  ·  WECHAT 1837620622 ──           ║
   ╟───────────────────────────────────────────────────────╢
   ║  01 AUTH      02 PLUS      03 TEAM                    ║
   ╟───────────────────────────────────────────────────────╢
   ║                                                       ║
   ║  [SPECIMEN CARD]  邮箱 · plan 徽章 · 过期倒计时        ║
   ║                                                       ║
   ║  EXPORT FORMATS                          9 TARGETS    ║
   ║  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  ║
   ║  │ auth │ │ codex│ │ CPA  │ │ ...  │                  ║
   ║  └──────┘ └──────┘ └──────┘ └──────┘                  ║
   ║                                                       ║
   ║  [COPY] [DOWNLOAD] [BUNDLE ALL] [TOKEN ONLY]          ║
   ║                                                       ║
   ║  ┌─────────────────────────────────────────────────┐ ║
   ║  │ {                                               │ ║
   ║  │   "auth_mode": "chatgpt",                       │ ║
   ║  │   "tokens": { ... }                             │ ║
   ║  │ }                                               │ ║
   ║  └─────────────────────────────────────────────────┘ ║
   ║                                                       ║
   ╠═══════════════════════════════════════════════════════╣
   ║  SPECIMEN v2.0.0 · 9 FORMATS  ⌘⇧K TOGGLE  ESC CLOSE   ║
   ╚═══════════════════════════════════════════════════════╝
```

---

## VI · 设计语言 · Specimen

不是 Linear、不是 Vercel、不是 macOS 大圆角 —— 一种刻意去 AI 味的"标本式"工业设计：

```
       BG          #100e0a    warm near-black
       Surface     #15110b    raised
       Border      #2a241b    thin
       Text        #ede5d3    bone white
       Accent      #e8a737    signal amber
       Danger      #d44a3a    cherry red
       Success     #7eb693    sage
```

```
       Serif       Iowan Old Style / Hoefler Text / Charter / Cambria
       Mono        SF Mono / JetBrains Mono / Berkeley Mono / Consolas
       禁用         Inter · 圆角按钮 · 紫色渐变 · emoji 当 icon
```

排印做层级，颜色做信号。所有图标都是 1.5px stroke 的 SVG 线性图标。直角胜过圆角，但边框比阴影克制。

---

## VII · 快捷键 / 进阶用法

| 操作 | 快捷键 / 入口 |
|:--|:--|
| 切换悬浮面板 | `⌘ + Shift + K` （Mac）/ `Ctrl + Shift + K` （Win） |
| 关闭面板 | `Esc` |
| Tampermonkey 菜单 | 单击 Tampermonkey 图标 → "打开 CKNB Specimen Toolbox" |
| 拖动 FAB | 鼠标长按 + 拖动（位置自动保存到 localStorage） |
| 只复制 access_token | Auth 标签下 `TOKEN ONLY` 按钮 |
| 全部下载 | `BUNDLE ALL` 按钮一次性触发 9 个文件下载 |

---

## VIII · 安全 · 隐私 · 风险

- **所有处理本地完成**。Session JSON 从未离开你的浏览器，没有第三方服务器、没有上报、没有 telemetry。
- 但 `access_token` / `session_token` 等同密码 —— 别截图发群里、别上传到公开仓库、别贴 ticket。
- Plus / Team 链接生成会调用 ChatGPT 官方 `/backend-api/payments/checkout`，请确认账号风险承受度。
- 优惠码字段空着 = 不附带，安全；写错码会被 OpenAI 服务端拒绝，返回 400。
- 多账号循环 / 重放滥用属灰区，自己拿捏。

---

## IX · 常见问题

<details>
<summary><b>装上之后右下角没有按钮？</b></summary>

1. Tampermonkey 图标是不是灰色？灰色 = 整体禁用。
2. Tampermonkey 仪表盘里这个脚本的开关是不是绿色启用？
3. 当前网页是不是 `chatgpt.com/*`？老的 `chat.openai.com` 也匹配但 OpenAI 已重定向。
4. 浏览器 F12 控制台有红字报错？多半是某些扩展（如部分广告拦截）注入 CSP 阻拦了，请把 chatgpt.com 加白名单。
</details>

<details>
<summary><b>auth.json 导出报"缺 session_token"？</b></summary>

ChatGPT 在 2025/Q1 后部分账号的 Web session 已经不再返回 `sessionToken`，这是 OpenAI 端的变更。受影响时：
- `auth.json` 这一个格式确实无法生成
- 但其他 8 个格式不受影响，会自动跳过这条
</details>

<details>
<summary><b>Codex-Manager 里 `id_token` 是空的？</b></summary>

Codex-Manager **故意**只接受真实的 `id_token`，缺失就保留 `""`（空串）。因为 Codex-Manager 后台会尝试用 `id_token` 刷新 token，给个伪造的合成 JWT 反而触发错误。这是上游设计如此，不是 bug。
</details>

<details>
<summary><b>Plus 链接生成失败？</b></summary>

最常见两种原因：
1. 已经是 Plus 订阅了，不能重复订阅 → 错误信息会包含 `existing_subscription`。
2. 区域 country/currency 与账号绑定地区不匹配 → 试试 GoPay/Indonesia（最宽松）。
</details>

<details>
<summary><b>会不会影响 ChatGPT 网页本身？</b></summary>

不会。脚本：
- `@noframes` 保证不在 iframe 内运行
- `@run-at document-idle` 等 DOM 稳定后再注入
- 所有 DOM 操作都在自己的 `<div id="cknb-specimen-*">` 命名空间内
- 不修改任何 ChatGPT 原生元素
- 不发送任何额外网络请求（除了用户主动点按钮时调用 `/api/auth/session` 和 `/backend-api/payments/checkout`，两者都是 ChatGPT 自身的端点）
</details>

---

## X · 路线图

- [ ] 多账号 specimen library —— 一次保留多个账号的导出快照
- [ ] 导出格式自定义模板（用户自己写 JS 函数）
- [ ] Codex-Manager 真实 `id_token` 自动刷新（需要 Auth0 PKCE 流程）
- [ ] 浏览器扩展版（Manifest V3，免装 Tampermonkey）
- [ ] 国际化（en / ja / ko）

---

## XI · 联系方式

```
       AUTHOR    传康KK-CKNB
       WECHAT    1837620622
       GITHUB    https://github.com/1837620622
```

任何 bug / feature request / 中转工具新 schema → 优先 GitHub Issues，备用微信。

---

## XII · 致谢

- [`gtxx3600/GPTSession2CPAandSub2API`](https://github.com/gtxx3600/GPTSession2CPAandSub2API) —— 9 种格式 schema 的权威来源
- [`penguin-oo/GPTSession2CPAandSub2API-ext`](https://github.com/penguin-oo/GPTSession2CPAandSub2API-ext) —— 浏览器扩展版的参考
- linux.do 的中转玩家社区

---

## License

[MIT](./LICENSE) © 2026 传康KK-CKNB

<div align="center">

```
        ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
        SPECIMEN  ·  2.0.0  ·  END OF README
        ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
```

</div>
