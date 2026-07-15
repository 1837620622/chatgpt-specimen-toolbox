// ============================================================
// ChatGPT 全能助手 · Specimen  ——  扩展后台 Service Worker
// ------------------------------------------------------------
// 作用：把油猴脚本里 GM_registerMenuCommand 注册的「打开助手」入口
//      替换为浏览器扩展原生入口，包括：
//        1) 浏览器工具栏图标点击 → 通知当前页打开浮窗
//        2) 页面右键菜单「打开 CKNB ChatGPT 全能助手」→ 同上
//        3) 快捷键 Ctrl/Cmd + Shift + K 由 content.js 内 keydown 监听
//           （未声明 manifest.commands，避免与 content 双重路径）
//        4) content script 跨域代理：CKNB_STRIPE_INIT → Stripe init 代发
// ------------------------------------------------------------
// 兼容性：Chrome / Edge MV3 service worker 标准实现；
//        Firefox 121+ 已支持 background.service_worker 字段，
//        且 chrome.* 命名空间在 Firefox 中已镜像为 browser.*，
//        本文件统一用 chrome.* 写法，三家直接通用。
// ============================================================

// ------------------------------------------------------------
// 常量：消息协议
// ------------------------------------------------------------
const MSG_OPEN_MODAL = 'CKNB_OPEN_MODAL';

// ------------------------------------------------------------
// 站点匹配：与 manifest content_scripts.matches 保持一致
// 工具栏图标在非匹配站点点击时，引导用户跳转到 ChatGPT
// ------------------------------------------------------------
const ALLOWED_HOSTS = ['chatgpt.com', 'chat.openai.com'];

function isAllowedTab(tab) {
  if (!tab || !tab.url) return false;
  try {
    const u = new URL(tab.url);
    return ALLOWED_HOSTS.includes(u.hostname);
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------------
// 安装/启动钩子：注册右键菜单
// onInstalled 在首次安装、扩展更新、浏览器更新时都会触发
// ------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'cknb-open-modal',
        title: '打开 CKNB ChatGPT 全能助手',
        contexts: ['page', 'action'],
        documentUrlPatterns: [
          'https://chatgpt.com/*',
          'https://chat.openai.com/*'
        ]
      });
    });
  } catch (e) {
    // contextMenus 在极个别精简浏览器中可能不可用，静默忽略
  }
});

// ------------------------------------------------------------
// 工具：向指定 tab 投递「打开浮窗」消息
// 若 tab 不在允许域名，主动跳转到 ChatGPT 主页
// ------------------------------------------------------------
function dispatchOpenModal(tab) {
  if (!tab || typeof tab.id !== 'number') return;
  if (!isAllowedTab(tab)) {
    // 当前页不是 ChatGPT，引导跳转，落地后 content_script 会自动注入
    chrome.tabs.update(tab.id, { url: 'https://chatgpt.com/' });
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: MSG_OPEN_MODAL }, () => {
    // 即使 content script 还未注入，sendMessage 也会触发 lastError；
    // 此处读取 lastError 抑制控制台告警即可，无需重试
    void chrome.runtime.lastError;
  });
}

// ------------------------------------------------------------
// 入口 1：工具栏图标点击
// 由于 manifest 中无 default_popup，点击会触发 action.onClicked
// ------------------------------------------------------------
chrome.action.onClicked.addListener((tab) => {
  dispatchOpenModal(tab);
});

// ------------------------------------------------------------
// 入口 2：右键菜单点击
// ------------------------------------------------------------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info && info.menuItemId === 'cknb-open-modal') {
    dispatchOpenModal(tab);
  }
});

// ------------------------------------------------------------
// 入口 4：content script 跨域代理 —— Stripe payment_pages init
// ------------------------------------------------------------
// 长链引擎第 2 步要打 https://api.stripe.com/v1/payment_pages/{cs}/init，
// 与 chatgpt.com 不同源。MV3 里 content script 的 fetch 受所在页面同源
// 策略约束，跨域会被 CORS 拦；而 background service worker 持有 manifest
// host_permissions 里声明的 https://api.stripe.com/* 权限，由它代发即可
// 绕过 CORS。content.js 把 url / headers / body 通过 CKNB_STRIPE_INIT
// 消息发来，这里 fetch 后把状态码与响应文本原样回传。
//
// 安全约束（v2.5.1 审计加固）：
//   · 只接受来自 chatgpt.com / chat.openai.com 的 content script
//   · 直连 URL 必须是 api.stripe.com 的 payment_pages/{cs}/init
//   · headers 只转发 Authorization / Content-Type，拒绝任意头注入
//   · 网络失败或非 2xx 时才降级自有域名代理（403 Origin 等场景）
// ------------------------------------------------------------
const MSG_STRIPE_INIT = 'CKNB_STRIPE_INIT';

