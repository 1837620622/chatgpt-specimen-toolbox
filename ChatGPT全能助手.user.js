// ==UserScript==
// @name         ChatGPT 全能助手 · Specimen
// @namespace    https://chatgpt.com/cknb
// @version      2.0.0
// @description  ChatGPT Session 一键导出 9 种主流格式（auth.json / Codex / CPA / Sub2API / Cockpit / 9router / AxonHub / Codex-Manager / 原始 JSON），并生成 Plus 多区域 + Team 工作区订阅链接。Specimen 设计语言，去 AI 味。
// @author       传康KK-CKNB
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/1837620622
// ==/UserScript==

(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.top !== window.self) return;
  if (window.__CKNB_TOOLBOX_LOADED__) return;
  window.__CKNB_TOOLBOX_LOADED__ = true;

  // CONSTANTS
  const NS = 'cknb-specimen';
  const AUTHOR = '传康KK-CKNB';
  const CONTACT_WECHAT = '1837620622';
  const VERSION = '2.0.0';
  const SESSION_URL = '/api/auth/session';
  const CHECKOUT_URL = '/backend-api/payments/checkout';
  const AXONHUB_PLACEHOLDER = '__missing_refresh_token__';
  const SETTINGS_KEY = 'cknb-specimen.settings.v2';

  const EXPORT_TARGETS = [
    { id: 'auth',          label: 'auth.json',     filename: 'auth.json',          desc: 'Codex CLI 原生' },
    { id: 'codex',         label: 'Codex Auth',    filename: 'codex-auth.json',    desc: '重组 id_token 含 email/profile' },
    { id: 'cpa',           label: 'CPA',           filename: 'cpa.json',           desc: 'CLI Proxy API 中转格式' },
    { id: 'sub2api',       label: 'Sub2API',       filename: 'sub2api.json',       desc: 'CPA2sub2API 项目格式' },
    { id: 'cockpit',       label: 'Cockpit',       filename: 'cockpit.json',       desc: 'Cockpit Tools 扁平格式' },
    { id: '9router',       label: '9router',       filename: '9router.json',       desc: '9router Codex OAuth 格式' },
    { id: 'axonhub',       label: 'AxonHub',       filename: 'axonhub-auth.json',  desc: 'AxonHub Codex auth.json' },
    { id: 'codex-manager', label: 'Codex-Manager', filename: 'codex-manager.json', desc: 'Codex-Manager 批量导入' },
    { id: 'raw-session',   label: 'Raw Session',   filename: 'session.json',       desc: '原始 Session JSON 不变换' },
  ];

  // 注：PayPal 渠道也用 JP/JPY 生成长链 —— 0 元试用资格由 country=JP 触发，
  // PayPal 仅是支付手段（教程做法：日区长链 → 美国 IP 打开 → 选 PayPal → 填 0 刀美卡）。
  // 若想要不试用的美区正常订阅，用 us_direct 选项。
  const PLUS_PROFILES = {
    direct: { label: '日区直绑',     country: 'JP', currency: 'JPY', code: 'JP', note: '0 元试用 · 日卡 / Wise 直绑' },
    paypal: { label: 'PayPal 美卡',   country: 'JP', currency: 'JPY', code: 'JP', note: '日区长链 + PayPal + 0 刀美卡（教程主推）' },
    gopay:  { label: 'GoPay 印尼',    country: 'ID', currency: 'IDR', code: 'ID', note: 'GoPay 印尼区 · 教程称已被薅烂封号高发' },
    us_direct: { label: '美区订阅',  country: 'US', currency: 'USD', code: 'US', note: '正常美区订阅（不参与试用，付全价）' },
  };

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveSettings(patch) {
    try {
      const cur = loadSettings();
      const next = Object.assign({}, cur, patch);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    } catch (e) { return null; }
  }

  const persisted = loadSettings();
  const state = {
    activeTab: persisted.activeTab || 'auth',
    auth: { exports: null, ctx: null, currentTargetId: 'auth', loading: false },
    plus: { lastUrl: '', bulkResults: null, loading: false },
    team: {
      lastLinks: null, loading: false,
      form: persisted.teamForm || {
        workspace: 'CKNB 团队工作区',
        seats: '2', promo: '', country: 'US', currency: 'USD', interval: 'month',
      },
    },
    fab: { x: persisted.fabX || null, y: persisted.fabY || null },
  };

  // UTILITIES
  function getPath(src, path) {
    const parts = String(path || '').split('.').filter(Boolean);
    let cur = src;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
      cur = cur[p];
    }
    return cur;
  }
  function isObj(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
  function firstStr(...vals) {
    for (const v of vals) if (typeof v === 'string' && v.trim() !== '') return v.trim();
    return undefined;
  }
  function normalizeTs(v) {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
    if (typeof v === 'number' && Number.isFinite(v)) {
      const ms = v > 1e11 ? v : v * 1000;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    if (typeof v !== 'string' || v.trim() === '') return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  function tsFromUnix(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const d = new Date(n * 1000);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  function unixSecsFromJwtExp(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.trunc(n);
  }
  function epochSecs(v) {
    if (v === undefined || v === null || v === '') return 0;
    if (v instanceof Date && !Number.isNaN(v.getTime())) return Math.trunc(v.getTime() / 1000);
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n > 1e11 ? n / 1000 : n);
    const p = Date.parse(String(v));
    return Number.isFinite(p) ? Math.trunc(p / 1000) : 0;
  }
  function b64UrlDecode(value) {
    const norm = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const padded = norm.padEnd(Math.ceil(norm.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function bytesToB64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function b64UrlJson(value) {
    return bytesToB64Url(new TextEncoder().encode(JSON.stringify(value)));
  }
  function parseJwt(token) {
    if (typeof token !== 'string' || !token.trim()) return undefined;
    const segs = token.split('.');
    if (segs.length < 2) return undefined;
    try { return JSON.parse(b64UrlDecode(segs[1])); } catch (e) { return undefined; }
  }
  function strip(v) {
    if (Array.isArray(v)) return v.map(strip).filter(x => x !== undefined);
    if (isObj(v)) {
      const entries = Object.entries(v).map(([k, x]) => [k, strip(x)]).filter(([_, x]) => x !== undefined);
      return entries.length ? Object.fromEntries(entries) : undefined;
    }
    if (v === undefined || v === null || v === '') return undefined;
    return v;
  }
  function toEmailKey(email) {
    if (typeof email !== 'string') return undefined;
    return email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function expiresIn(expAt, now) {
    if (!expAt) return undefined;
    const ms = new Date(expAt).getTime();
    return Number.isNaN(ms) ? undefined : Math.max(0, Math.floor((ms - now.getTime()) / 1000));
  }
  function axonLastRefresh(expAt, now) {
    const ms = expAt ? new Date(expAt).getTime() : NaN;
    return Number.isNaN(ms) ? now.toISOString() : new Date(ms - 3600000).toISOString();
  }
  function sanitizeFilename(v) {
    if (typeof v !== 'string') return undefined;
    return v.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ') || undefined;
  }
  function downloadName(targetId, email) {
    const t = EXPORT_TARGETS.find(x => x.id === targetId) || EXPORT_TARGETS[0];
    const safe = sanitizeFilename(email);
    if (t.id === 'auth' || !safe) return t.filename;
    return safe + '----' + t.filename;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  }
  function humanDuration(seconds) {
    if (seconds <= 0) return '已过期';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return d + ' 天 ' + h + ' 时';
    if (h > 0) return h + ' 时 ' + m + ' 分';
    return m + ' 分';
  }

  // NETWORK
  async function fetchSession() {
    const r = await fetch(SESSION_URL, { method: 'GET', credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('获取 Session 失败：HTTP ' + r.status);
    const text = await r.text();
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error('返回了 HTML，请确认已登录 ChatGPT 且当前域名正确。');
    }
    let s;
    try { s = JSON.parse(text); } catch (e) { throw new Error('Session 数据不是有效 JSON。'); }
    if (!isObj(s)) throw new Error('Session 数据不是 JSON 对象。');
    return s;
  }
  async function postCheckout(body, accessToken) {
    const r = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch (e) {}
    if (!r.ok) throw new Error('checkout 失败 HTTP ' + r.status + '：' + text.slice(0, 500));
    return data;
  }

  // AUTH CONVERSION (上游 gtxx3600 兼容)
  function buildContext(session) {
    const accessToken = String(getPath(session, 'accessToken') || '').trim();
    const sessionToken = String(getPath(session, 'sessionToken') || '').trim();
    const accountIdRaw = String(getPath(session, 'account.id') || '').trim();
    if (!accessToken) throw new Error('Session 数据缺少 accessToken。');

    const accessPayload = parseJwt(accessToken);
    const idTokenInput = firstStr(session.idToken, session.id_token);
    const idPayload = parseJwt(idTokenInput);
    const authOf = p => isObj(p) && isObj(p['https://api.openai.com/auth']) ? p['https://api.openai.com/auth'] : {};
    const profOf = p => isObj(p) && isObj(p['https://api.openai.com/profile']) ? p['https://api.openai.com/profile'] : {};
    const aa = authOf(accessPayload);
    const ia = authOf(idPayload);
    const ap = profOf(accessPayload);

    const now = new Date();
    const exportedAt = now.toISOString();
    const accessTokenExpiresAt = unixSecsFromJwtExp(accessPayload && accessPayload.exp);
    const expiresAt = firstStr(
      tsFromUnix(accessPayload && accessPayload.exp),
      normalizeTs(session.expires),
      normalizeTs(session.expiresAt),
      normalizeTs(session.expired),
      normalizeTs(session.expires_at)
    );
    const email = firstStr(getPath(session, 'user.email'), session.email, ap.email, idPayload && idPayload.email, accessPayload && accessPayload.email);
    const userId = firstStr(getPath(session, 'user.id'), session.user_id, aa.chatgpt_user_id, aa.user_id, ia.chatgpt_user_id, ia.user_id);
    const planType = firstStr(getPath(session, 'account.planType'), getPath(session, 'account.plan_type'), session.planType, session.plan_type, aa.chatgpt_plan_type, ia.chatgpt_plan_type);
    const accountId = firstStr(accountIdRaw, session.account_id, aa.chatgpt_account_id, ia.chatgpt_account_id);
    const chatgptAccountId = firstStr(
      session.chatgptAccountId, session.chatgpt_account_id,
      getPath(session, 'meta.chatgptAccountId'), getPath(session, 'meta.chatgpt_account_id'),
      aa.chatgpt_account_id, ia.chatgpt_account_id
    );
    const workspaceId = firstStr(
      getPath(session, 'account.workspaceId'), getPath(session, 'account.workspace_id'),
      session.workspaceId, session.workspace_id,
      accessPayload && accessPayload.workspace_id, idPayload && idPayload.workspace_id
    );
    const refreshToken = firstStr(session.refreshToken, session.refresh_token);

    let synthetic;
    if (!idTokenInput && accountId) {
      const ns = epochSecs(now);
      const ex = epochSecs(expiresAt) || ns + 90 * 86400;
      const info = { chatgpt_account_id: accountId };
      if (planType) info.chatgpt_plan_type = planType;
      if (userId) { info.chatgpt_user_id = userId; info.user_id = userId; }
      const p = { iat: ns, exp: ex, 'https://api.openai.com/auth': info };
      if (email) p.email = email;
      synthetic = b64UrlJson({ alg: 'none', typ: 'JWT', cpa_synthetic: true }) + '.' + b64UrlJson(p) + '.synthetic';
    }
    const codexIdToken = firstStr(idTokenInput, synthetic, accessToken);

    return {
      accessToken, sessionToken: sessionToken || undefined,
      accountId, chatgptAccountId, workspaceId,
      email, userId, planType,
      expiresAt, accessTokenExpiresAt, exportedAt, now,
      refreshToken, idTokenInput,
      codexIdToken, codexSynthetic: Boolean(synthetic),
      displayName: firstStr(email, accountId, 'ChatGPT Account'),
    };
  }

  function buildAuth(session, ctx) {
    if (!ctx.sessionToken) throw new Error('auth.json 缺少 sessionToken。');
    if (!ctx.accountId) throw new Error('auth.json 缺少 account.id。');
    const iat = Number(getPath(session, 'user.iat'));
    const last = Number.isFinite(iat) && iat > 0 ? new Date(iat * 1000).toISOString() : new Date(ctx.now.getTime() - 60000).toISOString();
    return {
      OPENAI_API_KEY: null, auth_mode: 'chatgpt', last_refresh: last,
      tokens: { access_token: ctx.accessToken, account_id: ctx.accountId, id_token: ctx.accessToken, refresh_token: ctx.sessionToken },
    };
  }
  function buildCodex(session, ctx) {
    const parts = ctx.accessToken.split('.');
    if (parts.length < 3) throw new Error('accessToken 不是有效 JWT。');
    const payload = parseJwt(ctx.accessToken) || {};
    const prof = payload['https://api.openai.com/profile'] || {};
    const auth = payload['https://api.openai.com/auth'] || {};
    payload.email = prof.email || getPath(session, 'user.email') || '';
    payload.email_verified = prof.email_verified || false;
    payload.name = getPath(session, 'user.name') || auth.chatgpt_user_id || '';
    payload.picture = '';
    const newB64 = bytesToB64Url(new TextEncoder().encode(JSON.stringify(payload)));
    return { tokens: { id_token: parts[0] + '.' + newB64 + '.' + parts[2], access_token: ctx.accessToken } };
  }
  function buildCpa(ctx) {
    return Object.fromEntries(Object.entries({
      type: 'codex',
      account_id: ctx.accountId, chatgpt_account_id: ctx.accountId,
      email: ctx.email, name: ctx.displayName,
      plan_type: ctx.planType, chatgpt_plan_type: ctx.planType,
      id_token: ctx.codexIdToken,
      id_token_synthetic: ctx.codexSynthetic || undefined,
      access_token: ctx.accessToken, refresh_token: ctx.refreshToken || '',
      session_token: ctx.sessionToken, last_refresh: ctx.exportedAt, expired: ctx.expiresAt,
    }).filter(([_, v]) => v !== undefined && v !== null));
  }
  function buildCockpit(ctx) {
    return Object.fromEntries(Object.entries({
      type: 'codex',
      id_token: ctx.codexIdToken,
      access_token: ctx.accessToken, refresh_token: ctx.refreshToken || '',
      account_id: ctx.accountId, last_refresh: ctx.exportedAt,
      email: ctx.email, expired: ctx.expiresAt,
    }).filter(([_, v]) => v !== undefined && v !== null));
  }
  function buildSub2api(ctx) {
    const acc = strip({
      name: ctx.displayName, platform: 'openai', type: 'oauth',
      expires_at: ctx.accessTokenExpiresAt,
      auto_pause_on_expired: true,
      concurrency: 10, priority: 1,
      credentials: {
        access_token: ctx.accessToken,
        chatgpt_account_id: ctx.accountId,
        chatgpt_user_id: ctx.userId,
        email: ctx.email,
        expires_at: ctx.expiresAt,
        expires_in: expiresIn(ctx.expiresAt, ctx.now),
        plan_type: ctx.planType,
      },
      extra: {
        email: ctx.email, email_key: toEmailKey(ctx.email),
        name: ctx.displayName, source: 'chatgpt_web_session', last_refresh: ctx.exportedAt,
      },
    });
    return { exported_at: ctx.exportedAt, proxies: [], accounts: acc ? [acc] : [] };
  }
  function build9router(ctx) {
    return strip({
      accessToken: ctx.accessToken, refreshToken: ctx.refreshToken,
      expiresAt: ctx.expiresAt, testStatus: 'active',
      expiresIn: expiresIn(ctx.expiresAt, ctx.now),
      providerSpecificData: { chatgptAccountId: ctx.accountId, chatgptPlanType: ctx.planType },
      id: ctx.accountId, provider: 'codex', authType: 'oauth',
      name: ctx.displayName, email: ctx.email, priority: 9, isActive: true,
      createdAt: ctx.exportedAt, updatedAt: ctx.exportedAt,
    });
  }
  function buildAxon(ctx) {
    const rt = ctx.refreshToken || AXONHUB_PLACEHOLDER;
    return strip({
      auth_mode: 'chatgpt',
      last_refresh: axonLastRefresh(ctx.expiresAt, ctx.now),
      tokens: { access_token: ctx.accessToken, refresh_token: rt, id_token: ctx.codexIdToken },
      axonhub_refresh_token_placeholder: ctx.refreshToken ? undefined : true,
      axonhub_note: ctx.refreshToken ? undefined : 'refresh_token is a placeholder; access_token works only until it expires.',
    });
  }
  function buildCodexManager(ctx) {
    const tokenHints = Object.fromEntries(Object.entries({
      account_id: ctx.accountId,
      chatgpt_account_id: ctx.chatgptAccountId,
    }).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    const meta = Object.fromEntries(Object.entries({
      label: ctx.displayName,
      workspace_id: ctx.workspaceId,
      chatgpt_account_id: ctx.chatgptAccountId,
      note: 'Imported from ChatGPT session',
    }).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    return {
      tokens: Object.assign({
        access_token: ctx.accessToken,
        refresh_token: ctx.refreshToken || '',
        id_token: ctx.idTokenInput || '',
      }, tokenHints),
      meta,
    };
  }
  function buildPayload(id, session, ctx) {
    switch (id) {
      case 'auth': return buildAuth(session, ctx);
      case 'codex': return buildCodex(session, ctx);
      case 'raw-session': return session;
      case 'cpa': return buildCpa(ctx);
      case 'sub2api': return buildSub2api(ctx);
      case 'cockpit': return buildCockpit(ctx);
      case '9router': return build9router(ctx);
      case 'axonhub': return buildAxon(ctx);
      case 'codex-manager': return buildCodexManager(ctx);
      default: throw new Error('未知导出目标：' + id);
    }
  }
  function buildAllExports(session) {
    const ctx = buildContext(session);
    const out = {};
    for (const t of EXPORT_TARGETS) {
      try {
        const p = buildPayload(t.id, session, ctx);
        out[t.id] = { id: t.id, label: t.label, desc: t.desc, filename: downloadName(t.id, ctx.email), text: typeof p === 'string' ? p : JSON.stringify(p, null, 2) };
      } catch (e) {
        out[t.id] = { id: t.id, label: t.label, desc: t.desc, filename: downloadName(t.id, ctx.email), text: '', error: e.message || String(e) };
      }
    }
    return { ctx, exports: out };
  }

  // CLIPBOARD & DOWNLOAD
  async function copyText(text) {
    if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return; }
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; } catch (e) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    Object.assign(ta.style, { position: 'fixed', left: '-9999px', top: '0', opacity: '0' });
    document.body.appendChild(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (!ok) throw new Error('复制失败，请手动复制。');
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 200);
  }
  async function getAccessToken() {
    const s = await fetchSession();
    const t = s && s.accessToken;
    if (!t) throw new Error('没有拿到 accessToken，请确认已登录 ChatGPT。');
    return t;
  }
  async function generatePlusLink(profile) {
    const token = await getAccessToken();
    const data = await postCheckout({
      plan_name: 'chatgptplusplan',
      billing_details: { country: profile.country, currency: profile.currency },
      cancel_url: 'https://chatgpt.com/#pricing',
      promo_campaign: { promo_campaign_id: 'plus-1-month-free', is_coupon_from_query_param: false },
      checkout_ui_mode: 'hosted', locale: 'zh-CN',
    }, token);
    const url = data.url || data.stripe_hosted_url || data.checkout_url || '';
    if (!url) throw new Error('响应里没有支付链接。');
    return url;
  }
  async function generateTeamLink(opts) {
    const token = await getAccessToken();
    const body = {
      plan_name: 'chatgptteamplan',
      billing_details: { country: opts.country || 'US', currency: opts.currency || 'USD' },
      checkout_ui_mode: 'hosted',
      entry_point: 'team_workspace_purchase_modal',
      team_plan_data: {
        workspace_name: opts.workspaceName || '我的工作区',
        price_interval: opts.interval === 'year' ? 'year' : 'month',
        seat_quantity: Number(opts.seats) || 2,
      },
      cancel_url: 'https://chatgpt.com/#pricing',
    };
    if (opts.promoCode && opts.promoCode.trim()) body.promo_code = opts.promoCode.trim();
    const data = await postCheckout(body, token);
    const url = data.url || data.stripe_hosted_url || data.checkout_url || '';
    if (!url) throw new Error('未能在返回结果中找到 URL。');
    return { openai: url, stripe: url.replace('pay.openai.com', 'checkout.stripe.com') };
  }

  // SVG ICONS (stroke 1.5 line style, viewBox 24)
  const SVG = {
    sigil: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M7 6v20M7 16h12M19 6l6 10-6 10"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M3 8l3 8h12l3-8-5 3-4-6-4 6-5-3z"/><path d="M6 19h12"/></svg>',
    cluster: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c0-2.5 2.5-4 5-4M21 19c0-2.5-2.5-4-5-4M9 19c0-1.7 1.5-3 3-3s3 1.3 3 3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M12 3v13M6 12l6 6 6-6M4 21h16"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><rect x="3" y="4" width="18" height="4"/><path d="M5 8v12h14V8M10 13h4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l3 3"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    extOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M14 4h6v6M20 4l-8 8M10 4H4v16h16v-6"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>',
  };
  function icon(name, size) {
    const s = size || 16;
    return '<i class="ic" style="width:' + s + 'px;height:' + s + 'px" aria-hidden="true">' + (SVG[name] || '') + '</i>';
  }

  // CSS · 明亮 SaaS 风格（hvoy.ai 启发 · 得意黑做大标题 · 警告橙做信号）
  const CSS = [
    /* @font-face — 得意黑 Smiley Sans 大标题字体 · CSP 失败时静默回退系统衬线 */
    '@font-face {',
    '  font-family: "Smiley Sans CKNB";',
    '  font-style: italic;',
    '  font-weight: 400 900;',
    '  font-display: swap;',
    '  src: url("https://cdn.jsdelivr.net/gh/atelier-anchor/smiley-sans@v2.0.0/dist/SmileySans-Oblique.woff2") format("woff2");',
    '}',
    /* root */
    '#' + NS + '-fab, #' + NS + '-modal, #' + NS + '-toast {',
    '  all: initial; box-sizing: border-box;',
    '  font-family: "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", system-ui, sans-serif;',
    '  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;',
    '  color: #1a1614;',
    '}',
    '#' + NS + '-fab *, #' + NS + '-modal *, #' + NS + '-toast * { box-sizing: border-box; font: inherit; }',
    '#' + NS + '-modal .ic { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; vertical-align: middle; }',
    '#' + NS + '-modal .ic svg, #' + NS + '-fab .ic svg { width: 100%; height: 100%; display: block; }',
    '#' + NS + '-modal .display {',
    '  font-family: "Smiley Sans CKNB", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif;',
    '  font-style: italic; font-weight: 600;',
    '  letter-spacing: -0.01em;',
    '}',
    '#' + NS + '-modal .mono { font-family: ui-monospace, "SF Mono", "JetBrains Mono", "Berkeley Mono", Consolas, Menlo, monospace; }',

    /* ─── FAB ─── */
    '#' + NS + '-fab {',
    '  position: fixed; right: 28px; bottom: 28px; z-index: 2147483646;',
    '  display: inline-flex; align-items: center; gap: 8px;',
    '  padding: 10px 16px 10px 13px; cursor: pointer; user-select: none;',
    '  background: #ffffff; color: #ff5722;',
    '  border: 1px solid #e8e6e0; border-radius: 999px;',
    '  box-shadow: 0 4px 14px rgba(20,16,12,.08), 0 1px 3px rgba(20,16,12,.06);',
    '  transition: transform .14s ease-out, box-shadow .14s ease-out, background .14s ease-out;',
    '  font-family: "Smiley Sans CKNB", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif;',
    '  font-style: italic; font-weight: 600; font-size: 14px; letter-spacing: 0.02em;',
    '}',
    '#' + NS + '-fab:hover { background: #ff5722; color: #ffffff; box-shadow: 0 8px 24px rgba(255,87,34,.32), 0 2px 6px rgba(255,87,34,.18); transform: translateY(-1px); }',
    '#' + NS + '-fab:active { transform: translateY(0); }',
    '#' + NS + '-fab .ic { width: 18px; height: 18px; }',
    '#' + NS + '-fab.dragging { cursor: grabbing; transition: none; }',

    /* ─── Modal ─── */
    '#' + NS + '-modal { position: fixed; inset: 0; z-index: 2147483647; display: none; align-items: center; justify-content: center; background: rgba(20,16,12,.42); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }',
    '#' + NS + '-modal[data-open="true"] { display: flex; animation: ' + NS + '-fade .15s ease-out; }',
    '@keyframes ' + NS + '-fade { from { opacity: 0; } to { opacity: 1; } }',
    '@keyframes ' + NS + '-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }',
    '#' + NS + '-modal .dlg {',
    '  width: min(920px, calc(100vw - 32px)); max-height: calc(100vh - 32px);',
    '  background: #ffffff; color: #1a1614;',
    '  border: 1px solid #e8e6e0; border-radius: 12px;',
    '  display: flex; flex-direction: column; overflow: hidden;',
    '  box-shadow: 0 24px 60px rgba(20,16,12,.18), 0 4px 12px rgba(20,16,12,.08);',
    '  animation: ' + NS + '-rise .22s cubic-bezier(.16,1,.3,1);',
    '}',

    /* ─── Header ─── */
    '#' + NS + '-modal .hd { display: grid; grid-template-columns: 1fr auto; align-items: center; padding: 20px 24px 18px; border-bottom: 1px solid #f0eeea; }',
    '#' + NS + '-modal .hd-brand { display: flex; flex-direction: column; gap: 6px; }',
    '#' + NS + '-modal .hd-mark { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 0.18em; color: #aaa5a0; font-weight: 600; }',
    '#' + NS + '-modal .hd-mark .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #ff5722; }',
    '#' + NS + '-modal .hd-mark .dot::after { content: ""; position: absolute; }',
    '#' + NS + '-modal .hd-title { font-size: 30px; line-height: 1.1; color: #1a1614; margin: 0; font-family: "Smiley Sans CKNB", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif; font-style: italic; font-weight: 700; letter-spacing: -0.015em; }',
    '#' + NS + '-modal .hd-title em { font-style: italic; color: #ff5722; font-weight: 700; }',
    '#' + NS + '-modal .hd-meta { display: flex; gap: 14px; align-items: center; font-size: 12px; color: #6b6660; }',
    '#' + NS + '-modal .hd-meta .sep { color: #d4d0c8; }',
    '#' + NS + '-modal .hd-meta b { color: #1a1614; font-weight: 600; }',
    '#' + NS + '-modal .hd-actions { display: flex; gap: 8px; }',
    '#' + NS + '-modal .hd-close { width: 36px; height: 36px; cursor: pointer; background: transparent; color: #6b6660; border: 1px solid #e8e6e0; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all .14s ease-out; }',
    '#' + NS + '-modal .hd-close:hover { background: #fef4f1; color: #ff5722; border-color: #ffcfbe; }',
    '#' + NS + '-modal .hd-close .ic { width: 14px; height: 14px; }',

    /* ─── Tabs ─── */
    '#' + NS + '-modal .tabs { display: flex; padding: 0 24px; border-bottom: 1px solid #f0eeea; background: #fafaf8; gap: 4px; }',
    '#' + NS + '-modal .tab { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px 12px; cursor: pointer; background: transparent; color: #6b6660; border: 0; border-bottom: 2px solid transparent; font-size: 14px; font-weight: 500; transition: color .14s ease-out, border-color .14s ease-out; margin-bottom: -1px; }',
    '#' + NS + '-modal .tab:hover { color: #1a1614; }',
    '#' + NS + '-modal .tab[aria-selected="true"] { color: #ff5722; border-bottom-color: #ff5722; font-weight: 600; }',
    '#' + NS + '-modal .tab .num { font-size: 11px; color: #aaa5a0; font-weight: 600; font-family: ui-monospace, "SF Mono", Consolas, monospace; }',
    '#' + NS + '-modal .tab[aria-selected="true"] .num { color: #ff5722; }',

    /* ─── Body ─── */
    '#' + NS + '-modal .bd { padding: 22px 24px 18px; overflow-y: auto; flex: 1; min-height: 280px; background: #ffffff; }',
    '#' + NS + '-modal .bd::-webkit-scrollbar { width: 8px; }',
    '#' + NS + '-modal .bd::-webkit-scrollbar-track { background: transparent; }',
    '#' + NS + '-modal .bd::-webkit-scrollbar-thumb { background: #e8e6e0; border-radius: 4px; }',
    '#' + NS + '-modal .bd::-webkit-scrollbar-thumb:hover { background: #c9c5bd; }',

    /* ─── Section label ─── */
    '#' + NS + '-modal .lbl { display: flex; align-items: center; gap: 8px; margin: 4px 0 12px; font-size: 12px; color: #6b6660; font-weight: 600; letter-spacing: 0.02em; }',
    '#' + NS + '-modal .lbl::before { content: ""; width: 3px; height: 14px; background: #ff5722; border-radius: 2px; }',
    '#' + NS + '-modal .lbl .hint { margin-left: auto; color: #aaa5a0; font-weight: 400; font-size: 11px; font-family: ui-monospace, "SF Mono", Consolas, monospace; letter-spacing: 0.04em; }',

    /* ─── 账户卡片 ─── */
    '#' + NS + '-modal .spec { display: grid; grid-template-columns: 56px 1fr auto; gap: 18px; align-items: center; padding: 14px 18px; margin-bottom: 18px; background: #fafaf8; border: 1px solid #f0eeea; border-radius: 10px; transition: border-color .14s ease-out; }',
    '#' + NS + '-modal .spec:hover { border-color: #e8e6e0; }',
    '#' + NS + '-modal .spec.expired { background: #fef4f1; border-color: #ffcfbe; }',
    '#' + NS + '-modal .spec-mono { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: #ff5722; color: #ffffff; font-size: 22px; font-weight: 700; border-radius: 10px; font-family: "Smiley Sans CKNB", "PingFang SC", system-ui, sans-serif; font-style: italic; }',
    '#' + NS + '-modal .spec.expired .spec-mono { background: #dc2626; }',
    '#' + NS + '-modal .spec-info { min-width: 0; }',
    '#' + NS + '-modal .spec-email { font-size: 15px; color: #1a1614; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }',
    '#' + NS + '-modal .spec-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #6b6660; align-items: center; }',
    '#' + NS + '-modal .spec-meta b { color: #1a1614; font-weight: 600; font-family: ui-monospace, "SF Mono", Consolas, monospace; }',
    '#' + NS + '-modal .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #ff5722; color: #ffffff; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }',
    '#' + NS + '-modal .pill.plus { background: #2563eb; }',
    '#' + NS + '-modal .pill.team { background: #7c3aed; }',
    '#' + NS + '-modal .pill.pro { background: #ff5722; }',
    '#' + NS + '-modal .pill.danger { background: #dc2626; }',

    /* ─── 格式网格 ─── */
    '#' + NS + '-modal .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-bottom: 14px; }',
    '#' + NS + '-modal .fmt { padding: 10px 12px; cursor: pointer; background: #ffffff; color: #1a1614; border: 1px solid #e8e6e0; border-radius: 8px; font-size: 13px; text-align: left; transition: all .14s ease-out; display: flex; flex-direction: column; gap: 3px; font-family: inherit; }',
    '#' + NS + '-modal .fmt:hover:not(:disabled) { border-color: #ffcfbe; background: #fef4f1; }',
    '#' + NS + '-modal .fmt[aria-pressed="true"] { color: #ffffff; background: #ff5722; border-color: #ff5722; box-shadow: 0 2px 6px rgba(255,87,34,.25); }',
    '#' + NS + '-modal .fmt[aria-pressed="true"] .fmt-desc { color: #ffdfd2; }',
    '#' + NS + '-modal .fmt:disabled { opacity: 0.4; cursor: not-allowed; background: #fafaf8; }',
    '#' + NS + '-modal .fmt-name { font-size: 13px; font-weight: 600; color: inherit; }',
    '#' + NS + '-modal .fmt-desc { font-size: 11px; color: #aaa5a0; line-height: 1.3; }',

    /* ─── 按钮 ─── */
    '#' + NS + '-modal .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }',
    '#' + NS + '-modal .btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; cursor: pointer; background: #ffffff; color: #1a1614; border: 1px solid #e8e6e0; border-radius: 6px; font-size: 13px; font-weight: 500; transition: all .14s ease-out; font-family: inherit; }',
    '#' + NS + '-modal .btn:hover:not(:disabled) { background: #fafaf8; border-color: #c9c5bd; }',
    '#' + NS + '-modal .btn.primary { color: #ffffff; background: #ff5722; border-color: #ff5722; font-weight: 600; box-shadow: 0 1px 2px rgba(255,87,34,.2); }',
    '#' + NS + '-modal .btn.primary:hover:not(:disabled) { background: #e63b1d; border-color: #e63b1d; box-shadow: 0 4px 12px rgba(255,87,34,.28); }',
    '#' + NS + '-modal .btn.ghost { border-color: transparent; color: #6b6660; }',
    '#' + NS + '-modal .btn.ghost:hover:not(:disabled) { border-color: #e8e6e0; color: #1a1614; background: #fafaf8; }',
    '#' + NS + '-modal .btn.sm { padding: 6px 10px; font-size: 12px; }',
    '#' + NS + '-modal .btn:disabled { opacity: 0.55; cursor: not-allowed; }',
    '#' + NS + '-modal .btn .ic { width: 14px; height: 14px; }',

    /* ─── 输出区 ─── */
    '#' + NS + '-modal .out { width: 100%; min-height: 260px; max-height: 380px; background: #fafaf8; color: #1a1614; border: 1px solid #e8e6e0; border-radius: 8px; padding: 14px; resize: vertical; outline: none; font: 12px/1.7 ui-monospace, "SF Mono", "JetBrains Mono", Consolas, monospace; letter-spacing: 0.01em; }',
    '#' + NS + '-modal .out:focus { border-color: #ffcfbe; background: #ffffff; box-shadow: 0 0 0 3px rgba(255,87,34,.08); }',
    '#' + NS + '-modal .out::selection { background: #ffcfbe; color: #1a1614; }',

    /* ─── 状态条 ─── */
    '#' + NS + '-modal .stat { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 10px 14px; background: #fafaf8; border: 1px solid #f0eeea; border-radius: 8px; border-left: 3px solid #ff5722; font-size: 12px; color: #6b6660; }',
    '#' + NS + '-modal .stat b { color: #1a1614; font-weight: 600; }',
    '#' + NS + '-modal .stat.err { color: #991b1b; border-color: #fecaca; border-left-color: #dc2626; background: #fef2f2; }',
    '#' + NS + '-modal .stat.ok { color: #166534; border-color: #bbf7d0; border-left-color: #16a34a; background: #f0fdf4; }',

    /* ─── 表单 ─── */
    '#' + NS + '-modal .row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }',
    '#' + NS + '-modal .row > label { font-size: 12px; color: #6b6660; font-weight: 600; }',
    '#' + NS + '-modal .ipt { padding: 10px 12px; background: #ffffff; color: #1a1614; border: 1px solid #e8e6e0; border-radius: 6px; outline: none; font: 13px/1.4 ui-monospace, "SF Mono", "JetBrains Mono", Consolas, monospace; transition: all .14s ease-out; width: 100%; }',
    '#' + NS + '-modal .ipt:focus { border-color: #ff5722; box-shadow: 0 0 0 3px rgba(255,87,34,.1); }',
    '#' + NS + '-modal .ipt::placeholder { color: #aaa5a0; }',
    '#' + NS + '-modal .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }',

    /* ─── 区域卡片 ─── */
    '#' + NS + '-modal .regions { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; }',
    '#' + NS + '-modal .region { padding: 18px 16px; cursor: pointer; text-align: left; background: #ffffff; color: #1a1614; border: 1px solid #e8e6e0; border-radius: 10px; transition: all .14s ease-out; font-family: inherit; display: flex; flex-direction: column; gap: 6px; position: relative; overflow: hidden; }',
    '#' + NS + '-modal .region:hover { border-color: #ff5722; background: #fef4f1; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(255,87,34,.12); }',
    '#' + NS + '-modal .region-code { font-size: 11px; letter-spacing: 0.1em; color: #aaa5a0; font-family: ui-monospace, "SF Mono", Consolas, monospace; font-weight: 600; }',
    '#' + NS + '-modal .region-label { font-size: 18px; color: #1a1614; font-family: "Smiley Sans CKNB", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif; font-style: italic; font-weight: 700; letter-spacing: -0.005em; }',
    '#' + NS + '-modal .region-meta { font-size: 11px; color: #6b6660; }',

    /* ─── 批量结果 ─── */
    '#' + NS + '-modal .bulk { display: grid; gap: 10px; margin-top: 12px; }',
    '#' + NS + '-modal .bulk-item { padding: 14px 16px; background: #ffffff; border: 1px solid #e8e6e0; border-left: 3px solid #ff5722; border-radius: 8px; }',
    '#' + NS + '-modal .bulk-item.err { border-left-color: #dc2626; background: #fef2f2; }',
    '#' + NS + '-modal .bulk-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }',
    '#' + NS + '-modal .bulk-hd .region-code { color: #6b6660; }',
    '#' + NS + '-modal .bulk-hd .label-cn { font-size: 14px; font-family: "Smiley Sans CKNB", "PingFang SC", system-ui, sans-serif; font-style: italic; font-weight: 700; color: #1a1614; }',

    /* ─── URL ─── */
    '#' + NS + '-modal .url { display: block; padding: 10px 12px; margin-bottom: 8px; background: #fafaf8; color: #6b6660; border: 1px solid #e8e6e0; border-radius: 6px; word-break: break-all; font: 11px/1.55 ui-monospace, "SF Mono", "JetBrains Mono", Consolas, monospace; text-decoration: none; transition: all .14s ease-out; }',
    '#' + NS + '-modal .url:hover { border-color: #ffcfbe; background: #fff; color: #ff5722; }',

    /* ─── 空状态 ─── */
    '#' + NS + '-modal .empty { text-align: center; padding: 64px 24px; }',
    '#' + NS + '-modal .empty-glyph { width: 80px; height: 80px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; background: #fef4f1; color: #ff5722; border-radius: 16px; }',
    '#' + NS + '-modal .empty-glyph .ic { width: 40px; height: 40px; }',
    '#' + NS + '-modal .empty-quote { font-size: 26px; line-height: 1.3; color: #1a1614; margin: 0 auto 8px; max-width: 360px; font-family: "Smiley Sans CKNB", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif; font-style: italic; font-weight: 700; letter-spacing: -0.01em; }',
    '#' + NS + '-modal .empty-quote em { color: #ff5722; }',
    '#' + NS + '-modal .empty-cap { font-size: 13px; color: #6b6660; margin-bottom: 28px; }',

    /* ─── Spinner ─── */
    '#' + NS + '-modal .spin { display: inline-block; width: 12px; height: 12px; border: 1.5px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: ' + NS + '-spin .7s linear infinite; }',
    '@keyframes ' + NS + '-spin { to { transform: rotate(360deg); } }',

    /* ─── Footer ─── */
    '#' + NS + '-modal .ft { padding: 12px 24px; border-top: 1px solid #f0eeea; background: #fafaf8; color: #6b6660; display: flex; justify-content: space-between; align-items: center; font-size: 11px; }',
    '#' + NS + '-modal .ft .sep { color: #d4d0c8; margin: 0 6px; }',
    '#' + NS + '-modal .ft kbd { display: inline-block; padding: 1px 6px; background: #ffffff; color: #1a1614; border: 1px solid #e8e6e0; border-bottom-width: 2px; border-radius: 4px; font: inherit; font-size: 11px; font-family: ui-monospace, "SF Mono", Consolas, monospace; }',
    '#' + NS + '-modal .ft b { color: #1a1614; font-weight: 600; }',
    '#' + NS + '-modal .ft .brand { color: #ff5722; font-weight: 600; }',

    /* ─── Toast ─── */
    '#' + NS + '-toast { position: fixed; bottom: 96px; right: 28px; max-width: 340px; padding: 12px 16px; background: #ffffff; color: #1a1614; border: 1px solid #e8e6e0; border-left: 3px solid #ff5722; border-radius: 8px; font: 13px/1.5 "PingFang SC", "HarmonyOS Sans SC", "Hiragino Sans GB", system-ui, sans-serif; box-shadow: 0 8px 24px rgba(20,16,12,.12), 0 2px 6px rgba(20,16,12,.06); opacity: 0; transform: translateY(8px); transition: opacity .18s ease-out, transform .18s ease-out; z-index: 2147483647; pointer-events: none; }',
    '#' + NS + '-toast[data-show="true"] { opacity: 1; transform: translateY(0); }',
    '#' + NS + '-toast[data-type="success"] { border-left-color: #16a34a; }',
    '#' + NS + '-toast[data-type="error"] { border-left-color: #dc2626; }',

    /* ─── 响应式 ─── */
    '@media (max-width: 560px) {',
    '  #' + NS + '-modal .dlg { width: calc(100vw - 16px); border-radius: 10px; }',
    '  #' + NS + '-modal .hd { padding: 16px 18px 14px; }',
    '  #' + NS + '-modal .hd-title { font-size: 22px; }',
    '  #' + NS + '-modal .bd { padding: 16px; }',
    '  #' + NS + '-modal .ft { padding: 10px 16px; flex-direction: column; gap: 4px; }',
    '  #' + NS + '-modal .ft .kbd-tip { display: none; }',
    '  #' + NS + '-modal .regions { grid-template-columns: 1fr; }',
    '  #' + NS + '-modal .grid2 { grid-template-columns: 1fr; }',
    '  #' + NS + '-fab { right: 16px; bottom: 16px; padding: 8px 14px 8px 11px; font-size: 13px; }',
    '}',
  ].join('\n');
  function ensureStyle() {
    if (document.getElementById(NS + '-style')) return;
    const el = document.createElement('style');
    el.id = NS + '-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // TOAST
  let toastTimer = null;
  function toast(msg, type, duration) {
    type = type || 'info';
    duration = duration === undefined ? 2800 : duration;
    let el = document.getElementById(NS + '-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = NS + '-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.setAttribute('data-type', type);
    el.setAttribute('data-show', 'true');
    if (toastTimer) clearTimeout(toastTimer);
    if (duration > 0) toastTimer = setTimeout(function() { el.setAttribute('data-show', 'false'); }, duration);
  }

  // RENDER · 中文界面
  function tabSpec(id) {
    if (id === 'auth') return { num: '01', label: '鉴权 · 导出' };
    if (id === 'plus') return { num: '02', label: 'Plus 订阅' };
    if (id === 'team') return { num: '03', label: 'Team 订阅' };
    return { num: '', label: id };
  }
  function planClass(p) {
    const s = String(p || '').toLowerCase();
    if (s.includes('plus')) return 'plus';
    if (s.includes('team')) return 'team';
    if (s.includes('pro')) return 'pro';
    return '';
  }
  function renderSpecimen(ctx) {
    if (!ctx) return '';
    const email = ctx.email || ctx.displayName || '未知账户';
    const initial = email.charAt(0).toUpperCase();
    const expSec = ctx.expiresAt ? Math.max(0, Math.floor((new Date(ctx.expiresAt).getTime() - Date.now()) / 1000)) : 0;
    const expired = ctx.expiresAt && expSec <= 0;
    const expText = ctx.expiresAt ? humanDuration(expSec) : '未知';
    const plan = (ctx.planType || 'free').toString();
    const accShort = ctx.accountId ? ctx.accountId.slice(0, 12) + '…' : '—';
    return [
      '<div class="spec' + (expired ? ' expired' : '') + '">',
      '  <div class="spec-mono">' + escapeHtml(initial) + '</div>',
      '  <div class="spec-info">',
      '    <div class="spec-email" title="' + escapeHtml(email) + '">' + escapeHtml(email) + '</div>',
      '    <div class="spec-meta">',
      '      <span class="pill ' + planClass(plan) + (expired ? ' danger' : '') + '">' + escapeHtml(plan) + '</span>',
      '      <span>账号 <b>' + escapeHtml(accShort) + '</b></span>',
      '      <span>剩余 <b>' + escapeHtml(expText) + '</b></span>',
      '    </div>',
      '  </div>',
      '  <button class="btn ghost sm" data-action="auth-fetch" title="重新拉取 Session">',
      '    ' + icon('refresh', 14) + ' <span>刷新</span>',
      '  </button>',
      '</div>',
    ].join('');
  }
  function renderAuth() {
    if (!state.auth.exports) {
      return [
        '<div class="empty">',
        '  <div class="empty-glyph">' + icon('shield', 40) + '</div>',
        '  <div class="empty-quote">还没<em> 捕获 </em>到任何 Session</div>',
        '  <div class="empty-cap">点击下方按钮，一键拉取并生成 ' + EXPORT_TARGETS.length + ' 种主流导出格式</div>',
        '  <button class="btn primary" data-action="auth-fetch">',
        (state.auth.loading ? '<span class="spin"></span> 处理中…' : (icon('bolt', 14) + ' <span>获取 Session</span>')),
        '  </button>',
        '</div>',
      ].join('');
    }
    const exp = state.auth.exports;
    const curId = state.auth.currentTargetId;
    const cur = exp[curId];
    const ctx = state.auth.ctx;
    const fmts = EXPORT_TARGETS.map(function(t) {
      const e = exp[t.id];
      const disabled = !e || e.error;
      const pressed = t.id === curId && !disabled;
      const title = disabled ? (e && e.error ? e.error : '不可用') : t.desc;
      return [
        '<button class="fmt" data-target-id="' + t.id + '" aria-pressed="' + pressed + '" ' + (disabled ? 'disabled' : '') + ' title="' + escapeHtml(title) + '">',
        '  <span class="fmt-name">' + escapeHtml(t.label) + '</span>',
        '  <span class="fmt-desc">' + escapeHtml(t.desc || '') + '</span>',
        '</button>',
      ].join('');
    }).join('');
    const meta = cur && !cur.error
      ? '当前文件 <b>' + escapeHtml(cur.filename) + '</b>' + (cur.id === 'auth' ? ' · Codex APP / CLI 可直读' : '')
      : (cur && cur.error ? '导出失败：' + escapeHtml(cur.error) : '');
    return [
      renderSpecimen(ctx),
      '<div class="lbl">选择导出格式<span class="hint">' + EXPORT_TARGETS.length + ' 种</span></div>',
      '<div class="grid">' + fmts + '</div>',
      '<div class="acts">',
      '  <button class="btn primary" data-action="auth-copy">' + icon('copy', 14) + ' <span>复制当前</span></button>',
      '  <button class="btn" data-action="auth-download">' + icon('download', 14) + ' <span>下载文件</span></button>',
      '  <button class="btn" data-action="auth-download-all">' + icon('archive', 14) + ' <span>打包全部</span></button>',
      '  <button class="btn ghost" data-action="auth-copy-access-token" title="只复制 access_token 字符串">' + icon('key', 14) + ' <span>仅 Token</span></button>',
      '</div>',
      '<textarea class="out" readonly spellcheck="false">' + escapeHtml((cur && (cur.text || cur.error)) || '') + '</textarea>',
      '<div class="stat' + (cur && cur.error ? ' err' : '') + '">' + meta + '</div>',
    ].join('');
  }
  function renderPlus() {
    const regions = Object.entries(PLUS_PROFILES).map(function(entry) {
      const k = entry[0], p = entry[1];
      return [
        '<button class="region" data-plus-region="' + k + '">',
        '  <div class="region-code">' + p.code + ' · ' + p.currency + '</div>',
        '  <div class="region-label">' + escapeHtml(p.label) + '</div>',
        '  <div class="region-meta">' + escapeHtml(p.note || (p.country + ' 区域账单')) + '</div>',
        '</button>',
      ].join('');
    }).join('');
    return [
      '<div class="lbl">选择支付区域<span class="hint">单选 / 批量</span></div>',
      '<div class="regions">' + regions + '</div>',
      '<div class="acts">',
      '  <button class="btn primary" data-action="plus-generate-all" ' + (state.plus.loading ? 'disabled' : '') + '>',
      (state.plus.loading ? '<span class="spin"></span> 并发生成中…' : (icon('globe', 14) + ' <span>批量生成 3 个区域</span>')),
      '  </button>',
      '</div>',
      '<div class="stat"><b>0 元试用资格由 country=JP 触发</b> · 长链拿到后请用对应区域 IP 打开 · 自动附带 <code>plus-1-month-free</code> 优惠 · 最终支付方式由 ChatGPT / Stripe 决定</div>',
      '<div id="' + NS + '-plus-result" style="margin-top:14px;"></div>',
    ].join('');
  }
  function renderTeam() {
    const f = state.team.form;
    return [
      '<div class="lbl">工作区配置<span class="hint">自动保存</span></div>',
      '<div class="row">',
      '  <label>工作区名称</label>',
      '  <input class="ipt" id="' + NS + '-team-workspace" value="' + escapeHtml(f.workspace) + '" placeholder="例：CKNB 团队工作区">',
      '</div>',
      '<div class="grid2">',
      '  <div class="row" style="margin-bottom:0">',
      '    <label>席位数量（最少 2）</label>',
      '    <input class="ipt" id="' + NS + '-team-seats" type="number" min="2" value="' + escapeHtml(f.seats) + '">',
      '  </div>',
      '  <div class="row" style="margin-bottom:0">',
      '    <label>计费周期</label>',
      '    <select class="ipt" id="' + NS + '-team-interval">',
      '      <option value="month" ' + (f.interval === 'month' ? 'selected' : '') + '>按月</option>',
      '      <option value="year" ' + (f.interval === 'year' ? 'selected' : '') + '>按年</option>',
      '    </select>',
      '  </div>',
      '</div>',
      '<div class="row">',
      '  <label>优惠码（可选）</label>',
      '  <input class="ipt" id="' + NS + '-team-promo" value="' + escapeHtml(f.promo) + '" placeholder="留空表示不使用 · 满网优惠码每天都在变">',
      '</div>',
      '<div class="grid2">',
      '  <div class="row" style="margin-bottom:0">',
      '    <label>国家代码</label>',
      '    <input class="ipt" id="' + NS + '-team-country" value="' + escapeHtml(f.country) + '">',
      '  </div>',
      '  <div class="row" style="margin-bottom:0">',
      '    <label>币种</label>',
      '    <input class="ipt" id="' + NS + '-team-currency" value="' + escapeHtml(f.currency) + '">',
      '  </div>',
      '</div>',
      '<div class="acts">',
      '  <button class="btn primary" data-action="team-generate" ' + (state.team.loading ? 'disabled' : '') + '>',
      (state.team.loading ? '<span class="spin"></span> 生成中…' : (icon('bolt', 14) + ' <span>生成 Team 链接</span>')),
      '  </button>',
      '  <button class="btn ghost" data-action="team-reset">' + icon('reset', 14) + ' <span>重置</span></button>',
      '</div>',
      '<div id="' + NS + '-team-result"></div>',
    ].join('');
  }
  function renderBody() {
    if (state.activeTab === 'auth') return renderAuth();
    if (state.activeTab === 'plus') return renderPlus();
    if (state.activeTab === 'team') return renderTeam();
    return '';
  }
  function setBodyHTML(html) {
    const el = document.getElementById(NS + '-body');
    if (el) el.innerHTML = html;
  }
  function refreshBody() { setBodyHTML(renderBody()); }
  // MODAL + HANDLERS
  function tabBtnHTML(id) {
    const s = tabSpec(id);
    const sel = state.activeTab === id;
    return '<button class="tab" role="tab" data-tab="' + id + '" aria-selected="' + sel + '"><span class="num">' + s.num + '</span><span>' + s.label + '</span></button>';
  }
  function ensureModal() {
    let modal = document.getElementById(NS + '-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = NS + '-modal';
    modal.setAttribute('data-open', 'false');
    const html = [
      '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="' + NS + '-title">',
      '  <div class="hd">',
      '    <div class="hd-brand">',
      '      <div class="hd-mark"><span class="dot"></span><span>CKNB · CHATGPT 全能助手</span></div>',
      '      <h2 class="hd-title" id="' + NS + '-title"><em>ChatGPT</em> 全能助手 · 工作台</h2>',
      '      <div class="hd-meta">',
      '        <span>V' + escapeHtml(VERSION) + '</span>',
      '        <span>·</span>',
      '        <span>作者 <b>' + escapeHtml(AUTHOR) + '</b></span>',
      '        <span>·</span>',
      '        <span>微信 <b>' + escapeHtml(CONTACT_WECHAT) + '</b></span>',
      '      </div>',
      '    </div>',
      '    <div class="hd-actions">',
      '      <button class="hd-close" data-action="close" aria-label="关闭">' + icon('close', 14) + '</button>',
      '    </div>',
      '  </div>',
      '  <div class="tabs" role="tablist">' + tabBtnHTML('auth') + tabBtnHTML('plus') + tabBtnHTML('team') + '</div>',
      '  <div class="bd" id="' + NS + '-body"></div>',
      '  <div class="ft">',
      '    <span><b>v' + escapeHtml(VERSION) + ' <span class="sep">·</span> 9 种导出格式 <span class="sep">·</span> 3 个支付区域</span>',
      '    <span class="kbd-tip"><kbd>⌘ ⇧ K</kbd>  切换 &nbsp; <kbd>ESC</kbd>  关闭</span>',
      '  </div>',
      '</div>',
    ].join('');
    modal.innerHTML = html;
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
    modal.querySelector('[data-action="close"]').addEventListener('click', function(e) { e.stopPropagation(); closeModal(); });
    modal.querySelectorAll('[data-tab]').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); setTab(b.getAttribute('data-tab')); });
    });
    const body = modal.querySelector('#' + NS + '-body');
    body.addEventListener('click', onBodyClick);
    document.body.appendChild(modal);
    return modal;
  }
  function setTab(t) {
    state.activeTab = t;
    saveSettings({ activeTab: t });
    const modal = document.getElementById(NS + '-modal');
    if (!modal) return;
    modal.querySelectorAll('[data-tab]').forEach(function(b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === t));
    });
    refreshBody();
    restoreTabState();
  }
  function restoreTabState() {
    if (state.activeTab === 'plus' && state.plus.bulkResults) renderPlusBulkResults(state.plus.bulkResults);
    else if (state.activeTab === 'plus' && state.plus.lastUrl) renderPlusResult(state.plus.lastUrl);
    if (state.activeTab === 'team' && state.team.lastLinks) renderTeamResult(state.team.lastLinks);
  }
  function openModal() {
    ensureModal();
    refreshBody();
    document.getElementById(NS + '-modal').setAttribute('data-open', 'true');
    restoreTabState();
  }
  function closeModal() {
    const m = document.getElementById(NS + '-modal');
    if (m) m.setAttribute('data-open', 'false');
  }

  async function onBodyClick(e) {
    const btn = e.target.closest('[data-action], [data-target-id], [data-plus-region]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const action = btn.getAttribute('data-action');
    const targetId = btn.getAttribute('data-target-id');
    const region = btn.getAttribute('data-plus-region');
    if (targetId) { state.auth.currentTargetId = targetId; refreshBody(); return; }
    if (region) return onPlusGenerate(region);
    switch (action) {
      case 'auth-fetch': return onAuthFetch();
      case 'auth-copy': return onAuthCopy();
      case 'auth-copy-access-token': return onAuthCopyAccessToken();
      case 'auth-download': return onAuthDownload();
      case 'auth-download-all': return onAuthDownloadAll();
      case 'plus-generate-all': return onPlusGenerateAll();
      case 'team-generate': return onTeamGenerate();
      case 'team-reset': return onTeamReset();
    }
  }
  async function onAuthFetch() {
    if (state.auth.loading) return;
    state.auth.loading = true;
    refreshBody();
    try {
      toast('正在捕获 ChatGPT Session…', 'info', 0);
      const session = await fetchSession();
      const result = buildAllExports(session);
      state.auth.exports = result.exports;
      state.auth.ctx = result.ctx;
      const cur = result.exports[state.auth.currentTargetId];
      if (!cur || cur.error) {
        const firstOk = EXPORT_TARGETS.find(function(t) { return result.exports[t.id] && !result.exports[t.id].error; });
        if (firstOk) state.auth.currentTargetId = firstOk.id;
      }
      toast('已生成 ' + EXPORT_TARGETS.length + ' 种导出格式', 'success');
    } catch (e) {
      toast(e.message || String(e), 'error', 5000);
    } finally {
      state.auth.loading = false;
      refreshBody();
    }
  }
  async function onAuthCopy() {
    const c = state.auth.exports && state.auth.exports[state.auth.currentTargetId];
    if (!c || c.error) { toast('当前内容不可用', 'error'); return; }
    try { await copyText(c.text); toast('已复制 ' + c.label, 'success'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }
  async function onAuthCopyAccessToken() {
    const ctx = state.auth.ctx;
    if (!ctx || !ctx.accessToken) { toast('请先获取 Session', 'error'); return; }
    try { await copyText(ctx.accessToken); toast('已复制 access_token', 'success'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }
  function onAuthDownload() {
    const c = state.auth.exports && state.auth.exports[state.auth.currentTargetId];
    if (!c || c.error) { toast('当前内容不可用', 'error'); return; }
    try { downloadText(c.filename, c.text); toast('已开始下载 ' + c.filename, 'success'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }
  function onAuthDownloadAll() {
    const list = Object.values(state.auth.exports || {}).filter(function(x) { return !x.error; });
    if (!list.length) { toast('没有可下载的内容', 'error'); return; }
    try {
      list.forEach(function(x) { downloadText(x.filename, x.text); });
      toast('已开始下载 ' + list.length + ' 个文件', 'success');
    } catch (e) { toast(e.message || String(e), 'error'); }
  }
  function renderPlusResult(url) {
    const el = document.getElementById(NS + '-plus-result');
    if (!el) return;
    const safe = escapeHtml(url);
    el.innerHTML = [
      '<div class="lbl" style="margin-top:8px">链接已生成</div>',
      '<a class="url" href="' + safe + '" target="_blank" rel="noopener">' + safe + '</a>',
      '<div class="acts">',
      '  <button class="btn primary" data-plus-act="copy">' + icon('copy', 14) + ' <span>复制链接</span></button>',
      '  <button class="btn" data-plus-act="open">' + icon('extOpen', 14) + ' <span>新标签打开</span></button>',
      '</div>',
    ].join('');
    el.querySelector('[data-plus-act="copy"]').addEventListener('click', async function(e) {
      e.stopPropagation();
      try { await copyText(url); toast('已复制', 'success'); }
      catch (err) { toast(err.message || String(err), 'error'); }
    });
    el.querySelector('[data-plus-act="open"]').addEventListener('click', function(e) {
      e.stopPropagation();
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }
  async function onPlusGenerate(regionKey) {
    const profile = PLUS_PROFILES[regionKey];
    if (!profile) return;
    state.plus.bulkResults = null;
    const resEl = document.getElementById(NS + '-plus-result');
    if (resEl) resEl.innerHTML = '<div class="stat"><span class="spin" style="color:#ff5722"></span> &nbsp;正在生成 ' + escapeHtml(profile.label) + ' 链接…</div>';
    try {
      const url = await generatePlusLink(profile);
      state.plus.lastUrl = url;
      renderPlusResult(url);
      toast('Plus 链接生成成功', 'success');
    } catch (e) {
      if (resEl) resEl.innerHTML = '<div class="stat err">' + escapeHtml(e.message || String(e)) + '</div>';
      toast(e.message || String(e), 'error', 5000);
    }
  }
  async function onPlusGenerateAll() {
    if (state.plus.loading) return;
    state.plus.loading = true;
    refreshBody();
    const resEl = document.getElementById(NS + '-plus-result');
    if (resEl) resEl.innerHTML = '<div class="stat"><span class="spin" style="color:#ff5722"></span> &nbsp;并发生成 ' + Object.keys(PLUS_PROFILES).length + ' 个区域…</div>';
    const entries = Object.entries(PLUS_PROFILES);
    const settled = await Promise.allSettled(entries.map(function(e) {
      const k = e[0], p = e[1];
      return generatePlusLink(p).then(function(url) { return { key: k, profile: p, url: url }; });
    }));
    state.plus.loading = false;
    refreshBody();
    const items = settled.map(function(r, i) {
      const k = entries[i][0], p = entries[i][1];
      if (r.status === 'fulfilled') return { ok: true, key: k, profile: p, url: r.value.url };
      return { ok: false, key: k, profile: p, error: (r.reason && r.reason.message) || String(r.reason) };
    });
    state.plus.bulkResults = items;
    const okCount = items.filter(function(i) { return i.ok; }).length;
    renderPlusBulkResults(items);
    toast('批量完成：成功 ' + okCount + ' / ' + items.length, okCount === items.length ? 'success' : 'info');
  }
  function renderPlusBulkResults(items) {
    const el = document.getElementById(NS + '-plus-result');
    if (!el) return;
    const html = items.map(function(it, idx) {
      if (it.ok) {
        const safe = escapeHtml(it.url);
        return [
          '<div class="bulk-item">',
          '  <div class="bulk-hd">',
          '    <span class="region-code">' + it.profile.code + '</span>',
          '    <span class="region-label" style="font-size:14px">' + escapeHtml(it.profile.label) + '</span>',
          '  </div>',
          '  <a class="url" href="' + safe + '" target="_blank" rel="noopener">' + safe + '</a>',
          '  <div class="acts" style="margin-bottom:0">',
          '    <button class="btn primary sm" data-bulk-action="copy" data-bulk-idx="' + idx + '">' + icon('copy', 12) + '  复制</button>',
          '    <button class="btn sm" data-bulk-action="open" data-bulk-idx="' + idx + '">' + icon('extOpen', 12) + '  打开</button>',
          '  </div>',
          '</div>',
        ].join('');
      }
      return [
        '<div class="bulk-item err">',
        '  <div class="bulk-hd">',
        '    <span class="region-code">' + it.profile.code + '</span>',
        '    <span class="region-label" style="font-size:14px">' + escapeHtml(it.profile.label) + '</span>',
        '  </div>',
        '  <div class="stat err">' + escapeHtml(it.error) + '</div>',
        '</div>',
      ].join('');
    }).join('');
    const okCount = items.filter(function(i) { return i.ok; }).length;
    el.innerHTML = '<div class="lbl" style="margin-top:8px">批量结果 · ' + okCount + '/' + items.length + '  成功</div><div class="bulk">' + html + '</div>';
    el.querySelectorAll('[data-bulk-action]').forEach(function(b) {
      b.addEventListener('click', async function(e) {
        e.stopPropagation();
        const idx = Number(b.getAttribute('data-bulk-idx'));
        const item = items[idx];
        if (!item || !item.ok) return;
        if (b.getAttribute('data-bulk-action') === 'copy') {
          try { await copyText(item.url); toast('已复制', 'success'); }
          catch (err) { toast(err.message || String(err), 'error'); }
        } else {
          window.open(item.url, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }
  function onTeamReset() {
    state.team.form = { workspace: 'CKNB 团队工作区', seats: '2', promo: '', country: 'US', currency: 'USD', interval: 'month' };
    saveSettings({ teamForm: state.team.form });
    refreshBody();
    toast('已重置为默认值', 'info');
  }
  function renderTeamResult(links) {
    const el = document.getElementById(NS + '-team-result');
    if (!el) return;
    el.innerHTML = [
      '<div class="lbl" style="margin-top:14px">Team 链接已生成</div>',
      '<div style="font-size:10px;letter-spacing:0.12em;color:#6b6660;margin-bottom:4px">OpenAI 托管</div>',
      '<a class="url" href="' + escapeHtml(links.openai) + '" target="_blank" rel="noopener">' + escapeHtml(links.openai) + '</a>',
      '<div style="font-size:10px;letter-spacing:0.12em;color:#6b6660;margin:6px 0 4px">Stripe 直链</div>',
      '<a class="url" href="' + escapeHtml(links.stripe) + '" target="_blank" rel="noopener">' + escapeHtml(links.stripe) + '</a>',
      '<div class="acts" style="margin-top:10px">',
      '  <button class="btn primary" data-team-act="copy-openai">' + icon('copy', 14) + ' <span>复制 OpenAI</span></button>',
      '  <button class="btn" data-team-act="copy-stripe">' + icon('copy', 14) + ' <span>复制 Stripe</span></button>',
      '  <button class="btn ghost" data-team-act="open-openai">' + icon('extOpen', 14) + ' <span>打开</span></button>',
      '</div>',
    ].join('');
    el.querySelector('[data-team-act="copy-openai"]').addEventListener('click', async function(e) {
      e.stopPropagation();
      try { await copyText(links.openai); toast('已复制 OpenAI 链接', 'success'); }
      catch (err) { toast(err.message || String(err), 'error'); }
    });
    el.querySelector('[data-team-act="copy-stripe"]').addEventListener('click', async function(e) {
      e.stopPropagation();
      try { await copyText(links.stripe); toast('已复制 Stripe 链接', 'success'); }
      catch (err) { toast(err.message || String(err), 'error'); }
    });
    el.querySelector('[data-team-act="open-openai"]').addEventListener('click', function(e) {
      e.stopPropagation();
      window.open(links.openai, '_blank', 'noopener,noreferrer');
    });
  }
  async function onTeamGenerate() {
    const get = function(id) { return document.getElementById(NS + '-team-' + id); };
    const workspaceName = ((get('workspace') && get('workspace').value) || '我的工作区').trim();
    const seats = (get('seats') && get('seats').value) || '2';
    const promoCode = (get('promo') && get('promo').value) || '';
    const country = ((get('country') && get('country').value) || 'US').trim().toUpperCase();
    const currency = ((get('currency') && get('currency').value) || 'USD').trim().toUpperCase();
    const interval = (get('interval') && get('interval').value) === 'year' ? 'year' : 'month';
    state.team.form = { workspace: workspaceName, seats: seats, promo: promoCode, country: country, currency: currency, interval: interval };
    saveSettings({ teamForm: state.team.form });
    state.team.loading = true;
    refreshBody();
    const resEl = document.getElementById(NS + '-team-result');
    if (resEl) resEl.innerHTML = '<div class="stat"><span class="spin" style="color:#ff5722"></span> &nbsp;正在生成 Team 支付链接…</div>';
    try {
      const links = await generateTeamLink({ workspaceName: workspaceName, seats: seats, promoCode: promoCode, country: country, currency: currency, interval: interval });
      state.team.lastLinks = links;
      state.team.loading = false;
      refreshBody();
      renderTeamResult(links);
      toast('Team 链接生成成功', 'success');
    } catch (e) {
      state.team.loading = false;
      refreshBody();
      const re = document.getElementById(NS + '-team-result');
      if (re) re.innerHTML = '<div class="stat err">' + escapeHtml(e.message || String(e)) + '</div>';
      toast(e.message || String(e), 'error', 5000);
    }
  }

  // FAB
  function ensureFab() {
    if (document.getElementById(NS + '-fab')) return;
    const fab = document.createElement('button');
    fab.id = NS + '-fab';
    fab.type = 'button';
    fab.title = 'CKNB ChatGPT 全能助手 · ' + AUTHOR + ' · 拖动可移位';
    fab.innerHTML = '<i class="ic">' + SVG.sigil + '</i><span>工具箱</span>';
    if (Number.isFinite(state.fab.x) && Number.isFinite(state.fab.y)) {
      fab.style.left = state.fab.x + 'px';
      fab.style.top = state.fab.y + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
    let drag = null;
    fab.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      const r = fab.getBoundingClientRect();
      drag = { startX: e.clientX, startY: e.clientY, originLeft: r.left, originTop: r.top, moved: false };
    });
    document.addEventListener('mousemove', function(e) {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      fab.classList.add('dragging');
      const fw = fab.offsetWidth || 48;
      const fh = fab.offsetHeight || 48;
      const x = Math.max(8, Math.min(window.innerWidth - fw - 8, drag.originLeft + dx));
      const y = Math.max(8, Math.min(window.innerHeight - fh - 8, drag.originTop + dy));
      fab.style.left = x + 'px'; fab.style.top = y + 'px';
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function() {
      if (!drag) return;
      const wasMoved = drag.moved; drag = null;
      fab.classList.remove('dragging');
      if (wasMoved) {
        const r = fab.getBoundingClientRect();
        state.fab.x = Math.round(r.left);
        state.fab.y = Math.round(r.top);
        saveSettings({ fabX: state.fab.x, fabY: state.fab.y });
      } else {
        openModal();
      }
    });
    document.body.appendChild(fab);
  }

  // INIT
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    ensureStyle();
    ensureFab();
    ensureModal();
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('打开 CKNB ChatGPT 全能助手', openModal);
    }
    document.addEventListener('keydown', function(e) {
      const m = document.getElementById(NS + '-modal');
      if (e.key === 'Escape') {
        if (m && m.getAttribute('data-open') === 'true') closeModal();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault();
        if (m && m.getAttribute('data-open') === 'true') closeModal(); else openModal();
      }
    });
    new MutationObserver(function() {
      if (!document.getElementById(NS + '-fab')) ensureFab();
    }).observe(document.body, { childList: true, subtree: false });
  }
  init();
})();
