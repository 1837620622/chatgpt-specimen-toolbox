(function() {
    // 1. 甭管成不成功，先在页面左上角把框画出来，让你心里有底
    let box = document.getElementById('auth-debug-box');
    if (box) box.remove(); // 防止重复运行堆叠

    box = document.createElement('div');
    box.id = 'auth-debug-box';
    Object.assign(box.style, {
        position: 'fixed', top: '20px', left: '20px', zIndex: '9999999',
        width: '450px', backgroundColor: '#1a1a1a', color: '#fff',
        padding: '15px', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        fontFamily: 'monospace', fontSize: '13px', border: '1px solid #333',
        lineHeight: '1.4', pointerEvents: 'auto' // 确保层级和点击不被穿透
    });
    box.innerHTML = `<div style="color: #cca300; font-weight: bold;">⏳ 正在努力获取 Session 数据，请稍候...</div>`;
    document.body.appendChild(box);

    // 2. 去后台抓数据
    fetch('/api/auth/session')
    .then(async r => {
        const text = await r.text(); // 先拿原始文本，防止 json() 遇到 HTML 直接死锁
        
        // 关键拦截：如果是 HTML 网页说明走错地方或者没登录
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
            throw new Error("服务器返回了 HTML 网页。这通常意味着：你目前处于【未登录】状态，或者【当前网页的网址】不对。");
        }

        try {
            return JSON.parse(text);
        } catch(e) {
            throw new Error("解析 JSON 失败，服务器吐出的数据格式不对。");
        }
    })
    .then(d => {
        const at = d.accessToken;
        if (!at) {
            throw new Error("未能在数据中找到 accessToken，请确认你已登录成功。");
        }

        // 解码并重组 JWT 载荷
        const parts = at.split('.');
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        const profile = payload['https://api.openai.com/profile'] || {};
        const auth = payload['https://api.openai.com/auth'] || {};
        
        payload.email = profile.email || d.user?.email || '';
        payload.email_verified = profile.email_verified || false;
        payload.name = d.user?.name || auth.chatgpt_user_id || '';
        payload.picture = '';

        const newPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const idToken = parts[0] + '.' + newPayload + '.' + parts[2];

        const jsonStr = JSON.stringify({
            tokens: { id_token: idToken, access_token: at }
        }, null, 2);

        // 3. 【成功状态】：在框里塞入 JSON 和一键复制按钮
        box.innerHTML = `
            <div style="color: #4caf50; font-weight: bold; margin-bottom: 10px;">🎉 成功获取 Auth JSON！</div>
            <textarea id="auth-json-output" style="width: 100%; height: 180px; background: #2b2b2b; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 8px; font-size: 12px; resize: none; font-family: monospace;" readonly>${jsonStr}</textarea>
            <div style="margin-top: 12px; display: flex; justify-content: space-between;">
                <button id="auth-copy-btn" style="background: #007acc; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">📋 一键复制到剪贴板</button>
                <button id="auth-close-btn-success" style="background: #555; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;">关闭</button>
            </div>
        `;

        const copyBtn = document.getElementById('auth-copy-btn');
        const textarea = document.getElementById('auth-json-output');

        // 【修复复制不灵敏】
        copyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation(); // 阻止事件冒泡，防止被底层的 React/Vue 接管
            const btn = this;

            const showSuccess = (text = '✅ 已成功复制！') => {
                btn.innerText = text;
                btn.style.backgroundColor = '#2eb82e';
                setTimeout(() => {
                    btn.innerText = '📋 一键复制到剪贴板';
                    btn.style.backgroundColor = '#007acc';
                }, 2000);
            };

            const fallbackCopy = () => {
                try {
                    textarea.focus();
                    textarea.select();
                    textarea.setSelectionRange(0, 99999); // 适配移动端
                    const successful = document.execCommand('copy');
                    if (successful) {
                        showSuccess('✅ 已复制 (兜底模式)');
                    } else {
                        btn.innerText = '❌ 复制失败，请手动框选';
                    }
                } catch (err) {
                    btn.innerText = '❌ 请手动框选复制';
                }
            };

            // 优先使用现代 API，如果处于非 HTTPS 或不支持则直接走同步兜底
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(jsonStr)
                    .then(() => showSuccess())
                    .catch(fallbackCopy);
            } else {
                fallbackCopy();
            }
        });

        // 【修复关闭不灵敏】
        document.getElementById('auth-close-btn-success').addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            box.remove();
        });

        console.log('✅ 数据生成完毕！');

    })
    .catch(err => {
        // 4. 【失败状态】：直接把错误原因画在框里，让你秒懂为什么报错
        box.innerHTML = `
            <div style="color: #ff3333; font-weight: bold; margin-bottom: 8px;">❌ 运行出错了！</div>
            <div style="background: #2b0000; color: #ff9999; padding: 10px; border-radius: 4px; border: 1px solid #550000; word-break: break-all; font-size: 12px;">
                ${err.message}
            </div>
            <div style="margin-top: 10px; font-size: 12px; color: #aaa;">
                🛠️ <b>检查建议：</b><br>
                1. 确保你现在打开的网页就是你要提取 Token 的官网。<br>
                2. 确认你在这个网站上已经是<b>【已登录】</b>状态。如果过期了，请刷新网页重新登录。
            </div>
            <div style="margin-top: 12px; text-align: right;">
                <button id="auth-close-btn-err" style="background: #555; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">关闭</button>
            </div>
        `;
        
        // 【修复失败弹窗关闭不灵敏】
        document.getElementById('auth-close-btn-err').addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            box.remove();
        });
    });
})();