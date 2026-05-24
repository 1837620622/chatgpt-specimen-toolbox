// ── ChatGPT 支付链接生成脚本 (修复版) ──────────────────────────────

const LongLinkMode = true; 
const Currency     = 'USD';
const Country      = 'US';
const PlanName     = 'chatgptteamplan'; 
const AutoOpen     = false;

console.log('⏳ 正在获取凭证并请求生成链接...');

try {
  const sessionRes = await fetch('/api/auth/session');
  const sessionData = await sessionRes.json();
  const token = sessionData.accessToken;

  if (!token) throw new Error('无法获取 Token，请确保你已登录 ChatGPT');

  const res = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`, // 这里必须使用反引号 `
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_name: 'chatgptteamplan',
      billing_details: { country: 'US', currency: 'USD' },
      checkout_ui_mode: 'hosted',
      entry_point: 'team_workspace_purchase_modal',
      team_plan_data: { workspace_name: '微信1837620622-两个月质保', price_interval: 'month', seat_quantity: 2 },
      cancel_url: 'https://chatgpt.com/#pricing',
      promo_code: "STRIPEATLASGPT4BIZ050126" // 请确认优惠码是否依然有效
    }),
  });

  if (!res.ok) {
    const errorDetail = await res.json();
    throw new Error(`请求失败: ${res.status} ${JSON.stringify(errorDetail)}`);
  }

  const { url } = await res.json();
  if (url) {
    console.log('%c✅ 成功生成支付链接：', 'color:#10a37f;font-size:18px;font-weight:bold;');
    console.log('OpenAI 链接:', url);
    console.log('Stripe 直连:', url.replace('pay.openai.com', 'checkout.stripe.com'));
  } else {
    console.error('❌ 未能在返回结果中找到 URL');
  }

} catch (e) {
  console.error('❌ 执行出错:', e.message);
}