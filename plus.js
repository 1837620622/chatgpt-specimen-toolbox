(function () {
  var paymentProfiles = {
    direct: {
      label: '直绑 / Japan (JP¥)',
      country: 'JP',
      currency: 'JPY'
    },
    gopay: {
      label: 'GoPay / Indonesia',
      country: 'ID',
      currency: 'IDR'
    },
    paypal: {
      label: 'PayPal / United States',
      country: 'US',
      currency: 'USD'
    }
  };

  function showPanel(html) {
    var old = document.getElementById('plus-pay-panel');
    if (old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'plus-pay-panel';
    panel.style.cssText = [
      'position:fixed',
      'left:12px',
      'right:12px',
      'bottom:20px',
      'z-index:2147483647',
      'background:#111827',
      'color:#fff',
      'border-radius:14px',
      'box-shadow:0 10px 30px rgba(0,0,0,.35)',
      'padding:14px',
      'font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'word-break:break-word',
      'pointer-events:auto' // 【修复1】强制捕获鼠标事件，防止穿透
    ].join(';');

    panel.innerHTML =
      '<div style="font-weight:700;margin-bottom:8px;">ChatGPT Plus 支付链接</div>' +
      '<div id="plus-pay-panel-body">' + html + '</div>' +
      '<button id="plus-pay-panel-close" style="margin-top:12px;padding:8px 12px;border:0;border-radius:10px;background:#374151;color:#fff;cursor:pointer;">关闭</button>';

    document.body.appendChild(panel);

    // 【修复2】改用原生监听器，彻底阻止事件冒泡被框架吃掉
    document.getElementById('plus-pay-panel-close').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      panel.remove();
    });
  }

  function updatePanel(html) {
    var body = document.getElementById('plus-pay-panel-body');
    if (body) body.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }

  function choosePaymentProfile() {
    return new Promise(function (resolve) {
      showPanel(
        '请选择希望触发的支付地区：<br><br>' +
        '<button id="plus-pay-direct" style="width:100%;margin-bottom:10px;padding:12px;border:0;border-radius:12px;background:#10a37f;color:#fff;font-weight:700;cursor:pointer;">直绑 / Japan (JP¥)</button>' +
        '<button id="plus-pay-gopay" style="width:100%;margin-bottom:10px;padding:12px;border:0;border-radius:12px;background:#00aa13;color:#fff;font-weight:700;cursor:pointer;">GoPay / Indonesia</button>' +
        '<button id="plus-pay-paypal" style="width:100%;margin-bottom:10px;padding:12px;border:0;border-radius:12px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;">PayPal / United States</button>' +
        '<div style="margin-top:10px;color:#d1d5db;font-size:12px;line-height:1.5;">选择只会调整 billing country/currency，最终显示哪些支付方式由 ChatGPT/Stripe 决定。</div>'
      );

      // 【修复3】循环绑定选项，阻止冒泡
      var profiles = ['direct', 'gopay', 'paypal'];
      profiles.forEach(function (id) {
        var btn = document.getElementById('plus-pay-' + id);
        if (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            resolve(paymentProfiles[id]);
          });
        }
      });
    });
  }

  async function main() {
    try {
      if (!location.hostname.endsWith('chatgpt.com')) {
        showPanel('请先打开 https://chatgpt.com 并登录后再运行。');
        return;
      }

      var profile = await choosePaymentProfile();

      updatePanel(
        '已选择：' + escapeHtml(profile.label) +
        '<br>地区：' + escapeHtml(profile.country) +
        '<br>币种：' + escapeHtml(profile.currency) +
        '<br><br>⏳ 正在获取 session...'
      );

      var sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
      if (!sessionRes.ok) {
        updatePanel('❌ 获取 session 失败，状态码：' + sessionRes.status);
        return;
      }

      var session = await sessionRes.json();
      var accessToken = session && session.accessToken;

      if (!accessToken) {
        updatePanel('❌ 没有拿到 accessToken，请确认已经登录 ChatGPT。');
        return;
      }

      updatePanel(
        '已选择：' + escapeHtml(profile.label) +
        '<br>✅ 已拿到 accessToken，正在请求 checkout，请稍候...'
      );

      var payload = {
        plan_name: 'chatgptplusplan',
        billing_details: {
          country: profile.country,
          currency: profile.currency
        },
        cancel_url: 'https://chatgpt.com/#pricing',
        promo_campaign: {
          promo_campaign_id: 'plus-1-month-free',
          is_coupon_from_query_param: false
        },
        checkout_ui_mode: 'hosted',
        locale: 'zh-CN'
      };

      var response = await fetch('/backend-api/payments/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        },
        body: JSON.stringify(payload)
      });

      var text = await response.text();
      var data = {};
      try { data = JSON.parse(text); } catch (e) { console.warn('API 返回不是 JSON'); }

      if (!response.ok) {
        updatePanel(
          '❌ checkout 请求失败，状态码：' + response.status +
          '<br><br><pre style="white-space:pre-wrap;margin:0;">' + escapeHtml(text.slice(0, 500)) + '</pre>'
        );
        return;
      }

      var url = data.url || data.stripe_hosted_url || data.checkout_url || '';
      if (!url) {
        updatePanel(
          '❌ 响应里没有支付链接：<br><br><pre style="white-space:pre-wrap;margin:0;">' + escapeHtml(text.slice(0, 500)) + '</pre>'
        );
        return;
      }

      // 第四步：展示生成的结算链接
      updatePanel(
        '🎉 生成成功：' + escapeHtml(profile.label) +
        '<br><br>' +
        '<a href="' + escapeHtml(url) + '" target="_blank" style="color:#6ee7b7;">' + escapeHtml(url) + '</a>' +
        '<br><br>' +
        '<button id="plus-pay-copy" style="padding:8px 12px;border:0;border-radius:10px;background:#10a37f;color:#fff;cursor:pointer;">复制链接</button>' +
        ' ' +
        '<button id="plus-pay-open" style="padding:8px 12px;border:0;border-radius:10px;background:#2563eb;color:#fff;cursor:pointer;">打开链接</button>'
      );

      // 【修复4】无感增强版复制逻辑
      document.getElementById('plus-pay-copy').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var btn = this;

        // 兜底方案：使用临时 input 框调用 execCommand
        var fallbackCopy = function () {
          try {
            var tempInput = document.createElement('input');
            tempInput.value = url;
            document.body.appendChild(tempInput);
            tempInput.select();
            tempInput.setSelectionRange(0, 99999);
            var successful = document.execCommand('copy');
            document.body.removeChild(tempInput);

            if (successful) {
              btn.textContent = '✅ 已复制 (兜底)';
              btn.style.background = '#059669';
            } else {
              prompt('❌ 复制失败，请手动复制：', url);
            }
          } catch (err) {
            prompt('❌ 复制失败，请手动复制：', url);
          }
        };

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(url).then(function () {
            btn.textContent = '✅ 已复制';
            btn.style.background = '#059669';
          }).catch(fallbackCopy);
        } else {
          fallbackCopy();
        }
      });

      // 【修复5】确保“打开链接”按钮也不被拦截
      document.getElementById('plus-pay-open').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        location.href = url;
      });

    } catch (e) {
      updatePanel('❌ ERROR: ' + escapeHtml(e && e.message ? e.message : String(e)));
    }
  }

  main();
})();