// 自有域名 Stripe 代理（广告拦截扩展拉黑 api.stripe.com 时兑底）
const STRIPE_PROXY = 'https://codex-bypass.chuankangkk.top/api/stripe-proxy';

// Stripe payment_pages init：cs_id 仅允许 Stripe 常见字符集
const STRIPE_INIT_RE = /^https:\/\/api\.stripe\.com\/v1\/payment_pages\/[A-Za-z0-9_\-]+\/init$/;

function isAllowedStripeInitUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'api.stripe.com') return false;
    if (u.search || u.hash) return false;
    return STRIPE_INIT_RE.test(u.origin + u.pathname);
  } catch (e) {
    return false;
  }
}

function isAllowedMessageSender(sender) {
  // 必须来自本扩展注入的 content script，且页面 host 在白名单
  // sender.id 在部分浏览器对同扩展 content script 可能缺省，缺省时放行本扩展上下文
  if (!sender) return false;
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  if (!sender.tab || typeof sender.tab.id !== 'number') return false;
  if (!sender.url) return false;
  try {
    const u = new URL(sender.url);
    return ALLOWED_HOSTS.includes(u.hostname) &&
      (u.protocol === 'https:' || u.protocol === 'http:');
  } catch (e) {
    return false;
  }
}

function pickStripeHeaders(headers) {
  const src = headers && typeof headers === 'object' ? headers : {};
  const out = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (typeof src.Authorization === 'string' && src.Authorization) {
    // 仅允许 Bearer pk_… 形态的公开 publishable key，拒绝其它密钥形态
    const auth = src.Authorization.trim();
    if (/^Bearer\s+pk_(live|test)_[A-Za-z0-9]+$/i.test(auth)) {
      out.Authorization = auth;
    }
  }
  if (typeof src['Content-Type'] === 'string' && src['Content-Type']) {
    // 固定为表单，忽略客户端任意 Content-Type 注入
    out['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  return out;
}

function sanitizeCsId(csId) {
  const s = String(csId || '');
  // Stripe checkout session id：cs_live_… / cs_test_…
  if (/^cs_(live|test)_[A-Za-z0-9]+$/.test(s)) return s;
  return '';
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 非本协议消息直接放行（让其它 listener 有机会处理）
  if (!msg || msg.type !== MSG_STRIPE_INIT) return;

  if (!isAllowedMessageSender(sender)) {
    sendResponse({ ok: false, error: '拒绝：非法消息来源' });
    return false;
  }

  if (!isAllowedStripeInitUrl(msg.url)) {
    sendResponse({ ok: false, error: '拒绝：URL 不在 Stripe init 白名单' });
    return false;
  }

  const csId = sanitizeCsId(msg.csId);
  const headers = pickStripeHeaders(msg.headers);
  const body = typeof msg.body === 'string' ? msg.body : '';
  // body 上限：防止被当成任意大包转发通道
  if (body.length > 8192) {
    sendResponse({ ok: false, error: '拒绝：请求体过大' });
    return false;
  }

  // 方案 A：直连 Stripe（URL 已白名单校验）
  const directFetch = fetch(msg.url, {
    method: 'POST',
    headers: headers,
    body: body,
  })
    .then((r) => r.text().then((t) => ({ ok: true, status: r.status, text: t })))
    .catch((e) => ({ ok: false, error: String((e && e.message) || e) }));

  directFetch.then((result) => {
    // 仅网络成功且 2xx 才视为直连成功；403/0/网络错误走代理兑底
    if (result.ok && result.status >= 200 && result.status < 300) return result;
    console.warn('[CKNB] Stripe 直连失败，降级代理:', result.ok ? ('HTTP ' + result.status) : result.error);
    const proxyUrl = STRIPE_PROXY + (csId ? ('?cs_id=' + encodeURIComponent(csId)) : '');
    return fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Authorization': headers.Authorization || '',
        'Content-Type': headers['Content-Type'] || 'application/x-www-form-urlencoded',
      },
      body: body,
    })
      .then((r) => r.json().then((j) => {
        if (j && typeof j.status === 'number') {
          return { ok: true, status: j.status, text: j.body || '' };
        }
        return { ok: false, error: '代理响应异常' };
      }))
      .catch((e) => {
        // 代理也失败：若直连至少拿到了 HTTP 状态，回传直连结果便于排错
        if (result.ok) return result;
        return { ok: false, error: '代理也失败: ' + String((e && e.message) || e) };
      });
  }).then(sendResponse);

  return true;
});
