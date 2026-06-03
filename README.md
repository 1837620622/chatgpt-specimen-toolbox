<div align="center">

# ChatGPT 全能助手 · Specimen

### 一键导出 9 种主流认证格式 · 反向导入 11 种来源互转 · Plus / Team 订阅链接一站生成

<br>

<sub>Tampermonkey 用户脚本 · 注入到 chatgpt.com · 数据全程本地处理 · 零依赖</sub>

<br>

<sub>**ChatGPT Session All-in-One Toolbox** — Session ↔ auth.json / CPA / Sub2API / Cockpit / 9router / AxonHub / Codex-Manager / Codex / Raw — bidirectional N×N conversion matrix, plus Plus & Team checkout link generator.</sub>

<br>

[![version](https://img.shields.io/badge/版本-2.4.1-ff5722?style=for-the-badge&labelColor=1a1614)](https://github.com/1837620622/chatgpt-specimen-toolbox/releases)
[![tampermonkey](https://img.shields.io/badge/Tampermonkey-required-16a34a?style=for-the-badge&labelColor=1a1614)](https://www.tampermonkey.net/)
[![license](https://img.shields.io/badge/许可证-MIT-6b6660?style=for-the-badge&labelColor=1a1614)](./LICENSE)
[![target](https://img.shields.io/badge/目标域名-chatgpt.com-2563eb?style=for-the-badge&labelColor=1a1614)](https://chatgpt.com)

[功能特性](#一-功能特性) · [9 种导出](#二-9-种导出格式) · [11 种导入互转](#三-11-种来源导入--n×n-互转) · [订阅链接](#四-订阅链接生成) · [安装方法](#五-安装方法) · [使用流程](#六-使用流程) · [常见问题](#十-常见问题) · [联系方式](#十二-联系方式)

</div>

---

## 一 · 功能特性

一句话：**把 `https://chatgpt.com/api/auth/session` 那一坨 JSON，一键变成所有主流中转 / Codex / CLI 工具能直接吃的导入文件；反过来也行 —— 别人给的任意 JSON 文件丢进来，自动识别格式并转出 9 种你想要的目标格式；顺手生成 Plus / Team 订阅链接。**

完整覆盖以下使用场景：

| 场景 | 说明 |
|:--|:--|
| **多账号管理** | 维护多个 ChatGPT 账号 / 多个 Codex 中转配置的开发者 |
| **中转搭建** | 用 CPA / Sub2API / Cockpit / 9router / AxonHub / Codex-Manager 之一搭中转 |
| **跨工具迁移** | 朋友给了一份 Sub2API 包，你需要的是 Cockpit / auth.json —— **导入·转换 Tab** 一秒搞定 |
| **iCloud 备份恢复** | iCloud 同步备份里的 `accounts_*.json` 直接拖进来识别为 Sub2API，按需输出 |
| **订阅体验** | 频繁拉起 Plus / Team 订阅 checkout 的研究 / 体验工作 |
| **代付 / 帮别号生成** | 粘贴朋友的 access_token，自定义 Session 模式给别号生成支付链接（payurl.ark2.cn 同款用法） |
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

## 三 · 11 种来源导入 & N×N 互转

> v2.3.0 新增。从 chatgpt.com 抓取 session 不再是唯一入口 —— 把**任意来源**的 JSON 文件粘进来 / 拖进来，工具自动识别格式并互转出所有目标格式。

### 3.1 支持的输入来源

| # | 来源 | 触发特征（自动识别用） | 示例场景 |
|:--:|:--|:--|:--|
| 01 | **原始 Session**         | `accessToken` + `user` / `account` 嵌套 | 备份的网页 session JSON |
| 02 | **auth.json**            | `auth_mode: "chatgpt"` + `tokens.account_id` | Codex CLI 的 `~/.codex/auth.json` |
| 03 | **Codex Auth**           | 只有 `tokens.{id_token, access_token}` | 旧版重组 id_token 输出 |
| 04 | **CPA**                  | `type: "codex"` + 平铺字段（无 tokens 嵌套） | CLI Proxy API 中转 · 你 Python 脚本的输出格式 |
| 05 | **Sub2API**              | `accounts: [{credentials: {...}, extra: {...}}]` | iCloud 备份里的 `accounts_*.json` |
| 06 | **Cockpit**              | `tokens` 嵌套 + 平铺 `account_id` / `expired` | Cockpit Tools 导出 |
| 07 | **9router**              | camelCase `accessToken` + `providerSpecificData` | 9router 后台导出 |
| 08 | **AxonHub**              | `auth_mode: "chatgpt"` + `axonhub_*` 标记 | AxonHub 后台 |
| 09 | **Codex-Manager**        | `tokens` + `meta` 双块 | Codex-Manager 批量导入产物 |
| 10 | **裸 Token**             | 一个三段式 JWT 字符串 | 只有 access_token 在手 |
| 11 | **数组形式**             | 上述任意格式的 `[...]` 数组 | 多账号批量导入 |

> **关键能力**：即使输入只给了一个 `access_token`，工具会从 JWT payload 里把 `email` / `chatgpt_account_id` / `plan_type` / `exp` 全部"挖"出来，最大化可转换的目标格式数。

### 3.2 N×N 互转矩阵

任意 11 种来源 → 任意 9 种目标格式（共 99 条转换路径）。

```
       │ auth │cockpit│codex│ cpa │sub2api│9router│axonhub│cm   │ raw │
───────┼──────┼──────┼─────┼─────┼──────┼──────┼──────┼─────┼─────┤
原 Session │  ✓   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✓  │  ✓  │  ✓  │
auth.json  │  ✓   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✓  │  ✓  │  ✓  │
Codex Auth │  ✱   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✱  │  ✓  │  ✓  │
CPA        │  ✱   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✓  │  ✓  │  ✓  │
Sub2API    │  ✱   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✓  │  ✓  │  ✓  │
Cockpit    │  ✱   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✓  │  ✓  │  ✓  │
9router    │  ✱   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✓  │  ✓  │  ✓  │
AxonHub    │  ✓   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✓  │  ✓  │  ✓  │
Codex-Mgr  │  ✱   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✓  │  ✓  │  ✓  │
裸 Token   │  ✱   │  ✓   │  ✓  │  ✓  │   ✓  │   ✓  │   ✱  │  ✓  │  ✓  │
数组         （递归展开为多账号，每条独立转换）
```

> ✓ = 可转换 · ✱ = 源数据缺 `session_token` 或 `refresh_token` 字段时，目标 `auth.json` / `AxonHub` 会标灰，hover 看具体原因（OpenAI 2025 Q1 后部分账号已不再返回 `sessionToken`，这一格是上游限制不是 bug）

### 3.3 流程

```
   ┌─── 粘贴 JSON 文本     ┐
   ├─── 上传 .json 文件    │       ┌── 自动识别（推荐）
   ├─── 读剪贴板           ├──→   ┤                       ──→  [反向解析]  ──→  [虚拟 Session]
   └─── 填入示例           ┘       └── 手动覆盖来源格式                          ↓
                                                                       [复用现有 9 种导出器]
                                                                                ↓
                                              ┌─── 复制 / 下载单条 ───┐
                                              ├─── 打包此账号 9 种    │
                                              └─── 批量 · 所有账号 ───┘
```

### 3.4 多账号

| 输入 | 行为 |
|:--|:--|
| Sub2API `accounts: [...]` | 自动展开为 N 个账号，UI 显示账号 chip 列表，点击切换预览 |
| 顶层裸数组 `[a, b, c]` | 同上，递归识别每一项 |
| 单对象 | 包成 `[一个]`，UI 不显示 chip 列表 |
| 部分账号解析失败 | 失败账号 chip 标红，hover 看 error；不影响其他账号 |

### 3.5 隐私

与导出侧完全一致：**全程本地内存处理，无任何上传**。文件读取走 `FileReader.readAsText()`，剪贴板走 `navigator.clipboard.readText()`（需用户主动点按钮触发），既不写 cookie 也不发请求。

---

## 四 · 订阅链接生成

> v2.3.3 重写。请求体逐字段对齐 ChatGPT 网页内置 Plus / Team 升级弹窗，参考 [QLHazyCoder/FlowPilot](https://github.com/QLHazyCoder/FlowPilot)（⭐4442 · 2026-05-25 v2.5）+ [DanOps-1/Gpt-Agreement-Payment](https://github.com/DanOps-1/Gpt-Agreement-Payment)（⭐1785 · 2026-05-25）的最新实现。

### 4.1 ChatGPT Plus · 13 个区域预设 + 自定义

| 编号 | 区域 | 国家 | 币种 | PayPal 入口 | 备注 |
|:--:|:--|:--:|:--:|:--:|:--|
| 01 | **PayPal · 德国**   | DE | EUR | ✓ | 教程主推 · 欧元区首选 · 0 刀薅最稳 |
| 02 | **PayPal · 法国**   | FR | EUR | ✓ | 欧元区备选 · 德区拒卡时优先换法区 |
| 03 | **PayPal · 意大利** | IT | EUR | ✓ | 欧元区备选 · 2026 新增 |
| 04 | **PayPal · 西班牙** | ES | EUR | ✓ | 西卡友好 |
| 05 | **PayPal · 荷兰**   | NL | EUR | ✓ | iDEAL + PayPal |
| 06 | **PayPal · 比利时** | BE | EUR | ✓ | Bancontact 区 |
| 07 | **PayPal · 奥地利** | AT | EUR | ✓ | EPS 区 |
| 08 | **PayPal · 葡萄牙** | PT | EUR | ✓ | 冷门可用 |
| 09 | **PayPal · 爱尔兰** | IE | EUR | ✓ | 英语界面 |
| 10 | **PayPal · 英国**   | GB | GBP | ✓ | 英镑区 · PayPal 也常出现 |
| 11 | **日区直绑**         | JP | JPY | – | 日卡 / Wise 直绑（不走 PayPal，需真日卡） |
| 12 | **GoPay · 印尼**     | ID | IDR | – | 印尼区 GoPay · 教程称已被薅烂封号高发 |
| 13 | **美区兜底**         | US | USD | – | OpenAI 默认区域 · 通常无 PayPal 入口但**卡直付最稳** · 欧元区全失败时的最后兜底 |

> OpenAI / Stripe 会定期调整 country → 支付方式映射。**某国当下没 PayPal 入口不代表脚本坏**，依次试欧元区其他国家即可。

**三种生成模式**：

```
单区域生成（点单个区域卡片）
    ↓
12 区域全量批量（"批量生成 12 个区域"按钮）
    ↓
仅欧元区 PayPal 池（"仅批量欧元区 PayPal 池"按钮 · 9 国并发 · 找 PayPal 专用）
    ↓
自定义 country / currency（输入任意 ISO 2 + ISO 3 字母代码）
```

### 4.2 自定义 Session 模式（v2.3.3 新增 · payurl.ark2.cn 同款用法）

不局限于「当前登录账号」—— 在 Plus Tab 顶部「Session 来源」切换器选「自定义 Session」，粘贴任意账号的 token 即可生成。

**支持四种粘贴形态自动识别**：

| 形态 | 示例 | 自动处理 |
|:--|:--|:--|
| 纯 JWT | `eyJ...xxx.yyy.zzz` | 直接用 |
| 带 Bearer 前缀 | `Bearer eyJ...` | 自动去前缀 |
| 整段 session JSON | `{"accessToken": "eyJ..."}` | 自动提取 accessToken 字段 |
| auth.json / Sub2API / CPA 等格式 | `{"tokens": {"access_token": "eyJ..."}}` | 自动从嵌套字段挖（与第三章导入器复用同款逻辑）|

**持久化**：粘贴的 token 自动保存到 localStorage（你自己的浏览器本地），下次打开还能用，不必重粘。

### 4.3 ⚠️ 双链返回机制（v2.3.3 关键修复）

每次生成会**同时返回两条链接**，按你的使用场景选用：

| 链接类型 | 示例 | 适用场景 |
|:--|:--|:--|
| **① 外部 Stripe 长链** | `https://pay.openai.com/c/pay/cs_live_xxx#fid=xxx` | **standalone 不依赖任何 cookie** · 在指纹浏览器 / 美国 IP / 任意干净环境打开 · **用户主要场景**（薅 PayPal 试用、帮别人付款）|
| **② 内部 ChatGPT 短链** | `https://chatgpt.com/checkout/openai_ie/cs_live_xxx` | 仅当前登录账号当前浏览器可用 · session cookie 自动认证 · 备选 |

> **v2.3.2 → v2.3.3 关键变更**：v2.3.2 错误地用 `checkout_ui_mode: 'custom'` 只返回 chatgpt.com 内部链接 —— 用户在指纹浏览器干净环境打开时因为没 ChatGPT session 而到最后**无法付款**。v2.3.3 改回 `'hosted'` 模式返回 standalone Stripe 长链，同时从同一个 `checkout_session_id` 拼出内部 wrapper 短链作为备选。**两条同时给，按场景选**。

### 4.3.1 ⭐ v2.4.0 长链引擎升级（Stripe init 三步法）

旧版只从 hosted 响应直接取 `data.url`，或拿 `client_secret` 手工拼 `#fid` 片段。问题是 hosted 模式下 OpenAI 经常**不回完整片段**，拼出来的 `pay.openai.com` 长链打开后白屏 / 打不开。

v2.4.0 补上服务端同款关键一步，把取链改成确定可靠的三步法：

| 步骤 | 动作 | 产出 |
|:--:|:--|:--|
| 1 | `POST /backend-api/payments/checkout`（同源，带 access_token） | `checkout_session_id` + `publishable_key` |
| 2 | `POST api.stripe.com/v1/payment_pages/{cs}/init`（跨域，带 publishable_key） | 带权威 `#fid` 片段的 `checkout.stripe.com` hosted URL |
| 3 | host 重写 `checkout.stripe.com` → `pay.openai.com` | 最终可用长链 |

第 2 步是跨域请求，两端用各自平台最稳的方式绕过浏览器同源限制：

| 形态 | 跨域方案 | 声明 |
|:--|:--|:--|
| **油猴脚本** | `GM_xmlhttpRequest` 直接发，不受同源策略约束 | 头部 `@grant GM_xmlhttpRequest` + `@connect api.stripe.com` |
| **浏览器扩展** | content script 转交 background service worker 代发（SW 持主机权限不受 CORS 限制） | manifest `host_permissions` 增加 `https://api.stripe.com/*` |

> 第 2 步失败时**自动回退**到旧版取链逻辑（`data.url` / `client_secret` 拼片段），保证 v2.4.0 在任何情况下都不比 v2.3.x 差。

### 4.3.2 ⭐ v2.4.1 代理兜底（解决广告拦截扩展拉黑 Stripe）

部分用户浏览器装了广告拦截 / 安全扩展（uBlock Origin、AdGuard 等），会在内容脚本层将 `api.stripe.com` 加入黑名单，导致 Stripe init 请求被拦截（控制台报 `URL is blacklisted`）。

v2.4.1 在自有域名 `codex-bypass.chuankangkk.top` 部署了 Cloudflare Workers 代理端点，取链流程变成：

```
GM_xmlhttpRequest / background SW 直连 api.stripe.com
    ├─ 成功 → 直接返回（最快路径）
    └─ 失败（被拦截 / 超时 / 网络异常）
        └─ 自动降级走 codex-bypass.chuankangkk.top/api/stripe-proxy
            └─ Worker 转发到 Stripe（不带 Origin 头）→ 返回结果
```

> 代理只转发 Stripe init 请求，不带任何用户身份信息，不存储任何数据。广告拦截器不会拦截你自己的域名，因此这条路径始终可用。

### 4.4 ChatGPT Team · 工作区订阅

| 配置项 | 说明 |
|:--|:--|
| **工作区名称** | 任意填写，将显示在 ChatGPT 后台 |
| **席位数量** | 最少 2，决定订阅起价 |
| **计费周期** | 按月 / 按年切换 |
| **优惠码** | 默认留空（满网优惠码每天都在失效，强烈建议自行从 linux.do / 蓝灯查最新） |
| **国家 / 币种** | 默认 US / USD，可改 |
| **Session 来源** | 与 Plus 共享 · 切到自定义后 Team 也用粘贴的 token 生成 |

> **v2.3.4 起：6 个字段全部实时持久化到 localStorage** —— 你输入一个字就保存一次，不必等点「生成 Team 链接」才存。下次打开扩展面板，所有字段自动恢复上次的值；要清空回默认值点底部「重置」。

> Team 也支持双链：openai / stripe 两个域名镜像同时复制 / 打开。

### 4.5 请求体字段对照（开发者参考）

```js
// v2.3.3 最终请求体（hosted 模式 · 标准答案）
{
  entry_point: 'all_plans_pricing_modal',         // 或 'team_workspace_purchase_modal'
  plan_name: 'chatgptplusplan',                   // 或 'chatgptteamplan'
  checkout_ui_mode: 'hosted',                     // ← 决定性字段，'hosted' 才能拿外部 Stripe 长链
  billing_details: { country: 'DE', currency: 'EUR' },
  cancel_url: 'https://chatgpt.com/#pricing',
  promo_campaign: {
    promo_campaign_id: 'plus-1-month-free',
    is_coupon_from_query_param: false
  },
  // Team 还需要 team_plan_data: { workspace_name, price_interval, seat_quantity }
}
```

**字段黑名单（不要加，会污染默认行为）**：
- ❌ `success_url` — 让 OpenAI 后端自己注入（含 `{CHECKOUT_SESSION_ID}` 占位符）
- ❌ `locale` — 跟随浏览器
- ❌ `check_card_proxy` — 旧 API 字段，已过时

---

## 五 · 安装方法

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

## 六 · 使用流程

```
                          ╭─[ FAB · 橙色椭圆悬浮按钮 · 可拖动 ]
                          │
                          ▼
   ╔═══════════════════════════════════════════════════════════════╗
   ║  · CKNB · CHATGPT 全能助手                                ✕   ║
   ║                                                               ║
   ║    ChatGPT 全能助手 · 工作台                                  ║
   ║                                                               ║
   ║    v2.3.0  ·  作者 传康KK-CKNB  ·  微信 1837620622             ║
   ╟───────────────────────────────────────────────────────────────╢
   ║  01 鉴权·导出   02 Plus 订阅   03 Team 订阅   04 导入·转换     ║
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
   ║  v2.3.0 · 9 出 × 11 入 · 3 支付区  ⌘⇧K 切换  Esc 关闭         ║
   ╚═══════════════════════════════════════════════════════════════╝
```

切到 `04 导入 · 转换` Tab 后：

```
   ╔═══════════════════════════════════════════════════════════════╗
   ║   来源数据                          自动识别 11 种来源格式      ║
   ║   ┌──────────────────┐  ┌────────────────────────────┐        ║
   ║   │ 来源格式：自动识别 ▼│  │ 上传文件：[ 选择文件…    ] │        ║
   ║   └──────────────────┘  └────────────────────────────┘        ║
   ║   ┌─────────────────────────────────────────────────┐        ║
   ║   │ {                                               │        ║
   ║   │   "accounts": [{ "credentials": { ... } }]      │  ←粘贴 ║
   ║   │ }                                               │        ║
   ║   └─────────────────────────────────────────────────┘        ║
   ║   [解析并转换]  [读剪贴板]  [填示例]  [清空]                   ║
   ║                                                               ║
   ║   解析结果   总 3 · 成功 3 · 失败 0 · 来源 Sub2API             ║
   ║   ( #1 a@x.com )  ( #2 b@x.com )  ( #3 c@x.com )  ← 多账号 chip║
   ║                                                               ║
   ║   [ 账户卡片 · 当前选中账号 ]                                  ║
   ║                                                               ║
   ║   选择目标导出格式                  9 种 · 互转矩阵            ║
   ║   ┌──────────┬──────────┬──────────┬──────────┐              ║
   ║   │ auth.json│ Cockpit  │  CPA     │ Sub2API  │              ║
   ║   └──────────┴──────────┴──────────┴──────────┘              ║
   ║                                                               ║
   ║   [复制当前] [下载] [打包此账号 9 种] [批量·全部账号]          ║
   ╚═══════════════════════════════════════════════════════════════╝
```

---

## 七 · 设计语言

不是 Linear、不是 Vercel、不是大圆角 macOS —— 一套刻意去 AI 味的中文工业设计：

### 7.1 配色

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

### 7.2 字体

```
   显示标题      得意黑 Smiley Sans      （CDN 加载，CSP 失败时回退）
   中文正文      PingFang SC / HarmonyOS Sans SC / Noto Sans SC
   等宽 / 代码   SF Mono / JetBrains Mono / Berkeley Mono

   禁用          Inter · Roboto · Arial · 任何 generic sans
```

### 7.3 形状与动效

```
   圆角          按钮 6px · 卡片 8-10px · 输入 6px · pill 999px
   边框          一律 1px · 信号色 left-border 3px
   阴影          仅 FAB 和 Modal 用 · 其余用边框
   动画          120-180ms ease-out · 不弹跳
   图标          全 SVG · 1.5px stroke · 零 emoji
```

---

## 八 · 快捷键 / 进阶用法

| 操作 | 入口 |
|:--|:--|
| 切换悬浮面板 | `⌘ + Shift + K`（Mac）/ `Ctrl + Shift + K`（Win） |
| 关闭面板 | `Esc` |
| Tampermonkey 菜单 | 单击 Tampermonkey 图标 → 「打开 CKNB ChatGPT 全能助手」 |
| 拖动 FAB | 鼠标长按 + 拖动（位置自动存 localStorage） |
| 只复制 access_token | Auth 标签 → 「仅 Token」按钮 |
| 全部下载 | 「打包全部」按钮一次触发 9 个文件 |

---

## 九 · 安全 · 隐私 · 风险

- **所有处理本地完成**。Session JSON 从未离开你的浏览器，没有第三方服务器、没有上报、没有 telemetry。
- 但 `access_token` / `session_token` **等同密码**：
  - 别截图发群里
  - 别上传到公开仓库
  - 别贴 GitHub issue / Discord 帮助频道
- Plus / Team 链接生成会调用 ChatGPT 官方 `/backend-api/payments/checkout`，请确认账号风险承受度。
- 优惠码字段空着 = 不附带，安全；写错码会被 OpenAI 服务端拒绝（HTTP 400）。
- 多账号循环 / 重放滥用属灰区，自己拿捏。

---

## 十 · 常见问题

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
2. **区域 country/currency 与账号绑定地区不匹配** → 试试美区兜底（US/USD · 最稳）
</details>

<details>
<summary><b>选 PayPal 后，最后跳到「添加信用卡完成」界面，不能完成订阅？</b></summary>

**这是 PayPal 端的反诈机制，不是脚本的 bug**。PayPal 在以下情况会强制要求你换一张可用卡完成验证：

| 触发条件 | 应对方案 |
|:--|:--|
| PayPal 账号还没绑定有效卡 | 提前在 PayPal 内绑一张可用美卡（不一定是 0 刀那张） |
| 0 刀试用卡被 PayPal 拒（被薅怕了） | 换张别的卡试 / 换 IP 重新生成链接 |
| 当前 country 的 PayPal 通道临时风控 | 换其他欧元区国家重新生成（IE / AT / PT 这种冷门通道有时风控宽松） |
| 全部尝试失败 | 直接用「**美区兜底** US/USD」走信用卡直付（虽然不薅羊毛，但稳定） |

**关键认知**：脚本只负责生成 checkout 链接，**支付环节是你与 PayPal/Stripe 直接的事**，跟 chatgpt.com 已经无关。链接打开后的行为差异完全由 PayPal/Stripe 端决定。
</details>

<details>
<summary><b>支付完成后跳到 PayPal 注册新账号页，无法回到 ChatGPT finalize 订阅？</b></summary>

这个问题在 **v2.3.3 修复**了：旧版 v2.3.2 错误用 `checkout_ui_mode: 'custom'` 只产 chatgpt.com 内部链接，在指纹浏览器干净环境无法付款。v2.3.3 起改回 `'hosted'` 产 `pay.openai.com` 外部 standalone 长链。

如果你升级到 v2.3.3+ 还遇到回调问题，确认：
1. 是否用的「**外部 Stripe 长链**」（pay.openai.com 开头）而不是「内部 ChatGPT 短链」（chatgpt.com 开头）
2. 指纹浏览器是否能正常访问 `pay.openai.com` 域名
3. PayPal 完成后是否跳到了 `chatgpt.com/?finalize_subscription=true` 类似回调页（这是正常）
</details>

<details>
<summary><b>v2.3.4 我设置的 Team 工作区名/优惠码下次打开还在吗？</b></summary>

**会在**。v2.3.4 起 Team 表单的全部 6 个字段（workspace / seats / promo / country / currency / interval）都**每输入一个字符就实时保存到 localStorage**，不必等点「生成 Team 链接」才会保存。

下次打开扩展面板，所有字段会从 localStorage 自动恢复你上次填的值。

如要清空回默认值，点 Team Tab 底部的「重置」按钮。
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

## 十一 · 路线图

- [ ] 多账号 specimen library —— 一次保留多个账号的导出快照
- [ ] 导出格式自定义模板（用户自己写 JS 函数）
- [ ] Codex-Manager 真实 `id_token` 自动刷新（需要 Auth0 PKCE 流程）
- [x] 浏览器扩展版（Manifest V3，免装 Tampermonkey）—— v2.4.0 已实现
- [ ] 国际化（en / ja / ko）

---

## 十二 · 联系方式

```
   作者     传康KK-CKNB
   微信     1837620622
   GitHub   https://github.com/1837620622
```

任何 bug / feature request / 中转工具新 schema → 优先 GitHub Issues，备用微信。

---

## 十三 · 致谢

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
