// ============================================================
// ChatGPT 全能助手 · Specimen  ——  扩展后台 Service Worker
// ------------------------------------------------------------
// 作用：把油猴脚本里 GM_registerMenuCommand 注册的「打开助手」入口
//      替换为浏览器扩展原生入口，包括：
//        1) 浏览器工具栏图标点击 → 通知当前页打开浮窗
//        2) 页面右键菜单「打开 CKNB ChatGPT 全能助手」→ 同上
//        3) 全局快捷键 Ctrl/Cmd + Shift + K → 由 manifest commands
//           的 _execute_action 自动触发 action.onClicked
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
// ------------------------------------------------------------
const MSG_STRIPE_INIT = 'CKNB_STRIPE_INIT';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 非本协议消息直接放行，避免占用其它监听器的响应通道
  if (!msg || msg.type !== MSG_STRIPE_INIT) return;
  fetch(msg.url, {
    method: 'POST',
    headers: msg.headers || {},
    body: msg.body,
  })
    .then((r) => r.text().then((t) => sendResponse({ ok: true, status: r.status, text: t })))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  // 返回 true 保持消息通道开启，等待上面的异步 sendResponse
  return true;
});
