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
  const VERSION = '2.5.1';
  const SESSION_URL = '/api/auth/session';
  const CHECKOUT_URL = '/backend-api/payments/checkout';
  const AXONHUB_PLACEHOLDER = '__missing_refresh_token__';
  const SETTINGS_KEY = 'cknb-specimen.settings.v2';

  const EXPORT_TARGETS = [
    { id: 'auth',          label: 'auth.json',     filename: 'auth.json',          desc: 'Codex CLI 原生' },
    { id: 'cockpit',       label: 'Cockpit',       filename: 'cockpit.json',       desc: 'Cockpit Tools 完整 tokens 嵌套格式' },
    { id: 'codex',         label: 'Codex Auth',    filename: 'codex-auth.json',    desc: '重组 id_token 含 email/profile' },
    { id: 'cpa',           label: 'CPA',           filename: 'cpa.json',           desc: 'CLI Proxy API 中转格式' },
    { id: 'sub2api',       label: 'Sub2API',       filename: 'sub2api.json',       desc: 'CPA2sub2API 项目格式' },
    { id: '9router',       label: '9router',       filename: '9router.json',       desc: '9router Codex OAuth 格式' },
    { id: 'axonhub',       label: 'AxonHub',       filename: 'axonhub-auth.json',  desc: 'AxonHub Codex auth.json' },
    { id: 'codex-manager', label: 'Codex-Manager', filename: 'codex-manager.json', desc: 'Codex-Manager 批量导入' },
    { id: 'raw-session',   label: 'Raw Session',   filename: 'session.json',       desc: '原始 Session JSON 不变换' },
  ];

  // ──────────────────────────────────────────────────────────
  //  IMPORT_FORMATS · 反向导入支持识别的来源格式
  // ──────────────────────────────────────────────────────────
  //  每一种都是别人/其他工具产出的 JSON 文件，本脚本能反向解析
  //  回内部 ctx 中间表示，然后复用现有 9 种导出器把它转成任意
  //  目标格式（互转矩阵：9 进 9 出）。
  //  · auto    : 根据字段特征自动猜测
  //  · 其他 id : 与 EXPORT_TARGETS 一一对应，作为手动覆盖项
  //  · plain   : 极简「裸 token」格式（access_token 单字段或一行 JWT）
  // ──────────────────────────────────────────────────────────
  const IMPORT_FORMATS = [
    { id: 'auto',          label: '自动识别',      desc: '按字段特征自动判别（推荐）' },
    { id: 'session',       label: '原始 Session',  desc: '/api/auth/session 原始返回' },
    { id: 'auth',          label: 'auth.json',     desc: 'Codex CLI ~/.codex/auth.json' },
    { id: 'codex',         label: 'Codex Auth',    desc: '旧版重组 id_token 格式' },
    { id: 'cpa',           label: 'CPA',           desc: 'type=codex 平铺 + 你的 Python 脚本输出' },
    { id: 'sub2api',       label: 'Sub2API',       desc: 'accounts[].credentials 嵌套（iCloud 备份）' },
    { id: 'cockpit',       label: 'Cockpit',       desc: 'Cockpit Tools tokens 嵌套' },
    { id: '9router',       label: '9router',       desc: 'camelCase + providerSpecificData' },
    { id: 'axonhub',       label: 'AxonHub',       desc: 'AxonHub Codex auth.json' },
    { id: 'codex-manager', label: 'Codex-Manager', desc: 'tokens + meta 双块' },
    { id: 'plain',         label: '裸 Token',      desc: '只给一个 access_token 字符串也认' },
  ];

  // 关键认知（已对照 linux.do bdigu 教程 + payurl.ark2.cn 工具截图核对）：
  //   · 0 元试用资格 = ChatGPT 服务端看请求出口 IP 是日本，与请求体 country 字段无关
  //   · country/currency 字段 = 决定 pay.openai.com 支付页的 locale + 币种 + 默认显示的支付方式
  //   · PayPal 在欧元区国家页面默认显示，所以走 PayPal 通道要用欧元区 country
  //   · 美区（country=US）页面更偏向卡直付，PayPal 入口隐藏，所以不适合
  //   · 重要：OpenAI / Stripe 后端会定期调整「country → 可用支付方式」映射，
  //     某天 DE/FR 没 PayPal 了不代表脚本坏，换其他欧元区国家或自定义即可。
  // 用户责任：自己挂日本梯子让出口 IP=JP（脚本无法控制浏览器出口 IP）
  const PLUS_PROFILES = {
    // ─── 欧元区 PayPal 备选池 ─────────────────────────────────────
    //   全部用 EUR 币种，理论上每个国家的 hosted checkout 页面都会
    //   显示 PayPal。当 OpenAI / Stripe 临时调整某国时换下一国即可。
    paypal_de: { label: 'PayPal · 德国',     country: 'DE', currency: 'EUR', code: 'DE', note: '欧元区首选 · 常见 PayPal 入口' },
    paypal_fr: { label: 'PayPal · 法国',     country: 'FR', currency: 'EUR', code: 'FR', note: '欧元区备选 · 德区拒卡时优先换法区' },
    paypal_it: { label: 'PayPal · 意大利',   country: 'IT', currency: 'EUR', code: 'IT', note: '欧元区备选 · 2026 新增' },
    paypal_es: { label: 'PayPal · 西班牙',   country: 'ES', currency: 'EUR', code: 'ES', note: '欧元区备选 · 西卡友好' },
    paypal_nl: { label: 'PayPal · 荷兰',     country: 'NL', currency: 'EUR', code: 'NL', note: '欧元区备选 · iDEAL + PayPal' },
    paypal_be: { label: 'PayPal · 比利时',   country: 'BE', currency: 'EUR', code: 'BE', note: '欧元区备选 · Bancontact 区' },
    paypal_at: { label: 'PayPal · 奥地利',   country: 'AT', currency: 'EUR', code: 'AT', note: '欧元区备选 · EPS 区' },
    paypal_pt: { label: 'PayPal · 葡萄牙',   country: 'PT', currency: 'EUR', code: 'PT', note: '欧元区备选 · 冷门可用' },
    paypal_ie: { label: 'PayPal · 爱尔兰',   country: 'IE', currency: 'EUR', code: 'IE', note: '欧元区备选 · 英语界面' },
    // ─── 非 PayPal 通道 ──────────────────────────────────────────
    direct:    { label: '日区直绑 · JPY',    country: 'JP', currency: 'JPY', code: 'JP', note: '日卡 / Wise 直绑（不走 PayPal，需真日卡）' },
    gopay:     { label: 'GoPay · 印尼',      country: 'ID', currency: 'IDR', code: 'ID', note: '印尼区 GoPay · 风控较严，封号风险高' },
    // ─── 本地即时支付通道 · 印度 UPI / 巴西 PIX ────────────────────
    //   依据 OpenAI Help「Multi-currency billing」官方说明：
    //     · UPI（印度统一支付接口）对 Go / Plus 计划开放，账单币种必须 INR 卢比
    //     · PIX（巴西央行即时转账）对 Go / Plus / Pro 计划开放，账单币种必须 BRL 雷亚尔
    //   二者都是绑本地银行账户、扫码秒到的国民级支付，全程不需要信用卡。
    //   country/currency 决定支付页币种与默认支付方式，locale 字段单独控制界面语言，
    //   0 元试用资格照旧只看出口 IP。locale 已对照 Stripe Checkout 合法语言标签校验：
    //     · 印度无 en-IN / 印地语界面，统一用 en（英语 · 印度商业通用语）
    //     · 巴西用 pt-BR（巴西葡萄牙语 · 区别于葡萄牙的 pt）
    //   订阅扣款机制：UPI 走 UPI AutoPay e-mandate、PIX 走 Pix Automatico mandate，
    //   均为 OpenAI 官方对 Plus 月度订阅开放的合规循环代扣。
    upi_in:    { label: 'UPI · 印度',        country: 'IN', currency: 'INR', code: 'IN', locale: 'en',    note: '印度 UPI 即时支付 · 卢比区 · 英文支付页 · 绑银行账户扫码秒付 · UPI AutoPay 撑月度订阅 · OpenAI 官方对 Plus 开放' },
    pix_br:    { label: 'PIX · 巴西',        country: 'BR', currency: 'BRL', code: 'BR', locale: 'pt-BR', note: '巴西 PIX 即时转账 · 雷亚尔区 · 葡语支付页 · 扫码或粘贴码秒到账 · Pix Automatico 撑月度订阅 · OpenAI 官方对 Plus 开放' },
    paypal_gb: { label: 'PayPal · 英国',     country: 'GB', currency: 'GBP', code: 'GB', note: '英镑区 · PayPal 也常出现' },
    // 兜底 · 美区美元 · OpenAI 默认区域 · 通常不显示 PayPal 但生成最稳
    us_default:{ label: '美区兜底 · USD',    country: 'US', currency: 'USD', code: 'US', note: 'OpenAI 默认区域 · 通常无 PayPal 入口但卡直付最稳 · 欧元区全失败时的最后兜底' },
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


  // ──────────────────────────────────────────────────────────
  //  i18n · 中英双语 · 按时区自动切换 · 可手动覆盖
  //  · 中文时区（中国大陆 / 港澳台 / 新加坡）→ zh
  //  · 其他时区 → en
  //  · 用户手动点语言按钮后写入 localStorage，优先于时区
  // ──────────────────────────────────────────────────────────
  const ZH_TIMEZONES = {
    'Asia/Shanghai': 1, 'Asia/Chongqing': 1, 'Asia/Harbin': 1, 'Asia/Urumqi': 1,
    'Asia/Hong_Kong': 1, 'Asia/Macau': 1, 'Asia/Taipei': 1, 'Asia/Singapore': 1,
    'Asia/Macao': 1,
  };
  function detectLangFromTimezone() {
    try {
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim();
      if (ZH_TIMEZONES[tz]) return 'zh';
      // 兜底：部分环境时区字符串变体
      if (/Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Hong_Kong|Macau|Macao|Taipei|Singapore)/i.test(tz)) return 'zh';
    } catch (e) {}
    return 'en';
  }
  function resolveInitialLang(persistedLang, langManual) {
    if (langManual && (persistedLang === 'zh' || persistedLang === 'en')) return persistedLang;
    return detectLangFromTimezone();
  }
  const I18N = {
    zh: {
      'fab.label': '工具箱',
      'fab.title': 'CKNB ChatGPT 全能助手 · 传康KK-CKNB · 拖动可移位',
      'hd.mark': 'CKNB · CHATGPT 全能助手',
      'hd.title': '<em>ChatGPT</em> 全能助手 · 工作台',
      'hd.author': '作者',
      'hd.wechat': '微信',
      'hd.close': '关闭',
      'hd.lang': 'English',
      'hd.langTip': '切换到英文',
      'ft.formats': '9 种导出格式',
      'ft.regions': '支付区域',
      'ft.toggle': '切换',
      'ft.close': '关闭',
      'tab.auth': '鉴权 · 导出',
      'tab.plus': 'Plus 订阅',
      'tab.team': 'Team 订阅',
      'tab.imp': '导入 · 转换',
      'notice.title': '代充已封控 · 请购买成品号',
      'notice.sub': '当前代充渠道风控严重、已不可靠。请微信联系 <b style="color:#ff5722">传康KK</b>（vx: <b style="color:#ff5722">1837620622</b>）本地购买成品号。',
      'notice.toggleOpen': '购买说明',
      'notice.toggleClose': '收起说明',
      'notice.detailTitle': '为什么不能再走代充？',
      'notice.detailP1': 'OpenAI / 支付通道近期对代充、灰产卡密与批量试用做了更严的风控。旧版「低价代充 / PayPal 0 元试用」路径成功率极低，且容易导致账号异常。',
      'notice.detailTitle2': '推荐方案：本地购买成品号',
      'notice.detailP2': '直接联系作者 <b>传康KK</b>，微信：<b style="color:#ff5722">1837620622</b>。说明你需要的规格（Plus / Team / 时长等），购买已开通好的成品号，省去代充踩坑。',
      'notice.detailTitle3': '本工具还能做什么？',
      'notice.detailP3': 'Session 导出 9 种格式、反向导入互转、以及官方 Plus / Team 支付链接生成（自用 / 研究场景）仍然可用。需要稳定账号时，优先走成品号。',
      'notice.footer': '联系微信 · 传康KK · 1837620622',
      'notice.copyWx': '复制微信号',
      'notice.copiedWx': '已复制微信号 1837620622',
    },
    en: {
      'fab.label': 'Toolbox',
      'fab.title': 'CKNB ChatGPT All-in-One · 传康KK-CKNB · Drag to reposition',
      'hd.mark': 'CKNB · CHATGPT TOOLBOX',
      'hd.title': '<em>ChatGPT</em> All-in-One · Workbench',
      'hd.author': 'Author',
      'hd.wechat': 'WeChat',
      'hd.close': 'Close',
      'hd.lang': '中文',
      'hd.langTip': 'Switch to Chinese',
      'ft.formats': '9 export formats',
      'ft.regions': 'payment regions',
      'ft.toggle': 'Toggle',
      'ft.close': 'Close',
      'tab.auth': 'Auth · Export',
      'tab.plus': 'Plus',
      'tab.team': 'Team',
      'tab.imp': 'Import · Convert',
      'notice.title': 'Proxy top-up blocked · Buy finished accounts',
      'notice.sub': 'Proxy recharge is under heavy risk control and no longer reliable. Contact <b style="color:#ff5722">传康KK</b> on WeChat (<b style="color:#ff5722">1837620622</b>) to buy ready-made accounts locally.',
      'notice.toggleOpen': 'How to buy',
      'notice.toggleClose': 'Collapse',
      'notice.detailTitle': 'Why proxy top-up no longer works',
      'notice.detailP1': 'OpenAI and payment providers tightened risk controls on proxy top-ups, grey-market cards, and mass free trials. The old cheap PayPal trial path rarely succeeds and may put accounts at risk.',
      'notice.detailTitle2': 'Recommended: buy finished accounts',
      'notice.detailP2': 'Contact author <b>传康KK</b> on WeChat: <b style="color:#ff5722">1837620622</b>. Tell them the plan you need (Plus / Team / duration). Buy a ready-made account instead of fighting broken proxy channels.',
      'notice.detailTitle3': 'What this tool still does',
      'notice.detailP3': 'Session export (9 formats), reverse import conversion, and official Plus / Team checkout link generation still work for personal / research use. For a stable account, prefer finished products.',
      'notice.footer': 'WeChat · 传康KK · 1837620622',
      'notice.copyWx': 'Copy WeChat ID',
      'notice.copiedWx': 'Copied WeChat ID 1837620622',
    },
  };
  function t(key) {
    const pack = I18N[state.lang] || I18N.zh;
    if (pack[key] != null) return pack[key];
    if (I18N.zh[key] != null) return I18N.zh[key];
    return key;
  }
  function applyLangChrome() {
    const fab = document.getElementById(NS + '-fab');
    if (fab) {
      fab.title = t('fab.title');
      const span = fab.querySelector('span');
      if (span) span.textContent = t('fab.label');
    }
    const modal = document.getElementById(NS + '-modal');
    if (!modal) return;
    const mark = modal.querySelector('.hd-mark span:last-child');
    if (mark) mark.textContent = t('hd.mark');
    const title = modal.querySelector('#' + NS + '-title');
    if (title) title.innerHTML = t('hd.title');
    const meta = modal.querySelector('.hd-meta');
    if (meta) {
      meta.innerHTML = [
        '<span>V' + escapeHtml(VERSION) + '</span>',
        '<span>·</span>',
        '<span>' + escapeHtml(t('hd.author')) + ' <b>' + escapeHtml(AUTHOR) + '</b></span>',
        '<span>·</span>',
        '<span>' + escapeHtml(t('hd.wechat')) + ' <b>' + escapeHtml(CONTACT_WECHAT) + '</b></span>',
      ].join('');
    }
    const langBtn = modal.querySelector('[data-action="toggle-lang"]');
    if (langBtn) {
      langBtn.textContent = t('hd.lang');
      langBtn.title = t('hd.langTip');
    }
    const closeBtn = modal.querySelector('[data-action="close"]');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('hd.close'));
    modal.querySelectorAll('[data-tab]').forEach(function(b) {
      const id = b.getAttribute('data-tab');
      const s = tabSpec(id);
      b.innerHTML = '<span class="num">' + s.num + '</span><span>' + s.label + '</span>';
    });
    const ft = modal.querySelector('.ft');
    if (ft) {
      ft.innerHTML = [
        '<span><b>v' + escapeHtml(VERSION) + ' <span class="sep">·</span> ' + escapeHtml(t('ft.formats')) + ' <span class="sep">·</span> ' + escapeHtml(t('ft.regions')) + '</b></span>',
        '<span class="kbd-tip"><kbd>⌘ ⇧ K</kbd>  ' + escapeHtml(t('ft.toggle')) + ' &nbsp; <kbd>ESC</kbd>  ' + escapeHtml(t('ft.close')) + '</span>',
      ].join('');
    }
  }
  function setLang(lang, manual) {
    if (lang !== 'zh' && lang !== 'en') return;
    if (state.lang === lang && !manual) return;
    state.lang = lang;
    if (manual) {
      state.langManual = true;
      saveSettings({ lang: lang, langManual: true });
    }
    applyLangChrome();
    refreshBody();
    restoreTabState();
  }
  function toggleLang() {
    setLang(state.lang === 'zh' ? 'en' : 'zh', true);
  }

  const persisted = loadSettings();
  const state = {
    lang: resolveInitialLang(persisted.lang, persisted.langManual),
    langManual: Boolean(persisted.langManual),
    activeTab: persisted.activeTab || 'auth',
    auth: { exports: null, ctx: null, currentTargetId: 'auth', loading: false },
    plus: {
      lastUrl: '', loading: false,
      // 自定义 country/currency 输入框（持久化，方便用户记住最近一次试的组合）
      customCountry: persisted.plusCustomCountry || '',
      customCurrency: persisted.plusCustomCurrency || '',
      // Token 来源：'session'（当前网页）/ 'custom'（用户粘贴）
      //   tokenSource + customToken 都持久化到 localStorage，下次打开还能用
      //   （仅你自己的浏览器本地，从未上传任何服务端）
      tokenSource: persisted.plusTokenSource || 'session',
      customToken: persisted.plusCustomToken || '',
    },
    team: {
      lastLinks: null, loading: false,
      form: persisted.teamForm || {
        workspace: 'CKNB 团队工作区',
        seats: '2', promo: '', country: 'US', currency: 'USD', interval: 'month',
      },
    },
    // imp · 反向导入子状态
    //  · rawInput      : 用户原始粘贴 / 上传的文本（保留以便重解析）
    //  · sourceFormat  : 'auto' 或 IMPORT_FORMATS 中某个手动覆盖 id
    //  · detectedId    : detectFormat 自动识别出的 id（用于 UI 展示）
    //  · accounts      : 解析出的多个账号 [{ctx, label, error?}]
    //  · activeIdx     : 当前预览的账号下标
    //  · currentTargetId: 选中的目标导出格式 id
    //  · exports       : 当前账号的 9 种产出
    //  · loading       : 解析中遮罩
    imp: {
      rawInput: '', sourceFormat: 'auto', detectedId: null,
      accounts: [], activeIdx: 0,
      currentTargetId: 'cockpit', exports: null,
      loading: false,
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
  // ─── 把通道的 locale 翻成合法的 Accept-Language 头 ───────────────
  //   支付页（pay.openai.com 及其内嵌 Stripe Checkout）按 Accept-Language
  //   决定界面语言。这里只动 HTTP 头、刻意不往请求体塞 locale 字段——请求体
  //   locale 历史上会污染 hosted 模式默认行为（见下方字段黑名单注释）。因此未设
  //   locale 的旧通道（欧元区 PayPal / 日区 / 美区等）维持原中文界面、零行为变化；
  //   只有显式带 locale 的印度 / 巴西通道才切到对应区域语言。
  function buildAcceptLanguage(locale) {
    if (!locale) return 'zh-CN,zh;q=0.9';                    // 未指定：维持现状中文界面
    if (locale.indexOf('-') < 0) return locale;               // 如 en → 'en'
    return locale + ',' + locale.split('-')[0] + ';q=0.9';    // 如 pt-BR → 'pt-BR,pt;q=0.9'
  }
  async function postCheckout(body, accessToken, acceptLanguage) {
    const r = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Accept-Language': acceptLanguage || 'zh-CN,zh;q=0.9',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch (e) {}
    if (!r.ok) throw new Error('checkout 失败 HTTP ' + r.status + '：' + text.slice(0, 500));
    return data;
  }

  // ════════════════════════════════════════════════════════════════
  //  长链引擎 v2.4.0 —— 对齐本地「最新长链」服务端三步法
  // ----------------------------------------------------------------
  //  旧版（v2.3.x）只在 hosted 响应里直接取 data.url，或拿 client_secret
  //  手工拼 #fid 片段——hosted 模式下 OpenAI 经常不回完整片段，拼出来的
  //  pay.openai.com 长链打不开。新版补上服务端同款关键一步：显式去打
  //  Stripe 的 payment_pages init 端点，拿回带权威 #fid 片段的 hosted
  //  URL，再把 host 从 checkout.stripe.com 重写成 pay.openai.com。
  //
  //  三步：
  //    1. POST /backend-api/payments/checkout            → cs_id + publishable_key
  //    2. POST api.stripe.com/v1/payment_pages/{cs}/init → stripe_hosted_url
  //    3. host 重写 checkout.stripe.com → pay.openai.com → 最终长链
  //
  //  跨域说明：第 2 步打的是 api.stripe.com，与 chatgpt.com 不同源。
  //  扩展版的 content script 受所在页面同源策略限制，跨域 fetch 会被
  //  CORS 拦，所以转交 background service worker（持 api.stripe.com 的
  //  host_permissions）代发；SW 不可用时退一步直接 fetch 兜底。
  // ════════════════════════════════════════════════════════════════

  // OpenAI 嵌在 checkout JS 里的公开 Stripe live publishable key，
  // 仅当 checkout 响应里没带 publishable_key 时兜底用。
  const DEFAULT_STRIPE_PK = 'pk_live_51HOrSwC6h1nxGoI3lTAgRjYVrz4dU3fVOabyCcKR3pbEJguCVAlqCxdxCUvoRh1XWwRacViovU3kLKvpkjh7IqkW00iXQsjo3n';
  // Stripe 版本头：与 ChatGPT 网页内置 checkout 的 _stripe_version 逐字对齐
  const STRIPE_API_VERSION = '2025-03-31.basil; checkout_server_update_beta=v1; checkout_manual_approval_preview=v1';
  const STRIPE_INIT_BASE = 'https://api.stripe.com/v1/payment_pages/';

  // 通道 locale → Stripe init 用的语言标签，未指定按服务端默认 en
  function stripeInitLocale(locale) {
    return (locale && String(locale).trim()) || 'en';
  }

  // 拼 Stripe payment_pages init 的表单体（application/x-www-form-urlencoded）
  function buildStripeInitBody(pk, locale) {
    const jsId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Date.now().toString(16) + Math.random().toString(16).slice(2));
    const p = new URLSearchParams();
    p.set('browser_locale', 'en-US');
    p.set('browser_timezone', 'Asia/Shanghai');
    p.set('elements_session_client[client_betas][0]', 'custom_checkout_server_updates_1');
    p.set('elements_session_client[client_betas][1]', 'custom_checkout_manual_approval_1');
    p.set('elements_session_client[elements_init_source]', 'custom_checkout');
    p.set('elements_session_client[referrer_host]', 'chatgpt.com');
    p.set('elements_session_client[stripe_js_id]', jsId);
    p.set('elements_session_client[locale]', stripeInitLocale(locale));
    p.set('elements_session_client[is_aggregation_expected]', 'false');
    p.set('elements_options_client[saved_payment_method][enable_save]', 'auto');
    p.set('elements_options_client[saved_payment_method][enable_redisplay]', 'auto');
    p.set('key', pk);
    p.set('_stripe_version', STRIPE_API_VERSION);
    return p.toString();
  }

  // 跨域 POST api.stripe.com：优先转交 background SW（绕 CORS），SW 不可用时降级 fetch
  //   background SW 内部会先直连 Stripe，失败后自动降级走自有域名代理。
  function stripeFetch(url, headers, body, csId) {
    return new Promise(function (resolve, reject) {
      const hasRuntime = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function');
      if (hasRuntime) {
        try {
          chrome.runtime.sendMessage(
            { type: 'CKNB_STRIPE_INIT', url: url, headers: headers, body: body, csId: csId },
            function (resp) {
              if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message || 'background 通信失败')); return; }
              if (!resp || !resp.ok) { reject(new Error((resp && resp.error) || 'Stripe 请求失败')); return; }
              resolve({ status: resp.status, text: resp.text });
            }
          );
          return;
        } catch (e) { /* 落到下方 fetch 兆底 */ }
      }
      fetch(url, { method: 'POST', headers: headers, body: body })
        .then(function (r) { return r.text().then(function (t) { resolve({ status: r.status, text: t }); }); })
        .catch(function (e) { reject(e); });
    });
  }

  // 第 2 步：调 Stripe payment_pages init，返回解析后的 JSON
  //   跨域说明：content script 的 fetch 受 chatgpt.com 同源策略限制，
  //   所以通过 stripeFetch → background SW 代发（SW 持有 api.stripe.com
  //   的 host_permissions）。manifest 里的 declarativeNetRequest 静态规则
  //   会在网络层剥离发往 api.stripe.com 请求的 Origin 头，避免 Stripe 403。
  async function stripeInit(csId, pk, locale) {
    const url = STRIPE_INIT_BASE + encodeURIComponent(csId) + '/init';
    const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
    const headers = {
      'Authorization': 'Bearer ' + pk,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': DEFAULT_UA,
    };
    const res = await stripeFetch(url, headers, buildStripeInitBody(pk, locale), csId);
    let data = {};
    try { data = JSON.parse(res.text); } catch (e) {}
    if (res.status !== 200) {
      throw new Error('Stripe init 失败 HTTP ' + res.status + '：' + String(res.text || '').slice(0, 300));
    }
    return data;
  }

  // checkout 响应 → 长链。主路径走 Stripe init，失败回退旧版 buildBothCheckoutUrls。
  //   返回结构兼容旧版 { external, internal }，额外带 stripe / cs_id 供 Team 用。
  async function buildLongLinkUrls(data, country, locale) {
    const base = buildBothCheckoutUrls(data, country);  // 旧版结果：保内部短链 + 兜底外链
    const sid = (data && (data.checkout_session_id || '').trim()) || extractSessionIdFromAnyUrl(data);
    if (!sid) return base;  // 连 session id 都没有，无从打 Stripe，直接退回旧逻辑
    const pk = (data && (data.publishable_key || '').trim()) || DEFAULT_STRIPE_PK;
    // 调试日志：打印 OpenAI checkout 响应里跟长链相关的所有字段
    try { console.log('[' + NS + '] 长链引擎 Step 1 响应字段:', JSON.stringify({
      checkout_session_id: data.checkout_session_id ? '有' : '无',
      publishable_key: data.publishable_key ? (data.publishable_key.slice(0, 20) + '…') : '无',
      url: data.url || '无',
      client_secret: data.client_secret ? '有(' + data.client_secret.length + '字符)' : '无',
      processor_entity: data.processor_entity || '无',
    })); } catch (_) {}
    try {
      console.log('[' + NS + '] 长链引擎 Step 2: 调 Stripe init, cs_id=' + sid.slice(0, 20) + '…');
      const sd = await stripeInit(sid, pk, locale);
      // 调试日志：打印 Stripe init 响应的所有顶层 key，方便排查字段名变化
      try { console.log('[' + NS + '] Stripe init 响应 keys:', Object.keys(sd || {}).join(', '));
        console.log('[' + NS + '] Stripe init hosted url 候选:', JSON.stringify({
          stripe_hosted_url: (sd.stripe_hosted_url || '').slice(0, 80) || '无',
          hosted_url: (sd.hosted_url || '').slice(0, 80) || '无',
          url: (sd.url || '').slice(0, 80) || '无',
        }));
      } catch (_) {}
      let hosted = sd.stripe_hosted_url || sd.hosted_url || sd.url || '';
      if (!hosted) {
        // init 没回 hosted url —— 打印完整响应帮助定位
        try { console.warn('[' + NS + '] Stripe init 没返回 hosted URL! 完整响应:', JSON.stringify(sd).slice(0, 500)); } catch (_) {}
      }
      // 第 3 步：host 重写 checkout.stripe.com → pay.openai.com
      const external = hosted
        ? (hosted.indexOf('checkout.stripe.com') >= 0 ? hosted.replace('checkout.stripe.com', 'pay.openai.com') : hosted)
        : base.external;
      const stripeMirror = hosted
        ? (hosted.indexOf('pay.openai.com') >= 0 ? hosted.replace('pay.openai.com', 'checkout.stripe.com') : hosted)
        : (base.external && base.external.indexOf('pay.openai.com') >= 0 ? base.external.replace('pay.openai.com', 'checkout.stripe.com') : base.external);
      return { external: external || base.external, internal: base.internal, stripe: stripeMirror, cs_id: sid };
    } catch (e) {
      // Stripe init 失败：打印详细错误以便定位是网络/CORS/响应格式问题
      try { console.warn('[' + NS + '] Stripe init 失败，回退旧版取链：' + ((e && e.message) || e));
        console.warn('[' + NS + '] Stripe init 错误堆栈:', (e && e.stack) || '无堆栈');
      } catch (_) {}
      return base;
    }
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
    // Cockpit 实际接受的导入格式（用户提供 2026-05 最新版）：
    //   完整 tokens 嵌套结构 + id/email/created_at/last_used 元信息
    //   旧版扁平 token 字段（如 v2.0 写的那种）已不被识别
    const nowSec = Math.floor(ctx.now.getTime() / 1000);
    const idSuffix = ctx.accountId
      || (ctx.email ? toEmailKey(ctx.email) : null)
      || String(nowSec);
    return {
      id: 'codex_' + idSuffix,
      email: ctx.email || '',
      tokens: {
        id_token: ctx.codexIdToken || '',
        access_token: ctx.accessToken,
        refresh_token: ctx.refreshToken || '',
      },
      account_id: ctx.accountId,
      last_refresh: ctx.exportedAt,
      expired: ctx.expiresAt,
      created_at: nowSec,
      last_used: nowSec,
    };
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

  // ════════════════════════════════════════════════════════════
  //  IMPORT · 反向导入：把别人的 JSON 还原为 ctx 再走 9 种导出
  // ════════════════════════════════════════════════════════════
  //  整体管线：
  //    原始文本输入  → 解析为 JSON  → detectFormat() 猜格式
  //                                  ↓
  //                       (用户可手动覆盖识别结果)
  //                                  ↓
  //                       归一化为 accounts 数组（即便单账号也包成 [一个]）
  //                                  ↓
  //                       逐个 reverseAccountToCtx(item, fmt)
  //                                  ↓
  //                              ctx 中间表示
  //                                  ↓
  //                       ctxToVirtualSession(ctx)  ←  为 buildAuth / buildCodex /
  //                                  ↓                    raw-session 重建一个等价 session
  //                       buildPayload(targetId, vsession, ctx)
  //                                  ↓
  //                            9 种目标格式输出
  // ════════════════════════════════════════════════════════════

  // --- 工具：JWT payload 解析失败时返回 {} 而不是 undefined ---
  function safeJwtPayload(token) {
    if (typeof token !== 'string' || token.split('.').length < 2) return {};
    const p = parseJwt(token);
    return isObj(p) ? p : {};
  }

  // --- 从一个 access_token JWT 内部挖出能挖到的所有元数据 ---
  //     即使输入 JSON 只给了一个孤零零的 access_token，
  //     也能从它的 payload 里反推出 email / accountId / planType / userId / exp 等。
  function harvestFromJwt(accessToken) {
    const p = safeJwtPayload(accessToken);
    const auth = isObj(p['https://api.openai.com/auth']) ? p['https://api.openai.com/auth'] : {};
    const prof = isObj(p['https://api.openai.com/profile']) ? p['https://api.openai.com/profile'] : {};
    return {
      email: firstStr(prof.email, p.email),
      accountId: firstStr(auth.chatgpt_account_id, p.chatgpt_account_id),
      userId: firstStr(auth.chatgpt_user_id, auth.user_id, p.chatgpt_user_id, p.user_id),
      planType: firstStr(auth.chatgpt_plan_type, p.chatgpt_plan_type),
      expiresAtIso: tsFromUnix(p.exp),
      expiresAtUnix: Number.isFinite(Number(p.exp)) ? Number(p.exp) : undefined,
      issuedAtUnix: Number.isFinite(Number(p.iat)) ? Number(p.iat) : undefined,
      emailVerified: prof.email_verified === true,
    };
  }

  // --- detectFormat · 按字段特征猜测来源格式 ---
  //     判别优先级很关键：越「窄」越特异的特征要先匹配，
  //     越「宽」越通用的特征兜底放后面，避免误判。
  function detectFormat(input) {
    if (typeof input === 'string') {
      // 单纯一个 JWT 字符串：access_token 裸 token
      if (input.split('.').length >= 3) return 'plain';
      return null;
    }
    if (Array.isArray(input)) {
      if (input.length === 0) return null;
      // 数组形式：取第一个元素递归判别
      return detectFormat(input[0]);
    }
    if (!isObj(input)) return null;

    // 1) Sub2API · 最特异：含 accounts[].credentials 嵌套
    if (Array.isArray(input.accounts) && input.accounts.length > 0 &&
        isObj(input.accounts[0]) && isObj(input.accounts[0].credentials)) {
      return 'sub2api';
    }
    // 2) 原始 Session · 有 accessToken (camelCase) + user/account
    if (typeof input.accessToken === 'string' &&
        (isObj(input.user) || isObj(input.account))) {
      return 'session';
    }
    // 3) 9router · camelCase accessToken + providerSpecificData
    if (typeof input.accessToken === 'string' &&
        (isObj(input.providerSpecificData) || input.provider === 'codex')) {
      return '9router';
    }
    // 4) AxonHub · auth_mode + axonhub_* 标记
    if (input.auth_mode === 'chatgpt' && isObj(input.tokens) &&
        (input.axonhub_refresh_token_placeholder !== undefined ||
         input.axonhub_note !== undefined)) {
      return 'axonhub';
    }
    // 5) auth.json · auth_mode + tokens.account_id (Codex CLI 标志)
    if (input.auth_mode === 'chatgpt' && isObj(input.tokens) &&
        (input.tokens.account_id !== undefined || 'OPENAI_API_KEY' in input)) {
      return 'auth';
    }
    // 6) Codex-Manager · tokens + meta 双块
    if (isObj(input.tokens) && isObj(input.meta)) {
      return 'codex-manager';
    }
    // 7) Cockpit · tokens 嵌套 + 平铺 account_id/email/expired (无 meta)
    if (isObj(input.tokens) && typeof input.tokens.access_token === 'string' &&
        (input.account_id !== undefined || input.expired !== undefined ||
         input.last_used !== undefined || input.created_at !== undefined)) {
      return 'cockpit';
    }
    // 8) CPA / Python 脚本输出 · type=codex 平铺，无 tokens 嵌套
    if (input.type === 'codex' && typeof input.access_token === 'string' &&
        !isObj(input.tokens)) {
      return 'cpa';
    }
    // 9) Codex Auth 旧版 · 只有 tokens.{id_token, access_token}，最弱兜底
    if (isObj(input.tokens) && typeof input.tokens.access_token === 'string') {
      return 'codex';
    }
    // 10) 万能兜底：见到 access_token 字符串就当作裸 token
    if (typeof input.access_token === 'string') return 'plain';
    if (typeof input.accessToken === 'string') return 'plain';
    return null;
  }

  // --- 归一化为「待解析账号数组」---
  //     不同格式的"账号"概念不一样：Sub2API 是 accounts[]，其他多数是单对象；
  //     用户也可能直接粘一个数组（如 [auth.json1, auth.json2]）。
  //     统一展开为 [rawAccountObj, ...]，每个 raw 再单独反向解析。
  function expandToAccounts(input, formatId) {
    if (Array.isArray(input)) {
      return input.flatMap(item => expandToAccounts(item, formatId));
    }
    if (formatId === 'sub2api' && isObj(input) && Array.isArray(input.accounts)) {
      return input.accounts.slice();
    }
    return [input];
  }

  // --- 主反向解析器：单个账号 raw → ctx ---
  function reverseAccountToCtx(raw, formatId) {
    // 1) 裸 token / 字符串：直接当 access_token 走 JWT 反挖
    if (typeof raw === 'string') {
      return ctxFromBareToken(raw);
    }
    if (!isObj(raw)) throw new Error('无法识别的账号数据（非对象、非字符串）');

    switch (formatId) {
      case 'session':       return ctxFromSession(raw);
      case 'auth':          return ctxFromAuthJson(raw);
      case 'axonhub':       return ctxFromAuthJson(raw);  // 字段完全同构
      case 'codex':         return ctxFromCodexAuth(raw);
      case 'cpa':           return ctxFromCpa(raw);
      case 'sub2api':       return ctxFromSub2apiAccount(raw);
      case 'cockpit':       return ctxFromCockpit(raw);
      case '9router':       return ctxFrom9router(raw);
      case 'codex-manager': return ctxFromCodexManager(raw);
      case 'plain':         return ctxFromBareToken(
                              firstStr(raw.access_token, raw.accessToken, raw.token) || ''
                            );
      default:              throw new Error('未知导入格式：' + formatId);
    }
  }

  // --- 各分支反向解析器 ---
  //  共享原则：能从 JWT payload 挖到的就挖；JSON 显式字段优先于 JWT 挖出来的；
  //           凡是 undefined 的字段交给后续 buildPayload 自己兜底（脚本里已有完善逻辑）。

  function ctxFromSession(s) {
    // 原始 session 直接走现有 buildContext，最稳
    return buildContext(s);
  }

  function ctxFromAuthJson(o) {
    const t = isObj(o.tokens) ? o.tokens : {};
    const access = String(t.access_token || '').trim();
    if (!access) throw new Error('auth.json/AxonHub 缺少 tokens.access_token');
    const harvested = harvestFromJwt(access);
    const idToken = firstStr(t.id_token);
    return finalizeCtx({
      accessToken: access,
      sessionToken: firstStr(t.refresh_token),  // Codex CLI 把 refresh_token 当 session_token 写
      refreshToken: firstStr(t.refresh_token),
      accountId: firstStr(t.account_id, harvested.accountId),
      chatgptAccountId: firstStr(t.account_id, harvested.accountId),
      email: harvested.email,
      userId: harvested.userId,
      planType: harvested.planType,
      expiresAt: harvested.expiresAtIso,
      idTokenInput: idToken,
    });
  }

  function ctxFromCodexAuth(o) {
    const t = isObj(o.tokens) ? o.tokens : {};
    const access = String(t.access_token || '').trim();
    if (!access) throw new Error('Codex Auth 缺少 tokens.access_token');
    const harvested = harvestFromJwt(access);
    // 旧 Codex Auth 的 id_token 是脚本重组的，profile 部分可能有 email
    const idHarv = harvestFromJwt(t.id_token);
    return finalizeCtx({
      accessToken: access,
      accountId: firstStr(harvested.accountId, idHarv.accountId),
      email: firstStr(idHarv.email, harvested.email),
      userId: firstStr(harvested.userId, idHarv.userId),
      planType: firstStr(harvested.planType, idHarv.planType),
      expiresAt: harvested.expiresAtIso,
      idTokenInput: t.id_token,
    });
  }

  function ctxFromCpa(o) {
    const access = String(o.access_token || '').trim();
    if (!access) throw new Error('CPA 缺少 access_token');
    const harvested = harvestFromJwt(access);
    return finalizeCtx({
      accessToken: access,
      sessionToken: firstStr(o.session_token, o.refresh_token),
      refreshToken: firstStr(o.refresh_token),
      accountId: firstStr(o.account_id, o.chatgpt_account_id, harvested.accountId),
      chatgptAccountId: firstStr(o.chatgpt_account_id, o.account_id, harvested.accountId),
      email: firstStr(o.email, harvested.email),
      userId: firstStr(o.chatgpt_user_id, o.user_id, harvested.userId),
      planType: firstStr(o.plan_type, o.chatgpt_plan_type, harvested.planType),
      expiresAt: firstStr(normalizeTs(o.expired), normalizeTs(o.expires_at), harvested.expiresAtIso),
      idTokenInput: firstStr(o.id_token),
      displayName: firstStr(o.name, o.email),
    });
  }

  function ctxFromSub2apiAccount(item) {
    // item 既可能是「整个 sub2api 包」（含 accounts 数组）也可能是「单条 account」
    if (Array.isArray(item.accounts) && item.accounts.length > 0) {
      // 整个包：取第一条（多账号场景由 expandToAccounts 在外层展开过了）
      return ctxFromSub2apiAccount(item.accounts[0]);
    }
    const cred = isObj(item.credentials) ? item.credentials : {};
    const extra = isObj(item.extra) ? item.extra : {};
    const access = String(cred.access_token || '').trim();
    if (!access) throw new Error('Sub2API 账号缺少 credentials.access_token');
    const harvested = harvestFromJwt(access);
    return finalizeCtx({
      accessToken: access,
      sessionToken: firstStr(cred.session_token, cred.refresh_token),
      refreshToken: firstStr(cred.refresh_token),
      accountId: firstStr(cred.chatgpt_account_id, cred.account_id, harvested.accountId),
      chatgptAccountId: firstStr(cred.chatgpt_account_id, cred.account_id, harvested.accountId),
      email: firstStr(cred.email, extra.email, item.name, harvested.email),
      userId: firstStr(cred.chatgpt_user_id, cred.user_id, harvested.userId),
      planType: firstStr(cred.plan_type, cred.chatgpt_plan_type, harvested.planType),
      expiresAt: firstStr(
        tsFromUnix(cred.expires_at),  // Sub2API 用 unix 秒
        normalizeTs(cred.expires_at),
        harvested.expiresAtIso
      ),
      idTokenInput: firstStr(cred.id_token),
      displayName: firstStr(item.name, extra.name, cred.email),
    });
  }

  function ctxFromCockpit(o) {
    const t = isObj(o.tokens) ? o.tokens : {};
    const access = String(t.access_token || '').trim();
    if (!access) throw new Error('Cockpit 缺少 tokens.access_token');
    const harvested = harvestFromJwt(access);
    return finalizeCtx({
      accessToken: access,
      sessionToken: firstStr(t.refresh_token),
      refreshToken: firstStr(t.refresh_token),
      accountId: firstStr(o.account_id, harvested.accountId),
      chatgptAccountId: firstStr(o.account_id, harvested.accountId),
      email: firstStr(o.email, harvested.email),
      userId: harvested.userId,
      planType: harvested.planType,
      expiresAt: firstStr(normalizeTs(o.expired), harvested.expiresAtIso),
      idTokenInput: firstStr(t.id_token),
    });
  }

  function ctxFrom9router(o) {
    const access = String(o.accessToken || '').trim();
    if (!access) throw new Error('9router 缺少 accessToken');
    const harvested = harvestFromJwt(access);
    const psd = isObj(o.providerSpecificData) ? o.providerSpecificData : {};
    return finalizeCtx({
      accessToken: access,
      refreshToken: firstStr(o.refreshToken),
      sessionToken: firstStr(o.refreshToken),
      accountId: firstStr(psd.chatgptAccountId, o.id, harvested.accountId),
      chatgptAccountId: firstStr(psd.chatgptAccountId, o.id, harvested.accountId),
      email: firstStr(o.email, harvested.email),
      userId: harvested.userId,
      planType: firstStr(psd.chatgptPlanType, harvested.planType),
      expiresAt: firstStr(normalizeTs(o.expiresAt), harvested.expiresAtIso),
      displayName: firstStr(o.name, o.email),
    });
  }

  function ctxFromCodexManager(o) {
    const t = isObj(o.tokens) ? o.tokens : {};
    const meta = isObj(o.meta) ? o.meta : {};
    const access = String(t.access_token || '').trim();
    if (!access) throw new Error('Codex-Manager 缺少 tokens.access_token');
    const harvested = harvestFromJwt(access);
    return finalizeCtx({
      accessToken: access,
      refreshToken: firstStr(t.refresh_token),
      sessionToken: firstStr(t.refresh_token),
      accountId: firstStr(t.account_id, t.chatgpt_account_id, harvested.accountId),
      chatgptAccountId: firstStr(t.chatgpt_account_id, meta.chatgpt_account_id, t.account_id, harvested.accountId),
      workspaceId: firstStr(meta.workspace_id),
      email: firstStr(harvested.email, meta.label),
      userId: harvested.userId,
      planType: harvested.planType,
      expiresAt: harvested.expiresAtIso,
      idTokenInput: firstStr(t.id_token),
      displayName: firstStr(meta.label, harvested.email),
    });
  }

  function ctxFromBareToken(access) {
    if (typeof access !== 'string' || access.split('.').length < 3) {
      throw new Error('裸 Token 必须是有效的 JWT（3 段以点号分隔）');
    }
    const harvested = harvestFromJwt(access);
    if (!harvested.accountId && !harvested.email) {
      throw new Error('JWT payload 里没有 chatgpt_account_id / email，无法识别账号身份');
    }
    return finalizeCtx({
      accessToken: access,
      accountId: harvested.accountId,
      chatgptAccountId: harvested.accountId,
      email: harvested.email,
      userId: harvested.userId,
      planType: harvested.planType,
      expiresAt: harvested.expiresAtIso,
    });
  }

  // --- finalizeCtx · 把各分支返回的字段补齐成完整的 ctx ---
  //     与 buildContext() 输出结构对齐，确保后续 buildPayload 无差别复用。
  function finalizeCtx(partial) {
    const now = new Date();
    const accessToken = partial.accessToken;
    const accessPayload = safeJwtPayload(accessToken);
    const accessTokenExpiresAt = unixSecsFromJwtExp(accessPayload && accessPayload.exp);

    // 合成 id_token：原始 id_token 缺失时，按账号 id 兜底合成（与 buildContext 同款逻辑）
    let synthetic;
    const idTokenInput = partial.idTokenInput;
    if (!idTokenInput && partial.accountId) {
      const ns = epochSecs(now);
      const ex = epochSecs(partial.expiresAt) || ns + 90 * 86400;
      const info = { chatgpt_account_id: partial.accountId };
      if (partial.planType) info.chatgpt_plan_type = partial.planType;
      if (partial.userId) { info.chatgpt_user_id = partial.userId; info.user_id = partial.userId; }
      const p = { iat: ns, exp: ex, 'https://api.openai.com/auth': info };
      if (partial.email) p.email = partial.email;
      synthetic = b64UrlJson({ alg: 'none', typ: 'JWT', cpa_synthetic: true }) + '.' + b64UrlJson(p) + '.synthetic';
    }
    const codexIdToken = firstStr(idTokenInput, synthetic, accessToken);

    return {
      accessToken,
      sessionToken: partial.sessionToken || undefined,
      accountId: partial.accountId,
      chatgptAccountId: partial.chatgptAccountId || partial.accountId,
      workspaceId: partial.workspaceId,
      email: partial.email,
      userId: partial.userId,
      planType: partial.planType,
      expiresAt: partial.expiresAt,
      accessTokenExpiresAt,
      exportedAt: now.toISOString(),
      now,
      refreshToken: partial.refreshToken,
      idTokenInput,
      codexIdToken,
      codexSynthetic: Boolean(synthetic),
      displayName: firstStr(partial.displayName, partial.email, partial.accountId, 'ChatGPT Account'),
    };
  }

  // --- ctx → 虚拟 session ---
  //     buildAuth / buildCodex / raw-session 三个出口需要 session 形参，
  //     从导入路径来的 ctx 没有原 session，所以这里反向重建一份等价的：
  //     用 ctx 字段把 session 的 user / account / 顶层字段都填好，
  //     这样三个依赖 session 的出口都能正常工作。
  function ctxToVirtualSession(ctx) {
    const access = ctx.accessToken;
    const p = safeJwtPayload(access);
    const prof = isObj(p['https://api.openai.com/profile']) ? p['https://api.openai.com/profile'] : {};
    return {
      accessToken: access,
      sessionToken: ctx.sessionToken,
      idToken: ctx.idTokenInput,
      refreshToken: ctx.refreshToken,
      expires: ctx.expiresAt,
      expiresAt: ctx.expiresAt,
      chatgptAccountId: ctx.chatgptAccountId,
      user: {
        email: ctx.email,
        name: ctx.displayName,
        id: ctx.userId,
        iat: Number.isFinite(Number(p.iat)) ? Number(p.iat) : undefined,
        email_verified: prof.email_verified === true,
      },
      account: {
        id: ctx.accountId,
        planType: ctx.planType,
        workspaceId: ctx.workspaceId,
      },
    };
  }

  // --- 从 ctx 构造 9 种导出（与 buildAllExports 等价，但跳过 fetch） ---
  function buildAllExportsFromCtx(ctx) {
    const vsession = ctxToVirtualSession(ctx);
    const out = {};
    for (const t of EXPORT_TARGETS) {
      try {
        const p = buildPayload(t.id, vsession, ctx);
        out[t.id] = { id: t.id, label: t.label, desc: t.desc, filename: downloadName(t.id, ctx.email), text: typeof p === 'string' ? p : JSON.stringify(p, null, 2) };
      } catch (e) {
        out[t.id] = { id: t.id, label: t.label, desc: t.desc, filename: downloadName(t.id, ctx.email), text: '', error: e.message || String(e) };
      }
    }
    return out;
  }

  // --- 顶层入口：parseImportInput(text, hint) ---
  //     输入用户粘贴的原始文本 + 可选的格式提示（'auto' 或具体 id）
  //     返回 { detectedId, formatId, accounts: [{ctx, label, error?, exports}], summary }
  function parseImportInput(text, hint) {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('请粘贴 JSON 文本或上传 JSON 文件');

    // 容错 1：text 可能是一段以单引号或裸 token 形式给的字符串
    let parsed;
    if (trimmed.split('.').length >= 3 && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      // 看起来就是一个 JWT，直接当裸 token 走
      parsed = trimmed;
    } else {
      try {
        parsed = JSON.parse(trimmed);
      } catch (e) {
        throw new Error('无法解析输入：既不是 JSON，也不像 JWT — ' + (e.message || ''));
      }
    }

    const detectedId = detectFormat(parsed);
    const formatId = (hint && hint !== 'auto') ? hint : detectedId;
    if (!formatId) {
      throw new Error('无法自动识别格式，请从「来源格式」下拉手动指定');
    }

    const rawAccounts = expandToAccounts(parsed, formatId);
    if (rawAccounts.length === 0) {
      throw new Error('解析后未发现任何账号数据');
    }

    const accounts = rawAccounts.map((raw, idx) => {
      try {
        const ctx = reverseAccountToCtx(raw, formatId);
        const exports = buildAllExportsFromCtx(ctx);
        return {
          idx,
          label: ctx.displayName || ('#' + (idx + 1)),
          email: ctx.email,
          ctx, exports,
        };
      } catch (e) {
        return { idx, label: '#' + (idx + 1) + ' · 解析失败', error: e.message || String(e) };
      }
    });

    return {
      detectedId,
      formatId,
      accounts,
      summary: {
        total: accounts.length,
        ok: accounts.filter(a => !a.error).length,
        failed: accounts.filter(a => a.error).length,
      },
    };
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

  // ─── 自定义 token 清洗 ────────────────────────────────────────
  //   用户可能粘贴的形式：
  //     1) 纯 JWT 字符串 "eyJ...xxx.yyy.zzz"
  //     2) 带前缀 "Bearer eyJ..."（从 curl/Authorization header 复制来的）
  //     3) 整段 session JSON 含 {"accessToken": "eyJ..."}
  //     4) 整段 auth.json/CPA 等格式 JSON（含 access_token 字段）
  //   全部归一化为纯 JWT 字符串。
  function normalizeCustomToken(raw) {
    if (!raw) return '';
    let t = String(raw).trim();
    if (!t) return '';
    // 形式 3 / 4：JSON
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      try {
        const obj = JSON.parse(t);
        const dig = function(o) {
          if (!o || typeof o !== 'object') return null;
          // 常见字段名
          const keys = ['accessToken', 'access_token', 'AccessToken'];
          for (const k of keys) {
            if (typeof o[k] === 'string' && o[k].split('.').length >= 3) return o[k];
          }
          // 嵌套：tokens.access_token / credentials.access_token / accounts[0].credentials.access_token
          if (o.tokens) { const r = dig(o.tokens); if (r) return r; }
          if (o.credentials) { const r = dig(o.credentials); if (r) return r; }
          if (Array.isArray(o.accounts) && o.accounts[0]) { const r = dig(o.accounts[0]); if (r) return r; }
          return null;
        };
        const found = dig(obj);
        if (found) return found;
        throw new Error('JSON 中没找到 accessToken / access_token 字段');
      } catch (e) {
        throw new Error('看起来是 JSON 但无法解析：' + (e.message || e));
      }
    }
    // 形式 2：去 Bearer 前缀
    t = t.replace(/^Bearer\s+/i, '').trim();
    // 形式 1：校验 JWT 形态
    if (t.split('.').length < 3) {
      throw new Error('Token 格式不对，应该是三段以点号分隔的 JWT 字符串');
    }
    return t;
  }

  // ─── 统一 token 入口 ───────────────────────────────────────────
  //   按 state.plus.tokenSource 决定从当前 session 取还是用自定义。
  //   Plus / Team 调用链都从这里拿 token，外部 token 与本地 token 等价。
  async function resolveAccessToken() {
    if (state.plus.tokenSource === 'custom') {
      const raw = state.plus.customToken;
      if (!raw || !raw.trim()) {
        throw new Error('已选「自定义 Token」模式，请先在 Plus Tab 粘贴 access_token');
      }
      return normalizeCustomToken(raw);
    }
    return getAccessToken();
  }
  // ════════════════════════════════════════════════════════════════
  //  Plus / Team 支付链接生成 — v2.4.0 长链引擎（Stripe init 三步法）
  // ════════════════════════════════════════════════════════════════
  //  用户反馈：旧版本 PayPal 长链支付完成后，PayPal 把用户「送回商家」
  //          时跳到了 PayPal 的注册新账号页（而不是 ChatGPT）—— 订阅
  //          因此无法 finalize，付了钱没用。
  //
  //  根因：旧版本用 checkout_ui_mode='hosted'，OpenAI 返回的是
  //        pay.openai.com/c/pay/cs_xxx —— 这是 Stripe 域内的页面，
  //        Stripe 写给 PayPal 的 return_url 是它自己的兜底页面；
  //        当 Stripe session 已被消耗，return_url 解析崩了，PayPal
  //        fallback 到「注册新账号」页。
  //
  //  修复：改用 checkout_ui_mode='custom'，OpenAI 返回
  //        chatgpt.com/checkout/{merchant_path}/{session_id} —— 整个
  //        支付页面在 chatgpt.com 域内，PayPal 的 return_url 由
  //        ChatGPT 后端直接写为 chatgpt.com 域内地址，回调链路天然闭环。
  //
  //  权威参考：QLHazyCoder/FlowPilot（⭐4442 · 2026-05-25 更新）+
  //           其 docs/使用教程 里贴出的 ChatGPT 网页内置 Plus 升级弹窗
  //           原生请求体。逐字段对齐。
  //
  //  请求体字段（仅这几个，多一个少一个都可能出问题）：
  //    · plan_name          : 'chatgptplusplan' / 'chatgptteamplan'
  //    · checkout_ui_mode   : 'hosted'
  //    · billing_details    : { country, currency }
  //    · cancel_url         : 'https://chatgpt.com/#pricing'
  //    · team_plan_data     : { workspace_name, price_interval, seat_quantity } (仅 Team)
  //
  //  字段黑名单（不能加，会污染默认行为）：
  //    · success_url                ← 让 ChatGPT 后端自己决定
  //    · entry_point / promo_campaign ← 会导致 Stripe session 异常，长链打不开
  //    · locale                     ← 跟随浏览器
  //    · check_card_proxy           ← 旧 API 字段，已过时
  //
  //  processor_entity 字段（响应里）的取值，决定支付商家主体：
  //    · 'openai_ie'  → 爱尔兰主体（欧元区 + GB + 多数欧亚国家）
  //    · 'openai_llc' → 美国 LLC（US + ID + 部分新兴市场）
  // ════════════════════════════════════════════════════════════════

  // ─── checkout 响应 → 用户可用 URL ──────────────────────────────
  //  custom 模式（v2.3.4 主路径）：
  //    chatgpt.com/checkout/{merchant_path}/{checkout_session_id}
  //    PayPal return_url 由 ChatGPT 后端写为 chatgpt.com 域内地址，
  //    回调正常、订阅 finalize 闭环。
  //
  //  hosted 模式（兜底，不推荐 —— 用户反馈过 PayPal 跳注册页）：
  //    pay.openai.com/c/pay/{sid}#{fragment from client_secret}
  //    PayPal return_url 由 Stripe 兜底决定，存在跳到 PP 注册页风险。
  // ───────────────────────────────────────────────────────────────

  const CANCEL_URL = 'https://chatgpt.com/#pricing';

  // merchant_path 推断：按 billing country 选 OpenAI 子实体
  //   openai_ie  → 爱尔兰主体 · 欧元区 / 英国 / 多数欧亚国家
  //   openai_llc → 美国 LLC · US / 印尼 / 部分新兴市场
  function inferMerchantPath(country) {
    const c = String(country || '').toUpperCase();
    const ieCountries = ['DE','FR','IT','ES','NL','BE','AT','PT','IE','LU','FI','GR','CY','EE','LV','LT','MT','SK','SI','GB'];
    if (ieCountries.indexOf(c) >= 0) return 'openai_ie';
    return 'openai_llc';
  }

  // 从 client_secret 拆 fragment（仅 hosted 模式兜底用）
  function fragmentFromClientSecret(clientSecret, sessionId) {
    if (!clientSecret || !sessionId) return '';
    const marker = sessionId + '_secret_';
    const idx = clientSecret.indexOf(marker);
    if (idx < 0) return '';
    const fragEncoded = clientSecret.slice(idx + marker.length);
    return fragEncoded ? '#' + fragEncoded : '';
  }

  // 兜底：响应没给 checkout_session_id 时从 url 字段里 regex 提取
  //   覆盖 cs_live_xxx / cs_test_xxx 两种 Stripe session id 格式
  function extractSessionIdFromAnyUrl(data) {
    if (!data) return '';
    const candidates = [data.checkout_url, data.url, data.openai_checkout_url];
    for (const u of candidates) {
      if (typeof u !== 'string' || !u) continue;
      const m = u.match(/(cs_(?:live|test)_[A-Za-z0-9]+)/);
      if (m) return m[1];
    }
    return '';
  }

  // 兜底：响应没给 processor_entity 时从 url 提取 /checkout/{entity}/cs_xxx
  function extractEntityFromAnyUrl(data) {
    if (!data) return '';
    const candidates = [data.checkout_url, data.url, data.openai_checkout_url];
    for (const u of candidates) {
      if (typeof u !== 'string' || !u) continue;
      const m = u.match(/\/checkout\/([^/]+)\/cs_(?:live|test)_/);
      if (m) return m[1];
    }
    return '';
  }

  // custom 模式专用 URL 拼接（v2.3.4 强化兜底）
  //   主路径：data.checkout_session_id + data.processor_entity 直接拼
  //   兜底 1：从 data.url / data.checkout_url 用 regex 提 cs_id / entity
  //   兜底 2：entity 仍缺时按 country 推断
  //   兜底 3：仍缺 entity 时退到不带 merchant_path 的最短形式
  function buildCustomCheckoutUrl(data, country) {
    if (!data) return '';
    const sid = (data.checkout_session_id || '').trim() || extractSessionIdFromAnyUrl(data);
    if (!sid) return '';
    const entity = (data.processor_entity || '').trim()
      || extractEntityFromAnyUrl(data)
      || inferMerchantPath(country);
    if (entity) return 'https://chatgpt.com/checkout/' + entity + '/' + sid;
    return 'https://chatgpt.com/checkout/' + sid;
  }

  // ─── 从 hosted 响应同时构造内外两种链接 ────────────────────────
  //   external: pay.openai.com/c/pay/{sid}#fid=xxx —— Stripe 长链
  //     · standalone 不依赖 ChatGPT session
  //     · 可以在指纹浏览器 / 美国 IP / 任意干净环境打开
  //     · 用户主要使用场景（薅 PayPal 试用、给别人付款）
  //   internal: chatgpt.com/checkout/openai_ie/{sid} —— wrapper 短链
  //     · 必须在当前账号当前浏览器打开（session cookie 自动认证）
  //     · 备选：当前账号自己付时用
  function buildBothCheckoutUrls(data, country) {
    if (!data) return { external: '', internal: '' };
    const sid = (data.checkout_session_id || '').trim() || extractSessionIdFromAnyUrl(data);
    // 外部链接：优先用响应直接给的 data.url（hosted 模式必有），缺时从 client_secret 拼
    let external = (typeof data.url === 'string' && data.url) ? data.url : '';
    if (!external && sid) {
      const frag = fragmentFromClientSecret(data.client_secret, sid);
      if (frag) external = 'https://pay.openai.com/c/pay/' + sid + frag;
    }
    // 内部链接：基于 session_id 拼 chatgpt.com wrapper
    const entity = (data.processor_entity || '').trim()
      || extractEntityFromAnyUrl(data)
      || inferMerchantPath(country);
    const internal = sid
      ? (entity ? 'https://chatgpt.com/checkout/' + entity + '/' + sid : 'https://chatgpt.com/checkout/' + sid)
      : '';
    return { external: external, internal: internal };
  }

  async function generatePlusLink(profile) {
    const token = await resolveAccessToken();
    // hosted 模式：响应直接给 pay.openai.com/c/pay/cs_xxx#fid=xxx 完整长链。
    // 同一个 checkout_session_id 也能拼出 chatgpt.com 内部 wrapper。
    const data = await postCheckout({
      plan_name: 'chatgptplusplan',
      checkout_ui_mode: 'hosted',
      billing_details: { country: profile.country, currency: profile.currency },
      cancel_url: CANCEL_URL,
    }, token, buildAcceptLanguage(profile.locale));
    const urls = await buildLongLinkUrls(data, profile.country, profile.locale);
    if (!urls.external && !urls.internal) {
      throw new Error('响应里没有有效的链接。响应字段：' + Object.keys(data || {}).join(','));
    }
    return urls;  // { external, internal }
  }
  async function generateTeamLink(opts) {
    const token = await resolveAccessToken();
    const country = opts.country || 'US';
    const body = {
      plan_name: 'chatgptteamplan',
      checkout_ui_mode: 'hosted',
      billing_details: { country: country, currency: opts.currency || 'USD' },
      cancel_url: CANCEL_URL,
      team_plan_data: {
        workspace_name: opts.workspaceName || '我的工作区',
        price_interval: opts.interval === 'year' ? 'year' : 'month',
        seat_quantity: Number(opts.seats) || 2,
      },
    };
    if (opts.promoCode && opts.promoCode.trim()) body.promo_code = opts.promoCode.trim();
    const data = await postCheckout(body, token);
    const urls = await buildLongLinkUrls(data, country, opts.locale);
    if (!urls.external && !urls.internal) {
      throw new Error('响应里没有有效的链接。响应字段：' + Object.keys(data || {}).join(','));
    }
    // 历史 API 形态：openai / stripe 双键 + v2.3.4 新增 external / internal
    //   openai = 外部 Stripe 长链 (pay.openai.com)
    //   stripe = pay.openai.com 替换为 checkout.stripe.com 的镜像形式
    //   external = pay.openai.com（同 openai）
    //   internal = chatgpt.com wrapper（仅当前账号当前浏览器可用）
    const ext = urls.external || urls.internal;
    return {
      openai: ext,
      stripe: urls.stripe || (ext && ext.indexOf('pay.openai.com') >= 0 ? ext.replace('pay.openai.com', 'checkout.stripe.com') : ext),
      external: urls.external,
      internal: urls.internal,
    };
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

  // 得意黑字体 @font-face：从原本"页面加载即注入"改为"首次打开 modal 才懒注入"。
  // 否则即使 font-display: swap 不阻塞首帧渲染，浏览器也会立即从 jsDelivr CDN 拉 ~1MB woff2，
  // 占用 chatgpt.com 的网络连接池，让 ChatGPT 自己的 API 请求排队。
  const FONT_CSS = [
    '@font-face {',
    '  font-family: "Smiley Sans CKNB";',
    '  font-style: italic;',
    '  font-weight: 400 900;',
    '  font-display: swap;',
    '  src: url("https://cdn.jsdelivr.net/gh/atelier-anchor/smiley-sans@v2.0.0/dist/SmileySans-Oblique.woff2") format("woff2");',
    '}',
  ].join('\n');
  let fontInjected = false;
  function ensureFont() {
    if (fontInjected || document.getElementById(NS + '-font')) { fontInjected = true; return; }
    fontInjected = true;
    const el = document.createElement('style');
    el.id = NS + '-font';
    el.textContent = FONT_CSS;
    document.head.appendChild(el);
  }

  // CSS · 明亮 SaaS 风格（hvoy.ai 启发 · 得意黑做大标题 · 警告橙做信号）
  const CSS = [
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
    '#' + NS + '-modal .hd-actions { display: flex; gap: 8px; align-items: center; }',
    '#' + NS + '-modal .hd-actions .btn.sm { height: 36px; padding: 0 12px; font-size: 12px; font-weight: 600; }',
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
    '#' + NS + '-modal .region:hover:not(:disabled) { border-color: #ff5722; background: #fef4f1; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(255,87,34,.12); }',
    '#' + NS + '-modal .region:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }',
    '#' + NS + '-modal .region-code { font-size: 11px; letter-spacing: 0.1em; color: #aaa5a0; font-family: ui-monospace, "SF Mono", Consolas, monospace; font-weight: 600; }',
    '#' + NS + '-modal .region-label { font-size: 18px; color: #1a1614; font-family: "Smiley Sans CKNB", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif; font-style: italic; font-weight: 700; letter-spacing: -0.005em; }',
    '#' + NS + '-modal .region-meta { font-size: 11px; color: #6b6660; }',

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

    /* ─── 教程横幅 ─── */
    '#' + NS + '-modal .tutor { background: linear-gradient(180deg, #fffbf5 0%, #ffffff 100%); border: 1px solid #ffd9c4; border-radius: 10px; padding: 14px 16px; margin-bottom: 18px; }',
    '#' + NS + '-modal .tutor-hd { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; }',
    '#' + NS + '-modal .tutor-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #ff5722; color: #ffffff; border-radius: 8px; }',
    '#' + NS + '-modal .tutor-icon .ic { width: 18px; height: 18px; }',
    '#' + NS + '-modal .tutor-body { min-width: 0; }',
    '#' + NS + '-modal .tutor-title { font-size: 15px; font-weight: 700; color: #1a1614; margin-bottom: 2px; font-family: "Smiley Sans CKNB", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif; font-style: italic; }',
    '#' + NS + '-modal .tutor-sub { font-size: 12px; color: #6b6660; line-height: 1.45; }',
    '#' + NS + '-modal .tutor-detail { margin-top: 14px; padding-top: 14px; border-top: 1px dashed #ffd9c4; }',
    '#' + NS + '-modal .tutor-detail[hidden] { display: none; }',

    /* 警告区 */
    '#' + NS + '-modal .tutor-warn { padding: 12px 14px; background: #fff8f3; border: 1px solid #ffd9c4; border-left: 3px solid #ff5722; border-radius: 6px; margin-bottom: 16px; }',
    '#' + NS + '-modal .tutor-warn-title { font-size: 12px; font-weight: 700; color: #ff5722; letter-spacing: 0.04em; margin-bottom: 8px; }',
    '#' + NS + '-modal .tutor-warn-list { list-style: none; padding: 0; margin: 0; }',
    '#' + NS + '-modal .tutor-warn-list li { font-size: 12px; color: #1a1614; padding: 3px 0 3px 16px; position: relative; line-height: 1.5; }',
    '#' + NS + '-modal .tutor-warn-list li::before { content: "▸"; color: #ff5722; position: absolute; left: 0; font-size: 10px; top: 5px; }',
    '#' + NS + '-modal .tutor-warn-list b { color: #1a1614; font-weight: 700; }',

    /* 步骤 */
    '#' + NS + '-modal .tutor-steps { display: flex; flex-direction: column; gap: 0; margin-bottom: 18px; }',
    '#' + NS + '-modal .tutor-step { display: grid; grid-template-columns: 40px 1fr; gap: 14px; padding: 12px 0; border-bottom: 1px dashed #f0eeea; }',
    '#' + NS + '-modal .tutor-step:last-child { border-bottom: 0; }',
    '#' + NS + '-modal .tutor-step-num { font: 700 18px/1 "Smiley Sans CKNB", "PingFang SC", system-ui, sans-serif; font-style: italic; color: #ff5722; padding-top: 1px; }',
    '#' + NS + '-modal .tutor-step-text { min-width: 0; }',
    '#' + NS + '-modal .tutor-step-title { font-size: 13px; font-weight: 700; color: #1a1614; margin-bottom: 4px; }',
    '#' + NS + '-modal .tutor-step-desc { font-size: 12px; line-height: 1.55; color: #6b6660; }',
    '#' + NS + '-modal .tutor-step-desc b { color: #1a1614; }',

    /* 章节标题 */
    '#' + NS + '-modal .tutor-section-title { font-size: 12px; font-weight: 700; color: #6b6660; letter-spacing: 0.04em; margin: 16px 0 10px; padding-left: 10px; border-left: 3px solid #ff5722; }',

    /* 地址 */
    '#' + NS + '-modal .tutor-addrs { display: grid; gap: 6px; margin-bottom: 14px; }',
    '#' + NS + '-modal .tutor-addr { display: grid; grid-template-columns: 40px 1fr; gap: 12px; padding: 8px 12px; background: #fafaf8; border: 1px solid #f0eeea; border-radius: 6px; font: 12px/1.4 ui-monospace, "SF Mono", Consolas, monospace; }',
    '#' + NS + '-modal .tutor-addr-state { color: #ff5722; font-weight: 700; }',

    /* 排查 */
    '#' + NS + '-modal .tutor-debugs { display: grid; gap: 8px; margin-bottom: 14px; }',
    '#' + NS + '-modal .tutor-debug { display: grid; grid-template-columns: 200px 1fr; gap: 14px; padding: 10px 12px; background: #fff8f3; border: 1px solid #ffd9c4; border-radius: 6px; font-size: 12px; line-height: 1.55; }',
    '#' + NS + '-modal .tutor-debug-tag { color: #ff5722; font-weight: 700; }',

    /* 教程页脚 */
    '#' + NS + '-modal .tutor-footer { font-size: 11px; color: #aaa5a0; text-align: right; padding-top: 8px; border-top: 1px dashed #f0eeea; }',

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
    '  #' + NS + '-modal .tutor-hd { grid-template-columns: auto 1fr; }',
    '  #' + NS + '-modal .tutor-hd .btn { grid-column: 1 / -1; margin-top: 8px; }',
    '  #' + NS + '-modal .tutor-debug { grid-template-columns: 1fr; }',
    '  #' + NS + '-modal .tutor-step { grid-template-columns: 32px 1fr; gap: 10px; }',
    '  #' + NS + '-modal .imp-toolbar { grid-template-columns: 1fr; }',
    '}',

    /* ─── 导入 · 转换 Tab 专属样式 ─── */
    '#' + NS + '-modal .imp-toolbar { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }',
    '#' + NS + '-modal .imp-tb-cell { display: flex; flex-direction: column; gap: 6px; }',
    '#' + NS + '-modal .imp-tb-cell label { font-size: 12px; color: #6b6660; letter-spacing: 0.04em; }',
    '#' + NS + '-modal .imp-input {',
    '  width: 100%; min-height: 180px; max-height: 320px; resize: vertical;',
    '  padding: 12px 14px; border: 1px solid #e8e6e0; border-radius: 8px;',
    '  background: #fafaf8; color: #1a1614;',
    '  font: 12px/1.5 ui-monospace, "SF Mono", "JetBrains Mono", Consolas, monospace;',
    '  outline: none; transition: border-color .14s ease-out, background .14s ease-out;',
    '}',
    '#' + NS + '-modal .imp-input:focus { border-color: #ff5722; background: #ffffff; }',
    '#' + NS + '-modal .imp-empty { padding: 28px 16px; text-align: center; color: #aaa5a0; font-size: 13px; background: #fafaf8; border: 1px dashed #e8e6e0; border-radius: 8px; margin-top: 16px; }',
    '#' + NS + '-modal .imp-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; max-height: 120px; overflow-y: auto; }',
    '#' + NS + '-modal .imp-chip {',
    '  display: inline-flex; align-items: center; gap: 8px;',
    '  padding: 6px 12px; background: #ffffff;',
    '  border: 1px solid #e8e6e0; border-radius: 999px;',
    '  font-size: 12px; color: #1a1614; cursor: pointer;',
    '  transition: border-color .14s ease-out, background .14s ease-out, color .14s ease-out;',
    '  max-width: 260px;',
    '}',
    '#' + NS + '-modal .imp-chip:hover { border-color: #ff5722; }',
    '#' + NS + '-modal .imp-chip.selected { background: #ff5722; border-color: #ff5722; color: #ffffff; }',
    '#' + NS + '-modal .imp-chip.err { border-color: #dc2626; color: #dc2626; }',
    '#' + NS + '-modal .imp-chip.err.selected { background: #dc2626; border-color: #dc2626; color: #ffffff; }',
    '#' + NS + '-modal .imp-chip-idx { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 11px; opacity: 0.7; }',
    '#' + NS + '-modal .imp-chip-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '#' + NS + '-modal input[type="file"].ipt { padding: 7px 10px; font-size: 12px; }',

    /* ─── Segmented Control · Token 来源切换 (v2.3.4) ─── */
    '#' + NS + '-modal .seg { display: inline-flex; gap: 0; padding: 3px; background: #fafaf8; border: 1px solid #e8e6e0; border-radius: 8px; margin-bottom: 10px; }',
    '#' + NS + '-modal .seg-item {',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  padding: 7px 14px; border: 0; background: transparent;',
    '  color: #6b6660; font-size: 13px; font-weight: 500; cursor: pointer;',
    '  border-radius: 6px; transition: background .14s ease-out, color .14s ease-out;',
    '}',
    '#' + NS + '-modal .seg-item:hover { color: #1a1614; }',
    '#' + NS + '-modal .seg-item.selected { background: #ffffff; color: #ff5722; box-shadow: 0 1px 3px rgba(20,16,12,.08); }',
    '#' + NS + '-modal .seg-item .ic { width: 14px; height: 14px; }',
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
    if (id === 'auth') return { num: '01', label: t('tab.auth') };
    if (id === 'plus') return { num: '02', label: t('tab.plus') };
    if (id === 'team') return { num: '03', label: t('tab.team') };
    if (id === 'imp')  return { num: '04', label: t('tab.imp') };
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
        '<button class="region" data-plus-region="' + k + '"' + (state.plus.loading ? ' disabled' : '') + '>',
        '  <div class="region-code">' + p.code + ' · ' + p.currency + '</div>',
        '  <div class="region-label">' + escapeHtml(p.label) + '</div>',
        '  <div class="region-meta">' + escapeHtml(p.note || (p.country + ' 区域账单')) + '</div>',
        '</button>',
      ].join('');
    }).join('');
    return [
      // 代充封控提示 · 引导购买成品号（v2.5.1）
      '<div class="tutor">',
      '  <div class="tutor-hd">',
      '    <div class="tutor-icon">' + icon('key', 18) + '</div>',
      '    <div class="tutor-body">',
      '      <div class="tutor-title">' + escapeHtml(t('notice.title')) + '</div>',
      '      <div class="tutor-sub">' + t('notice.sub') + '</div>',
      '    </div>',
      '    <button class="btn sm" data-action="plus-tutorial-toggle" aria-expanded="false">',
      '      <span class="tutor-toggle-text">' + escapeHtml(t('notice.toggleOpen')) + '</span>',
      '    </button>',
      '  </div>',
      '  <div class="tutor-detail" id="' + NS + '-tutor-detail" hidden></div>',
      '</div>',

      // ─── Token 来源切换器（v2.3.4 新增）─────────────────────────
      //   两种模式：① 用当前网页 Session（默认，最方便）
      //            ② 用自定义 access_token（粘贴朋友的 / 别号的 token）
      //   做成 payurl.ark2.cn 那种「外部工具」形态，本地处理零上传。
      '<div class="lbl">Session 来源<span class="hint">默认用当前登录账号 · 也可粘贴别号 session 生成（payurl.ark2.cn 那种用法）</span></div>',
      '<div class="seg">',
      '  <button class="seg-item' + (state.plus.tokenSource === 'session' ? ' selected' : '') + '" data-action="plus-token-source" data-token-source="session">',
      '    ' + icon('shield', 14) + ' <span>当前登录 Session（自动）</span>',
      '  </button>',
      '  <button class="seg-item' + (state.plus.tokenSource === 'custom' ? ' selected' : '') + '" data-action="plus-token-source" data-token-source="custom">',
      '    ' + icon('key', 14) + ' <span>自定义 Session（粘贴）</span>',
      '  </button>',
      '</div>',
      // 自定义 session 输入框：仅 custom 模式显示
      state.plus.tokenSource === 'custom' ? [
        '<textarea class="imp-input" id="' + NS + '-plus-token" spellcheck="false" placeholder="粘贴任意账号的 access_token 或完整 session JSON：&#10;&#10;  · access_token JWT 字符串（eyJ... 三段以点号分隔）&#10;  · 带 Bearer 前缀（自动去掉）&#10;  · 整段 session JSON（自动提取 accessToken 字段）&#10;  · auth.json / Sub2API / CPA / Cockpit 等任意格式（自动从嵌套字段挖）&#10;&#10;脚本会自动识别并清洗，全程本地处理零上报">' + escapeHtml(state.plus.customToken || '') + '</textarea>',
        '<div class="acts" style="margin-top:6px">',
        '  <button class="btn ghost sm" data-action="plus-token-paste" title="从剪贴板读">' + icon('copy', 12) + ' <span>读剪贴板</span></button>',
        '  <button class="btn ghost sm" data-action="plus-token-clear">' + icon('close', 12) + ' <span>清空</span></button>',
        '  <span class="stat" style="margin-left:auto;padding:0">' + (state.plus.customToken ? ('已粘贴 ' + state.plus.customToken.length + ' 字符') : '尚未粘贴 · 切回当前登录或粘贴后再生成') + '</span>',
        '</div>',
      ].join('') : '',

      '<div class="lbl">选择支付区域<span class="hint">' + Object.keys(PLUS_PROFILES).length + ' 个预设 · 点选单个区域生成（一次只生成一条，后链会使前链失效）</span></div>',
      '<div class="regions">' + regions + '</div>',
      // 自定义国家/币种 · 当 OpenAI / Stripe 改了预设国家的 PayPal 映射时，
      // 用户能即时切到任意 ISO-3166 alpha-2 + ISO-4217 三字母币种试错。
      '<div class="lbl" style="margin-top:14px">自定义 country / currency<span class="hint">预设全失效时用这个</span></div>',
      '<div class="grid2">',
      '  <div class="row" style="margin-bottom:0">',
      '    <label>Country（ISO 2 位）</label>',
      '    <input class="ipt" id="' + NS + '-plus-cc" value="' + escapeHtml(state.plus.customCountry) + '" placeholder="如 IT / ES / NL / AT / PT / IE / LU / FI">',
      '  </div>',
      '  <div class="row" style="margin-bottom:0">',
      '    <label>Currency（ISO 3 位）</label>',
      '    <input class="ipt" id="' + NS + '-plus-cu" value="' + escapeHtml(state.plus.customCurrency) + '" placeholder="欧元区填 EUR · 英镑填 GBP">',
      '  </div>',
      '</div>',
      '<div class="acts" style="margin-top:8px">',
      '  <button class="btn primary" data-action="plus-generate-custom" ' + (state.plus.loading ? 'disabled' : '') + '>',
      icon('bolt', 14) + ' <span>用自定义参数生成</span>',
      '  </button>',
      '  <button class="btn ghost" data-action="plus-reset-custom">' + icon('reset', 14) + ' <span>清空</span></button>',
      '</div>',
      '<div class="stat"><b>0 元试用资格 = 你浏览器/代理的出口 IP 是日本</b> · 必须自己挂日本梯子 · country 字段只决定支付页 locale 与默认支付方式 · 欧元区显示 PayPal、日区显示 Konbini、美区偏卡直付。<br><b style="color:#ff5722">OpenAI 会定期调整可用支付方式映射</b>，如某国当下没 PayPal 入口，依次试欧元区其他国家或英国。</div>',
      '<div id="' + NS + '-plus-result" style="margin-top:14px;"></div>',
    ].join('');
  }

  // 代充封控 · 购买成品号说明（v2.5.1 替换旧 PayPal 教程）
  function renderTutorialDetail() {
    return [
      '<div class="tutor-warn">',
      '  <div class="tutor-warn-title">' + escapeHtml(t('notice.detailTitle')) + '</div>',
      '  <div class="tutor-step-desc" style="margin-top:8px;line-height:1.55">' + t('notice.detailP1') + '</div>',
      '</div>',
      '<div class="tutor-section-title" style="margin-top:14px">' + escapeHtml(t('notice.detailTitle2')) + '</div>',
      '<div class="tutor-step-desc" style="line-height:1.55;margin-bottom:10px">' + t('notice.detailP2') + '</div>',
      '<div class="acts" style="margin:8px 0 12px">',
      '  <button class="btn primary sm" data-action="copy-wechat">' + icon('copy', 12) + ' <span>' + escapeHtml(t('notice.copyWx')) + '</span></button>',
      '  <span class="stat" style="margin:0;padding:6px 10px">' + escapeHtml(t('hd.wechat')) + ' <b style="color:#ff5722">' + escapeHtml(CONTACT_WECHAT) + '</b> · 传康KK</span>',
      '</div>',
      '<div class="tutor-section-title">' + escapeHtml(t('notice.detailTitle3')) + '</div>',
      '<div class="tutor-step-desc" style="line-height:1.55">' + t('notice.detailP3') + '</div>',
      '<div class="tutor-footer">' + escapeHtml(t('notice.footer')) + '</div>',
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

  // ──────────────────────────────────────────────────────────
  //  renderImport · 导入 · 转换 Tab UI
  // ──────────────────────────────────────────────────────────
  function renderImport() {
    const imp = state.imp;
    const fmtOptions = IMPORT_FORMATS.map(function(f) {
      const selected = imp.sourceFormat === f.id ? ' selected' : '';
      return '<option value="' + f.id + '"' + selected + '>' + escapeHtml(f.label) + '</option>';
    }).join('');

    // 输入工具区（永远存在）
    const head = [
      '<div class="lbl">来源数据<span class="hint">粘贴 JSON / 拖入文件 / 选择文件 · 自动识别 11 种来源格式</span></div>',
      '<div class="imp-toolbar">',
      '  <div class="imp-tb-cell">',
      '    <label>来源格式</label>',
      '    <select class="ipt" id="' + NS + '-imp-fmt">' + fmtOptions + '</select>',
      '  </div>',
      '  <div class="imp-tb-cell">',
      '    <label>上传文件</label>',
      '    <input class="ipt" type="file" id="' + NS + '-imp-file" accept=".json,.txt,application/json">',
      '  </div>',
      '</div>',
      '<textarea class="imp-input" id="' + NS + '-imp-input" spellcheck="false" placeholder="粘贴你的 JSON 文件内容，或粘贴一个裸 access_token JWT。&#10;&#10;支持自动识别：原始 Session · auth.json · Codex Auth · CPA · Sub2API · Cockpit · 9router · AxonHub · Codex-Manager · 你的 Python 脚本输出格式 · 单条 / 数组 / 嵌套包">' + escapeHtml(imp.rawInput || '') + '</textarea>',
      '<div class="acts">',
      '  <button class="btn primary" data-action="imp-parse" ' + (imp.loading ? 'disabled' : '') + '>',
      (imp.loading ? '<span class="spin"></span> 解析中…' : (icon('bolt', 14) + ' <span>解析并转换</span>')),
      '  </button>',
      '  <button class="btn ghost" data-action="imp-paste" title="从剪贴板粘贴">' + icon('copy', 14) + ' <span>读剪贴板</span></button>',
      '  <button class="btn ghost" data-action="imp-sample" title="载入示例 Sub2API JSON">' + icon('key', 14) + ' <span>填示例</span></button>',
      '  <button class="btn ghost" data-action="imp-clear">' + icon('close', 14) + ' <span>清空</span></button>',
      '</div>',
    ].join('');

    // 还没解析过 → 只显示输入区
    if (!imp.accounts || imp.accounts.length === 0) {
      return head + '<div class="imp-empty"><div class="empty-cap">解析后会在此预览账号信息与 9 种目标格式</div></div>';
    }

    // 已解析 → 渲染账号列表 + 当前账号信息 + 9 种目标格式 + 预览
    const active = imp.accounts[imp.activeIdx] || imp.accounts[0];

    const detectedNote = imp.detectedId
      ? '自动识别为 <b>' + escapeHtml((IMPORT_FORMATS.find(f => f.id === imp.detectedId) || {label: imp.detectedId}).label) + '</b>'
      : '未能自动识别';
    const hintNote = (imp.sourceFormat !== 'auto' && imp.sourceFormat !== imp.detectedId)
      ? ' · 已手动覆盖为 <b>' + escapeHtml((IMPORT_FORMATS.find(f => f.id === imp.sourceFormat) || {label: imp.sourceFormat}).label) + '</b>'
      : '';

    const chips = imp.accounts.map(function(a, i) {
      const sel = i === imp.activeIdx ? ' selected' : '';
      const err = a.error ? ' err' : '';
      const tip = a.error ? a.error : (a.email || a.label);
      const label = a.email || a.label || ('#' + (i + 1));
      return '<button class="imp-chip' + sel + err + '" data-imp-idx="' + i + '" title="' + escapeHtml(tip) + '">' +
             '<span class="imp-chip-idx">#' + (i + 1) + '</span>' +
             '<span class="imp-chip-name">' + escapeHtml(label) + '</span>' +
             '</button>';
    }).join('');

    // 当前账号解析失败 → 只展示错误，不显示格式区
    if (active.error) {
      return [
        head,
        '<div class="lbl">解析结果<span class="hint">共 ' + imp.summary.total + ' · 成功 ' + imp.summary.ok + ' · 失败 ' + imp.summary.failed + ' · ' + detectedNote + hintNote + '</span></div>',
        '<div class="imp-chips">' + chips + '</div>',
        '<div class="stat err">当前账号解析失败：' + escapeHtml(active.error) + '</div>',
      ].join('');
    }

    const exp = active.exports || {};
    const curId = imp.currentTargetId;
    const cur = exp[curId];

    const fmts = EXPORT_TARGETS.map(function(t) {
      const e = exp[t.id];
      const disabled = !e || e.error;
      const pressed = t.id === curId && !disabled;
      const title = disabled ? (e && e.error ? e.error : '不可用') : t.desc;
      return [
        '<button class="fmt" data-imp-target-id="' + t.id + '" aria-pressed="' + pressed + '" ' + (disabled ? 'disabled' : '') + ' title="' + escapeHtml(title) + '">',
        '  <span class="fmt-name">' + escapeHtml(t.label) + '</span>',
        '  <span class="fmt-desc">' + escapeHtml(t.desc || '') + '</span>',
        '</button>',
      ].join('');
    }).join('');

    const meta = cur && !cur.error
      ? '当前文件 <b>' + escapeHtml(cur.filename) + '</b>'
      : (cur && cur.error ? '导出失败：' + escapeHtml(cur.error) : '');

    return [
      head,
      '<div class="lbl">解析结果<span class="hint">共 ' + imp.summary.total + ' · 成功 ' + imp.summary.ok + ' · 失败 ' + imp.summary.failed + ' · ' + detectedNote + hintNote + '</span></div>',
      '<div class="imp-chips">' + chips + '</div>',
      renderSpecimen(active.ctx),
      '<div class="lbl">选择目标导出格式<span class="hint">' + EXPORT_TARGETS.length + ' 种 · 互转矩阵</span></div>',
      '<div class="grid">' + fmts + '</div>',
      '<div class="acts">',
      '  <button class="btn primary" data-action="imp-copy">' + icon('copy', 14) + ' <span>复制当前</span></button>',
      '  <button class="btn" data-action="imp-download">' + icon('download', 14) + ' <span>下载文件</span></button>',
      '  <button class="btn" data-action="imp-download-all">' + icon('archive', 14) + ' <span>打包此账号 9 种</span></button>',
      '  <button class="btn" data-action="imp-batch-download" title="所有账号 × 当前格式 一次性全部下载">' + icon('archive', 14) + ' <span>批量 · 全部账号</span></button>',
      '  <button class="btn ghost" data-action="imp-copy-access-token" title="只复制 access_token 字符串">' + icon('key', 14) + ' <span>仅 Token</span></button>',
      '</div>',
      '<textarea class="out" readonly spellcheck="false">' + escapeHtml((cur && (cur.text || cur.error)) || '') + '</textarea>',
      '<div class="stat' + (cur && cur.error ? ' err' : '') + '">' + meta + '</div>',
    ].join('');
  }

  function renderBody() {
    if (state.activeTab === 'auth') return renderAuth();
    if (state.activeTab === 'plus') return renderPlus();
    if (state.activeTab === 'team') return renderTeam();
    if (state.activeTab === 'imp')  return renderImport();
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
      '      <div class="hd-mark"><span class="dot"></span><span>' + escapeHtml(t('hd.mark')) + '</span></div>',
      '      <h2 class="hd-title" id="' + NS + '-title">' + t('hd.title') + '</h2>',
      '      <div class="hd-meta">',
      '        <span>V' + escapeHtml(VERSION) + '</span>',
      '        <span>·</span>',
      '        <span>' + escapeHtml(t('hd.author')) + ' <b>' + escapeHtml(AUTHOR) + '</b></span>',
      '        <span>·</span>',
      '        <span>' + escapeHtml(t('hd.wechat')) + ' <b>' + escapeHtml(CONTACT_WECHAT) + '</b></span>',
      '      </div>',
      '    </div>',
      '    <div class="hd-actions">',
      '      <button class="btn sm" data-action="toggle-lang" title="' + escapeHtml(t('hd.langTip')) + '" style="min-width:64px">' + escapeHtml(t('hd.lang')) + '</button>',
      '      <button class="hd-close" data-action="close" aria-label="' + escapeHtml(t('hd.close')) + '">' + icon('close', 14) + '</button>',
      '    </div>',
      '  </div>',
      '  <div class="tabs" role="tablist">' + tabBtnHTML('auth') + tabBtnHTML('plus') + tabBtnHTML('team') + tabBtnHTML('imp') + '</div>',
      '  <div class="bd" id="' + NS + '-body"></div>',
      '  <div class="ft">',
      '    <span><b>v' + escapeHtml(VERSION) + ' <span class="sep">·</span> ' + escapeHtml(t('ft.formats')) + ' <span class="sep">·</span> ' + escapeHtml(t('ft.regions')) + '</b></span>',
      '    <span class="kbd-tip"><kbd>⌘ ⇧ K</kbd>  ' + escapeHtml(t('ft.toggle')) + ' &nbsp; <kbd>ESC</kbd>  ' + escapeHtml(t('ft.close')) + '</span>',
      '  </div>',
      '</div>',
    ].join('');
    modal.innerHTML = html;
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
    modal.querySelector('[data-action="close"]').addEventListener('click', function(e) { e.stopPropagation(); closeModal(); });
    const langBtn = modal.querySelector('[data-action="toggle-lang"]');
    if (langBtn) langBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleLang(); });
    modal.querySelectorAll('[data-tab]').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); setTab(b.getAttribute('data-tab')); });
    });
    const body = modal.querySelector('#' + NS + '-body');
    body.addEventListener('click', onBodyClick);
    body.addEventListener('change', onBodyChange);
    body.addEventListener('input', onBodyInput);
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
    if (state.activeTab === 'plus' && state.plus.lastUrl) renderPlusResult(state.plus.lastUrl);
    if (state.activeTab === 'team' && state.team.lastLinks) renderTeamResult(state.team.lastLinks);
    // 导入 Tab 切回时，把已粘贴文本回填到 textarea
    if (state.activeTab === 'imp') {
      const ta = document.getElementById(NS + '-imp-input');
      if (ta && state.imp.rawInput) ta.value = state.imp.rawInput;
    }
  }
  function openModal() {
    ensureFont();  // 首次打开 modal 才懒加载得意黑字体，避免页面加载时占用 chatgpt.com 连接池
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
    const btn = e.target.closest('[data-action], [data-target-id], [data-plus-region], [data-imp-idx], [data-imp-target-id]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const action = btn.getAttribute('data-action');
    const targetId = btn.getAttribute('data-target-id');
    const region = btn.getAttribute('data-plus-region');
    const impIdx = btn.getAttribute('data-imp-idx');
    const impTargetId = btn.getAttribute('data-imp-target-id');
    if (targetId) { state.auth.currentTargetId = targetId; refreshBody(); return; }
    if (region) return onPlusGenerate(region);
    if (impIdx !== null && impIdx !== undefined) {
      const i = Number(impIdx);
      if (Number.isFinite(i) && state.imp.accounts[i]) {
        state.imp.activeIdx = i;
        // 切到失败账号时，把格式选择重置到通用 cockpit；否则按当前格式可用性兜底
        const acc = state.imp.accounts[i];
        if (acc && acc.exports) {
          const curEx = acc.exports[state.imp.currentTargetId];
          if (!curEx || curEx.error) {
            const firstOk = EXPORT_TARGETS.find(t => acc.exports[t.id] && !acc.exports[t.id].error);
            if (firstOk) state.imp.currentTargetId = firstOk.id;
          }
        }
        refreshBody();
      }
      return;
    }
    if (impTargetId) { state.imp.currentTargetId = impTargetId; refreshBody(); return; }
    switch (action) {
      case 'auth-fetch': return onAuthFetch();
      case 'auth-copy': return onAuthCopy();
      case 'auth-copy-access-token': return onAuthCopyAccessToken();
      case 'auth-download': return onAuthDownload();
      case 'auth-download-all': return onAuthDownloadAll();
      case 'plus-generate-custom': return onPlusGenerateCustom();
      case 'plus-reset-custom': return onPlusResetCustom();
      // Token 来源切换 (v2.3.4)
      case 'plus-token-source': return onPlusTokenSource(btn.getAttribute('data-token-source'));
      case 'plus-token-paste': return onPlusTokenPaste();
      case 'plus-token-clear': return onPlusTokenClear();
      case 'plus-tutorial-toggle': return onPlusTutorialToggle(btn);
      case 'copy-wechat': return onCopyWechat();
      case 'team-generate': return onTeamGenerate();
      case 'team-reset': return onTeamReset();
      // 导入 · 转换
      case 'imp-parse': return onImpParse();
      case 'imp-clear': return onImpClear();
      case 'imp-paste': return onImpPasteClipboard();
      case 'imp-sample': return onImpFillSample();
      case 'imp-copy': return onImpCopy();
      case 'imp-copy-access-token': return onImpCopyAccessToken();
      case 'imp-download': return onImpDownload();
      case 'imp-download-all': return onImpDownloadAllFormats();
      case 'imp-batch-download': return onImpBatchAllAccounts();
    }
  }

  // ──────────────────────────────────────────────────────────
  //  导入 · 转换 — 事件处理
  // ──────────────────────────────────────────────────────────
  function onBodyChange(e) {
    const t = e.target;
    if (!t || !t.id) return;
    if (t.id === NS + '-imp-fmt') {
      state.imp.sourceFormat = t.value;
      // 选项改变后，如果已经粘了文本，自动重新解析一次
      if (state.imp.rawInput && !state.imp.loading) onImpParse();
      return;
    }
    if (t.id === NS + '-imp-file') {
      const f = t.files && t.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function() {
        const txt = String(reader.result || '');
        state.imp.rawInput = txt;
        const ta = document.getElementById(NS + '-imp-input');
        if (ta) ta.value = txt;
        toast('已读取文件 ' + f.name + '（' + f.size + ' 字节）', 'success');
        // 文件读完自动解析
        onImpParse();
      };
      reader.onerror = function() { toast('文件读取失败', 'error'); };
      reader.readAsText(f);
      return;
    }
    // Team 计费周期 select（按月/按年）— 也实时持久化（v2.3.4）
    if (t.id === NS + '-team-interval') {
      state.team.form.interval = t.value;
      saveSettings({ teamForm: state.team.form });
      return;
    }
  }
  function onBodyInput(e) {
    if (e.target && e.target.id === NS + '-imp-input') {
      state.imp.rawInput = e.target.value;
    }
    // Plus 自定义 country / currency 输入实时同步并持久化
    if (e.target && e.target.id === NS + '-plus-cc') {
      state.plus.customCountry = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      if (e.target.value !== state.plus.customCountry) e.target.value = state.plus.customCountry;
      saveSettings({ plusCustomCountry: state.plus.customCountry });
    }
    if (e.target && e.target.id === NS + '-plus-cu') {
      state.plus.customCurrency = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      if (e.target.value !== state.plus.customCurrency) e.target.value = state.plus.customCurrency;
      saveSettings({ plusCustomCurrency: state.plus.customCurrency });
    }
    // 自定义 token textarea — 持久化到 localStorage（你的浏览器本地）
    if (e.target && e.target.id === NS + '-plus-token') {
      state.plus.customToken = e.target.value;
      saveSettings({ plusCustomToken: state.plus.customToken });
      // 更新右下角字符计数（不全量 refreshBody 以保留 textarea 焦点）
      const stat = document.querySelector('#' + NS + '-body .acts .stat');
      if (stat) stat.textContent = state.plus.customToken ? ('已粘贴 ' + state.plus.customToken.length + ' 字符 · 已自动保存') : '尚未粘贴';
    }
    // ─── Team 表单字段实时持久化（v2.3.4）─────────────────────────
    //   5 个 input 字段每输入一个字符就同步到 state + saveSettings
    //   不必等用户点「生成 Team 链接」按钮才保存，避免误操作丢失
    if (e.target && e.target.id && e.target.id.indexOf(NS + '-team-') === 0) {
      const teamFieldMap = {
        [NS + '-team-workspace']: 'workspace',
        [NS + '-team-seats']: 'seats',
        [NS + '-team-promo']: 'promo',
        [NS + '-team-country']: 'country',
        [NS + '-team-currency']: 'currency',
      };
      const field = teamFieldMap[e.target.id];
      if (field) {
        state.team.form[field] = e.target.value;
        saveSettings({ teamForm: state.team.form });
      }
    }
  }

  async function onImpParse() {
    if (state.imp.loading) return;
    // 从 DOM 同步最新文本（保险）
    const ta = document.getElementById(NS + '-imp-input');
    if (ta) state.imp.rawInput = ta.value;
    if (!state.imp.rawInput || !state.imp.rawInput.trim()) {
      toast('请先粘贴 JSON 或上传文件', 'error');
      return;
    }
    state.imp.loading = true;
    refreshBody();
    try {
      const r = parseImportInput(state.imp.rawInput, state.imp.sourceFormat);
      state.imp.detectedId = r.detectedId;
      state.imp.accounts = r.accounts;
      state.imp.summary = r.summary;
      state.imp.activeIdx = 0;
      // 当前选中目标若在新账号下不可用，回退第一个可用
      const a0 = r.accounts[0];
      if (a0 && a0.exports) {
        const cur = a0.exports[state.imp.currentTargetId];
        if (!cur || cur.error) {
          const firstOk = EXPORT_TARGETS.find(t => a0.exports[t.id] && !a0.exports[t.id].error);
          if (firstOk) state.imp.currentTargetId = firstOk.id;
        }
      }
      const msg = '解析完成 · ' + r.summary.ok + '/' + r.summary.total + ' 个账号' +
                  (r.summary.failed ? '（' + r.summary.failed + ' 失败）' : '') +
                  (r.detectedId ? ' · 来源 ' + r.detectedId : '');
      toast(msg, r.summary.failed ? 'info' : 'success');
    } catch (e) {
      toast(e.message || String(e), 'error', 5000);
    } finally {
      state.imp.loading = false;
      refreshBody();
    }
  }
  function onImpClear() {
    state.imp.rawInput = '';
    state.imp.accounts = [];
    state.imp.activeIdx = 0;
    state.imp.detectedId = null;
    state.imp.summary = null;
    refreshBody();
    toast('已清空', 'success');
  }
  async function onImpPasteClipboard() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        toast('当前浏览器不支持自动读剪贴板，请手动粘贴到文本框', 'error');
        return;
      }
      const txt = await navigator.clipboard.readText();
      if (!txt) { toast('剪贴板为空', 'error'); return; }
      state.imp.rawInput = txt;
      const ta = document.getElementById(NS + '-imp-input');
      if (ta) ta.value = txt;
      toast('已读取剪贴板内容（' + txt.length + ' 字符）', 'success');
      onImpParse();
    } catch (e) {
      toast('读取剪贴板失败：' + (e.message || e), 'error');
    }
  }
  function onImpFillSample() {
    // 示例使用一个能跑通自动识别的最小 CPA 格式（你提供的 Python 脚本输出格式）
    const sample = {
      type: 'codex',
      id_token: '',
      access_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE5MzQ0ZTY1IiwidHlwIjoiSldUIn0.eyJleHAiOjE5OTk5OTk5OTksImh0dHBzOi8vYXBpLm9wZW5haS5jb20vYXV0aCI6eyJjaGF0Z3B0X2FjY291bnRfaWQiOiJzYW1wbGUtMTIzLTQ1Ni03ODkiLCJjaGF0Z3B0X3BsYW5fdHlwZSI6InBsdXMifSwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS9wcm9maWxlIjp7ImVtYWlsIjoic2FtcGxlQGV4YW1wbGUuY29tIn19.demo',
      account_id: 'sample-123-456-789',
      last_refresh: '2026-05-23T11:08:21.860227Z',
      email: 'sample@example.com',
      expired: '2099-12-31T23:59:59Z',
      credential_mode: 'session_compat',
    };
    const txt = JSON.stringify(sample, null, 2);
    state.imp.rawInput = txt;
    const ta = document.getElementById(NS + '-imp-input');
    if (ta) ta.value = txt;
    toast('已填入示例 · 点「解析并转换」', 'success');
  }
  function impActive() { return state.imp.accounts[state.imp.activeIdx]; }
  async function onImpCopy() {
    const a = impActive(); if (!a || !a.exports) { toast('请先解析数据', 'error'); return; }
    const c = a.exports[state.imp.currentTargetId];
    if (!c || c.error) { toast('当前内容不可用', 'error'); return; }
    try { await copyText(c.text); toast('已复制 ' + c.label, 'success'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }
  async function onImpCopyAccessToken() {
    const a = impActive(); if (!a || !a.ctx || !a.ctx.accessToken) { toast('请先解析数据', 'error'); return; }
    try { await copyText(a.ctx.accessToken); toast('已复制 access_token', 'success'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }
  function onImpDownload() {
    const a = impActive(); if (!a || !a.exports) { toast('请先解析数据', 'error'); return; }
    const c = a.exports[state.imp.currentTargetId];
    if (!c || c.error) { toast('当前内容不可用', 'error'); return; }
    try { downloadText(c.filename, c.text); toast('已下载 ' + c.filename, 'success'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }
  function onImpDownloadAllFormats() {
    const a = impActive(); if (!a || !a.exports) { toast('请先解析数据', 'error'); return; }
    let n = 0, fail = 0;
    EXPORT_TARGETS.forEach(function(t) {
      const e = a.exports[t.id];
      if (!e || e.error) { fail++; return; }
      try { downloadText(e.filename, e.text); n++; }
      catch (err) { fail++; }
    });
    toast('已下载 ' + n + ' 个文件' + (fail ? '（' + fail + ' 个失败）' : ''), fail ? 'info' : 'success');
  }
  function onImpBatchAllAccounts() {
    // 把所有成功解析的账号，按当前选中格式各导出一份
    if (!state.imp.accounts || state.imp.accounts.length === 0) { toast('请先解析数据', 'error'); return; }
    const targetId = state.imp.currentTargetId;
    let n = 0, fail = 0;
    state.imp.accounts.forEach(function(a) {
      if (!a.exports) { fail++; return; }
      const e = a.exports[targetId];
      if (!e || e.error) { fail++; return; }
      try { downloadText(e.filename, e.text); n++; }
      catch (err) { fail++; }
    });
    toast('批量导出 ' + n + ' 个账号' + (fail ? '（' + fail + ' 个失败）' : ''), fail ? 'info' : 'success');
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
  // renderPlusResult · 显示两条链接（v2.3.4）
  //   urls 参数兼容：传字符串（旧）→ 当作 external；传 {external, internal} 对象（新）→ 两条都显示
  function renderPlusResult(urls) {
    const el = document.getElementById(NS + '-plus-result');
    if (!el) return;
    const norm = (typeof urls === 'string') ? { external: urls, internal: '' } : (urls || {});
    const ext = norm.external || '';
    const intl = norm.internal || '';
    const linkBlock = function(label, sub, url, primary, idx) {
      if (!url) return '';
      const safe = escapeHtml(url);
      return [
        '<div class="lbl" style="margin-top:12px">' + escapeHtml(label) + '<span class="hint">' + escapeHtml(sub) + '</span></div>',
        '<a class="url" href="' + safe + '" target="_blank" rel="noopener">' + safe + '</a>',
        '<div class="acts">',
        '  <button class="btn ' + (primary ? 'primary' : '') + '" data-plus-act="copy" data-plus-idx="' + idx + '">' + icon('copy', 14) + ' <span>复制此链接</span></button>',
        '  <button class="btn" data-plus-act="open" data-plus-idx="' + idx + '">' + icon('extOpen', 14) + ' <span>新标签打开</span></button>',
        '</div>',
      ].join('');
    };
    el.innerHTML = [
      // 外部 Stripe 长链 —— 主推（在指纹浏览器 / 美国 IP 干净环境打开）
      linkBlock('① 外部 Stripe 长链', 'pay.openai.com · standalone · 可在指纹浏览器 / 美国 IP 环境打开 · 用户主要场景', ext, true, 0),
      // 内部 ChatGPT wrapper —— 备选（仅当前账号当前浏览器可用）
      linkBlock('② 内部 ChatGPT 短链', 'chatgpt.com · 仅当前登录账号当前浏览器可用 · 备选', intl, false, 1),
      (!ext && !intl) ? '<div class="stat err">未能拿到任何链接</div>' : '',
    ].join('');
    // 事件委托：点 copy/open 时根据 idx 决定用哪条
    el.querySelectorAll('[data-plus-act]').forEach(function(b) {
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        const act = b.getAttribute('data-plus-act');
        const idx = b.getAttribute('data-plus-idx');
        const u = idx === '0' ? ext : intl;
        if (!u) return;
        if (act === 'copy') {
          copyText(u).then(function() { toast('已复制 ' + (idx === '0' ? '外部长链' : '内部短链'), 'success'); })
                     .catch(function(err) { toast(err.message || String(err), 'error'); });
        } else if (act === 'open') {
          window.open(u, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }
  // 生成中禁用区域卡 / 自定义按钮，避免连点产生多条 checkout（旧链会失效）
  function setPlusBusy(busy) {
    state.plus.loading = !!busy;
    try {
      document.querySelectorAll('#' + NS + '-modal [data-plus-region]').forEach(function(b) {
        b.disabled = !!busy;
      });
      const customBtn = document.querySelector('#' + NS + '-modal [data-action="plus-generate-custom"]');
      if (customBtn) customBtn.disabled = !!busy;
    } catch (e) {}
  }
  async function onPlusGenerate(regionKey) {
    const profile = PLUS_PROFILES[regionKey];
    if (!profile) return;
    if (state.plus.loading) return;
    setPlusBusy(true);
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
    } finally {
      setPlusBusy(false);
    }
  }

  // ─── 自定义 country / currency 生成 ───────────────────────────
  //   绕开预设池，让用户在 OpenAI 临时调整某国 PayPal 入口时即时应对。
  async function onPlusGenerateCustom() {
    if (state.plus.loading) return;
    const cc = String(state.plus.customCountry || '').trim().toUpperCase();
    const cu = String(state.plus.customCurrency || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) { toast('Country 需要 2 位字母（如 IT / NL / ES）', 'error'); return; }
    if (!/^[A-Z]{3}$/.test(cu)) { toast('Currency 需要 3 位字母（如 EUR / GBP / USD）', 'error'); return; }
    const profile = {
      label: '自定义 · ' + cc + ' / ' + cu,
      country: cc, currency: cu, code: cc,
      note: '自定义参数',
    };
    setPlusBusy(true);
    const resEl = document.getElementById(NS + '-plus-result');
    if (resEl) resEl.innerHTML = '<div class="stat"><span class="spin" style="color:#ff5722"></span> &nbsp;用 ' + cc + '/' + cu + ' 生成…</div>';
    try {
      const url = await generatePlusLink(profile);
      state.plus.lastUrl = url;
      renderPlusResult(url);
      toast('自定义链接生成成功', 'success');
    } catch (e) {
      if (resEl) resEl.innerHTML = '<div class="stat err">' + escapeHtml(e.message || String(e)) + '</div>';
      toast(e.message || String(e), 'error', 5000);
    } finally {
      setPlusBusy(false);
    }
  }
  function onPlusResetCustom() {
    state.plus.customCountry = '';
    state.plus.customCurrency = '';
    saveSettings({ plusCustomCountry: '', plusCustomCurrency: '' });
    refreshBody();
    toast('已清空自定义参数', 'success');
  }

  // ─── Token 来源切换（v2.3.4）─────────────────────────────────
  //   session → custom：展开粘贴区，用户填 token 后才能生成
  //   custom  → session：折叠粘贴区，回到当前网页 session 流程
  //   切换偏好持久化，textarea 内容也持久化（用户体验优先）
  function onPlusTokenSource(src) {
    if (src !== 'session' && src !== 'custom') return;
    if (state.plus.tokenSource === src) return;
    state.plus.tokenSource = src;
    saveSettings({ plusTokenSource: src });
    refreshBody();
    toast(src === 'custom' ? '已切到自定义 Session 模式' : '已切回当前登录 Session', 'success');
  }
  async function onPlusTokenPaste() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        toast('当前浏览器不支持自动读剪贴板，请手动粘贴到文本框', 'error');
        return;
      }
      const txt = await navigator.clipboard.readText();
      if (!txt) { toast('剪贴板为空', 'error'); return; }
      state.plus.customToken = txt;
      saveSettings({ plusCustomToken: txt });
      const ta = document.getElementById(NS + '-plus-token');
      if (ta) ta.value = txt;
      // 预校验（不阻塞，仅给反馈）
      try {
        const t = normalizeCustomToken(txt);
        toast('已读取并识别 · token 长度 ' + t.length + ' 字符', 'success');
      } catch (e) {
        toast('已粘贴，但格式校验失败：' + (e.message || e), 'info', 4000);
      }
      refreshBody();
    } catch (e) {
      toast('读取剪贴板失败：' + (e.message || e), 'error');
    }
  }
  function onPlusTokenClear() {
    state.plus.customToken = '';
    saveSettings({ plusCustomToken: '' });
    refreshBody();
    toast('已清空自定义 Session', 'success');
  }
  async function onCopyWechat() {
    try {
      await copyText(CONTACT_WECHAT);
      toast(t('notice.copiedWx'), 'success');
    } catch (e) {
      toast(e.message || String(e), 'error');
    }
  }
  function onPlusTutorialToggle(btn) {
    const detail = document.getElementById(NS + '-tutor-detail');
    if (!detail) return;
    const isOpen = !detail.hasAttribute('hidden');
    if (isOpen) {
      detail.setAttribute('hidden', '');
      detail.innerHTML = '';
      btn.setAttribute('aria-expanded', 'false');
      const el = btn.querySelector('.tutor-toggle-text');
      if (el) el.textContent = t('notice.toggleOpen');
    } else {
      detail.innerHTML = renderTutorialDetail();
      detail.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      const el = btn.querySelector('.tutor-toggle-text');
      if (el) el.textContent = t('notice.toggleClose');
    }
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
    fab.title = t('fab.title');
    fab.innerHTML = '<i class="ic">' + SVG.sigil + '</i><span>' + escapeHtml(t('fab.label')) + '</span>';
    if (Number.isFinite(state.fab.x) && Number.isFinite(state.fab.y)) {
      fab.style.left = state.fab.x + 'px';
      fab.style.top = state.fab.y + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
    // 拖动逻辑：只在 mousedown 期间监听 mousemove/mouseup，结束立刻移除
    // 不再全局 document.addEventListener('mousemove', ...) — 否则 ChatGPT 鼠标移动时每秒进入函数 60+ 次，
    // 与 ChatGPT 自身 mousemove handler 叠加会让 main thread 长任务化、click 事件 starve。
    let drag = null;
    function onDocMouseMove(e) {
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
    }
    function onDocMouseUp() {
      // 始终清理 listener，避免泄漏
      document.removeEventListener('mousemove', onDocMouseMove);
      document.removeEventListener('mouseup', onDocMouseUp);
      if (!drag) return;
      const wasMoved = drag.moved;
      drag = null;
      fab.classList.remove('dragging');
      if (wasMoved) {
        const r = fab.getBoundingClientRect();
        state.fab.x = Math.round(r.left);
        state.fab.y = Math.round(r.top);
        saveSettings({ fabX: state.fab.x, fabY: state.fab.y });
      } else {
        openModal();
      }
    }
    fab.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      const r = fab.getBoundingClientRect();
      drag = { startX: e.clientX, startY: e.clientY, originLeft: r.left, originTop: r.top, moved: false };
      document.addEventListener('mousemove', onDocMouseMove, { passive: true });
      document.addEventListener('mouseup', onDocMouseUp, { once: true });
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
    // MutationObserver 加 debounce：ChatGPT React 频繁动 body 子节点（portal / overlay），
    // 不 debounce 会让回调每秒跑 100+ 次，main thread 累成长任务。
    // 1.5s 内最多检查一次 FAB 是否还在；FAB 偶尔慢 1 秒重新出现完全可以接受。
    let mutTimer = null;
    new MutationObserver(function() {
      if (mutTimer) return;
      mutTimer = setTimeout(function() {
        mutTimer = null;
        if (!document.getElementById(NS + '-fab')) ensureFab();
      }, 1500);
    }).observe(document.body, { childList: true, subtree: false });
  }
  // ============================================================
  // 浏览器扩展桥接（Chrome / Edge / Firefox MV3）
  // ------------------------------------------------------------
  // 油猴版用 GM_registerMenuCommand 在 Tampermonkey 菜单注册入口；
  // 扩展版改由 background.js 收到「工具栏图标点击 / 右键菜单 /
  // _execute_action 快捷键」后，转发 CKNB_OPEN_MODAL 消息到本页，
  // 触发同一个 openModal()，行为等价。
  //
  // 注意：本文件运行在 content script ISOLATED world，
  // chrome 命名空间可直接访问；Firefox 中 chrome.* 已镜像为
  // browser.*，本段代码三家通用。
  // ============================================================
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === 'CKNB_OPEN_MODAL') {
        try { openModal(); } catch (e) { /* 浮窗未就绪时静默跳过 */ }
      }
    });
  }

  init();
})();
