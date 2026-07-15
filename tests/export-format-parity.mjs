/**
 * 对照 gtxx3600/GPTSession2CPAandSub2API 上游 convertSession 的字段形状。
 * 不依赖真实 token：使用最小可解析 JWT（base64url payload）。
 * 运行：node tests/export-format-parity.mjs
 * 可选：UPSTREAM_HTML=/path/to/docs/index.html
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function fakeJwt(payload) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

const nowSec = Math.floor(Date.now() / 1000);
const exp = nowSec + 3600;
const accountId = '00000000-0000-4000-9000-000000000001';
const accessToken = fakeJwt({
  exp,
  'https://api.openai.com/auth': {
    chatgpt_account_id: accountId,
    chatgpt_plan_type: 'plus',
    chatgpt_user_id: 'user-demo',
    user_id: 'user-demo',
  },
  'https://api.openai.com/profile': { email: 'demo@example.com', email_verified: true },
});

const session = {
  user: { id: 'user-demo', email: 'demo@example.com', name: 'Demo', iat: nowSec },
  expires: new Date((exp + 86400) * 1000).toISOString(),
  account: { id: accountId, planType: 'plus', structure: 'personal' },
  accessToken,
  sessionToken: 'session-jwe-placeholder',
  authProvider: 'openai',
};

function fakeEl() {
  return { classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {}, addEventListener() {}, setAttribute() {}, append() {}, remove() {}, select() {}, click() {}, textContent: '', innerHTML: '', value: '', disabled: false, files: [], attributes: {} };
}

function loadUpstreamConvert(htmlPath) {
  if (!fs.existsSync(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);
  if (!m) return null;
  const elements = new Map();
  const document = {
    body: fakeEl(),
    createElement: () => fakeEl(),
    querySelector(sel) { if (!elements.has(sel)) elements.set(sel, fakeEl()); return elements.get(sel); },
    querySelectorAll(sel) {
      if (sel === '[data-format]') return ['sub2api', 'cpa', 'cockpit', '9router', 'codex', 'axonhub', 'codexmanager'].map((f) => { const el = fakeEl(); el.dataset = { format: f }; return el; });
      return [];
    },
    execCommand() { return true; },
    addEventListener() {},
  };
  const window = { document, location: { href: 'http://local' }, navigator: {}, addEventListener() {} };
  let src = m[1].replace(/\}\)\(\);\s*$/, 'globalThis.__UP={convertSession};})();');
  const sandbox = { window, document, console, setTimeout, clearTimeout, URL, TextEncoder, TextDecoder, atob, btoa, crypto, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { timeout: 5000 });
  return sandbox.__UP?.convertSession || null;
}

function loadLocalBuildAll() {
  const userJs = fs.readFileSync(path.join(root, 'ChatGPT全能助手.user.js'), 'utf8');
  let body = userJs.replace(/^[\s\S]*?\(function \(\) \{\n  'use strict';\n/, '').replace(/\n  init\(\);\n\}\)\(\);?\s*$/, '');
  body = body
    .replace(/if \(typeof window === 'undefined'[\s\S]*?window\.__CKNB_TOOLBOX_LOADED__ = true;\n/, '')
    .replace(/if \(window\.top !== window\.self\) return;\n/, '')
    .replace(/if \(window\.__CKNB_TOOLBOX_LOADED__\) return;\n/, '');
  const sandbox = {
    console, TextEncoder, TextDecoder, atob, btoa, URL,
    crypto: globalThis.crypto || { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    window: { top: 1, self: 1, __CKNB_TOOLBOX_LOADED__: false },
    document: { readyState: 'complete', createElement: () => fakeEl(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {}, addEventListener() {} }, head: { appendChild() {} }, addEventListener() {} },
    navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { href: 'https://chatgpt.com/' },
    setTimeout, clearTimeout, fetch: async () => ({ ok: false }),
  };
  sandbox.window.top = sandbox.window;
  sandbox.window.self = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(body + '\n;this.__LOCAL={buildAllExports};', ctx, { timeout: 15000 });
  return ctx.__LOCAL.buildAllExports;
}

function eq(a, b, ignore = new Set(['last_refresh', 'exported_at', 'createdAt', 'updatedAt', 'created_at', 'last_used', 'expiresIn', 'expires_in'])) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (ignore.has(k)) continue;
      if (!(k in a) || !(k in b)) return false;
      if (typeof a[k] === 'string' && typeof b[k] === 'string' && a[k].endsWith('.synthetic') && b[k].endsWith('.synthetic')) {
        const da = JSON.parse(Buffer.from(a[k].split('.')[1], 'base64url').toString());
        const db = JSON.parse(Buffer.from(b[k].split('.')[1], 'base64url').toString());
        delete da.iat; delete da.exp; delete db.iat; delete db.exp;
        if (JSON.stringify(da) !== JSON.stringify(db)) return false;
        continue;
      }
      if (!eq(a[k], b[k], ignore)) return false;
    }
    return true;
  }
  return false;
}

const buildAllExports = loadLocalBuildAll();
const all = buildAllExports(session);
const auth = JSON.parse(all.exports.auth.text);

// Session → auth.json 关键不变量（不依赖上游）
const asserts = [];
function check(name, cond) { asserts.push([name, !!cond]); if (!cond) console.error('FAIL', name); }

check('auth.auth_mode', auth.auth_mode === 'chatgpt');
check('auth.OPENAI_API_KEY null', auth.OPENAI_API_KEY === null);
check('auth.access = session.accessToken', auth.tokens.access_token === session.accessToken);
check('auth.account_id', auth.tokens.account_id === accountId);
check('auth.refresh empty (not sessionToken)', auth.tokens.refresh_token === '' && auth.tokens.refresh_token !== session.sessionToken);
check('auth.id_token synthetic', String(auth.tokens.id_token).endsWith('.synthetic'));
check('cpa has session_token', JSON.parse(all.exports.cpa.text).session_token === session.sessionToken);
check('cockpit type codex flat', JSON.parse(all.exports.cockpit.text).type === 'codex' && !JSON.parse(all.exports.cockpit.text).tokens);

const upHtml = process.env.UPSTREAM_HTML || '/tmp/upstream-index.html';
const convertSession = loadUpstreamConvert(upHtml);
if (convertSession) {
  const up = convertSession(session, { now: new Date(), sourceName: 'test' });
  const pairs = [
    ['auth', up.codexAuthJson],
    ['cpa', up.cpa],
    ['cockpit', up.cockpit],
    ['9router', up.nineRouter],
    ['axonhub', up.axonHub],
    ['codex-manager', up.codexManager],
  ];
  for (const [id, upObj] of pairs) {
    const loc = JSON.parse(all.exports[id].text);
    const upJ = JSON.parse(JSON.stringify(upObj));
    check('upstream ' + id, eq(loc, upJ));
  }
  check('upstream sub2api', eq(JSON.parse(all.exports.sub2api.text).accounts[0], JSON.parse(JSON.stringify(up.sub2apiAccount))));
} else {
  console.warn('skip upstream compare (no UPSTREAM_HTML /tmp/upstream-index.html)');
}

const failed = asserts.filter(([, ok]) => !ok);
console.log(failed.length ? `FAILED ${failed.length}/${asserts.length}` : `OK ${asserts.length} checks`);
process.exit(failed.length ? 1 : 0);
