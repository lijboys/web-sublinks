// Version: 9.1.0 (紧急修复: 修复模板卡片因JS报错导致空白的问题)
// Date: 2026-04-05

const CONFIG = { KV_TMPL_KEY: "__sys_cloud_templates__" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ====================================================
    // API: 云端模板管理
    // ====================================================
    if (url.pathname === '/api/tmpl') {
      if (!env.MY_KV) return new Response('[]', { status: 200 });
      if (request.method === 'GET') {
        const data = await env.MY_KV.get(CONFIG.KV_TMPL_KEY);
        return new Response(data || '[]', { status: 200, headers: {'Content-Type': 'application/json'} });
      }
      if (request.method === 'POST') {
        if (!env.ADMIN_PWD) return new Response('后端未配置 ADMIN_PWD', { status: 403 });
        try {
          const body = await request.json();
          if (body.pwd !== env.ADMIN_PWD) return new Response('密码错误', { status: 403 });
          await env.MY_KV.put(CONFIG.KV_TMPL_KEY, JSON.stringify(body.tmpls));
          return new Response('OK', { status: 200 });
        } catch (e) { return new Response('数据错误', { status: 400 }); }
      }
    }

    // ====================================================
    // API: 代为拉取外部订阅链接 (绕过跨域限制)
    // ====================================================
    if (url.pathname === '/api/fetch' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.subUrl) return new Response('No URL', { status: 400 });
        const res = await fetch(body.subUrl, {
          headers: { 'User-Agent': 'ClashMeta/1.14.0' } 
        });
        if (!res.ok) throw new Error('拉取失败');
        return new Response(await res.text(), { status: 200 });
      } catch (e) {
        return new Response(e.message, { status: 500 });
      }
    }

    // ====================================================
    // 核心解析器：支持 Base64 & Clash YAML & 各种链接
    // ====================================================
    const tryDecodeBase64 = (str) => {
      try {
        const cleanStr = str.replace(/\s/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(cleanStr) && cleanStr.length > 20 && !str.includes('- name:')) {
          const decoded = decodeURIComponent(escape(atob(cleanStr)));
          if (decoded.includes('://') || decoded.includes('- name:')) return decoded;
        }
      } catch(e) {}
      return str;
    };

    const extractProxies = (text) => {
      if (text.includes('proxies:')) {
        const match = text.match(/proxies:[\s\S]*?(?=\n[a-z-]+:|$)/);
        if (match) return match[0].split('\n').slice(1).join('\n');
      }
      return text;
    };

    const parseLinksToArray = (linksStr) => {
      let processedStr = tryDecodeBase64(linksStr);
      processedStr = extractProxies(processedStr);
      
      const links = processedStr.split('\n').map(l => l.trim()).filter(l => l);
      let proxies = [];
      let nameCount = {};

      const getUniqueName = (baseName, type) => {
        let name = baseName;
        if (nameCount[name]) {
          name = `${baseName}-${type}`;
          if (nameCount[name]) {
            nameCount[name]++;
            name = `${name}${nameCount[name]}`;
          } else nameCount[name] = 1;
        } else nameCount[name] = 1;
        return name;
      };

      for (let link of links) {
        try {
          if (link.startsWith('- {') || link.startsWith('- name:')) {
             proxies.push(`  ${link}`);
             continue;
          }

          if (link.startsWith('vless://')) {
            const u = new URL(link);
            const name = getUniqueName(decodeURIComponent(u.hash.substring(1)), 'vless');
            let proxy = `  - {name: "${name}", server: "${u.hostname}", port: ${u.port}, type: vless, uuid: "${u.username}"`;
            if (u.searchParams.get('security') === 'reality') {
              proxy += `, tls: true, flow: "${u.searchParams.get('flow') || 'xtls-rprx-vision'}", skip-cert-verify: true, reality-opts: {public-key: "${u.searchParams.get('pbk')}"}`;
              if(u.searchParams.get('sid')) proxy += `, short-id: "${u.searchParams.get('sid')}"`;
              proxy += `, servername: "${u.searchParams.get('sni')}", client-fingerprint: "${u.searchParams.get('fp') || 'chrome'}"`;
            }
            proxy += `}`;
            proxies.push(proxy);
          } 
          else if (link.startsWith('hysteria2://')) {
            const u = new URL(link);
            const name = getUniqueName(decodeURIComponent(u.hash.substring(1)), 'hy2');
            const sni = u.searchParams.get('sni') || u.hostname;
            proxies.push(`  - {name: "${name}", server: "${u.hostname}", port: ${u.port}, type: hysteria2, password: "${u.username}", sni: "${sni}", skip-cert-verify: true, alpn: [h3]}`);
          }
          else if (link.startsWith('tuic://')) {
            const u = new URL(link);
            const name = getUniqueName(decodeURIComponent(u.hash.substring(1)), 'tuic');
            const auth = decodeURIComponent(u.username).split(':');
            const sni = u.searchParams.get('sni') || u.hostname;
            proxies.push(`  - {name: "${name}", server: "${u.hostname}", port: ${u.port}, type: tuic, uuid: "${auth[0]}", password: "${auth[1]}", sni: "${sni}", skip-cert-verify: true, alpn: [h3], congestion-controller: bbr, udp-relay-mode: native}`);
          }
          else if (link.startsWith('vmess://')) {
            const b64 = link.substring(8).replace(/-/g, '+').replace(/_/g, '/');
            const pad = b64.length % 4;
            const paddedB64 = pad ? b64 + '='.repeat(4 - pad) : b64;
            const json = JSON.parse(decodeURIComponent(escape(atob(paddedB64))));
            const name = getUniqueName(json.ps || "VMess", 'vmess');
            
            let proxy = `  - {name: "${name}", server: "${json.add}", port: ${json.port}, type: vmess, uuid: "${json.id}", alterId: ${json.aid}, cipher: auto`;
            if (json.tls === 'tls') proxy += `, tls: true, skip-cert-verify: true, servername: "${json.host}"`;
            if (json.net === 'ws') proxy += `, network: ws, ws-opts: {path: "${json.path}", headers: {Host: "${json.host}"}}`;
            proxy += `}`;
            proxies.push(proxy);
          }
          else if (link.startsWith('ss://') || link.startsWith('trojan://') || link.startsWith('ssr://')) {
             proxies.push(`  # 暂不转换此协议至YAML: ${link}`);
          }
        } catch (e) {
          proxies.push(`  # 解析失败: ${link} -> ${e.message}`);
        }
      }
      return proxies.join('\n');
    };

    const buildConfig = async (rawLinks, tmplUrl) => {
      const proxiesStr = parseLinksToArray(rawLinks);
      if (!tmplUrl) return "proxies:\n" + proxiesStr;

      let tmplText = "";
      try {
        const res = await fetch(tmplUrl);
        if (!res.ok) throw new Error("Fetch failed");
        tmplText = await res.text();
      } catch (err) {
        return "proxies:\n  - {name: '加载远程模板失败', type: direct}\n" + proxiesStr;
      }

      let finalConfig = tmplText.replace(/^proxies:.*$/m, `proxies:\n${proxiesStr}`);
      if (finalConfig === tmplText) finalConfig = tmplText + "\nproxies:\n" + proxiesStr;
      return finalConfig;
    };

    // ====================================================
    // API: 保存设置到 KV
    // ====================================================
    if (request.method === 'POST' && url.pathname === '/api/shorten') {
      if (!env.MY_KV) return new Response('KV NOT FOUND', { status: 500 });
      try {
        const payload = await request.json();
        if (!payload.links) return new Response('Empty', { status: 400 });

        const shortId = payload.alias ? encodeURIComponent(payload.alias) : Math.random().toString(36).substring(2, 8);
        payload.createdAt = Date.now();
        payload.accessedIPs = []; 
        await env.MY_KV.put(shortId, JSON.stringify(payload));
        return new Response(shortId, { status: 200 });
      } catch(e) {
        return new Response('Format Error', { status: 400 });
      }
    }

    // ====================================================
    // 下发路由
    // ====================================================
    if (url.pathname.startsWith('/sub')) {
      let cfg = null;
      const shortId = url.pathname.split('/')[2];
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

      try {
        if (!env.MY_KV) return new Response('KV ERROR', { status: 500 });
        if (!shortId) return new Response('Invalid ID', { status: 400 });

        const kvData = await env.MY_KV.get(shortId);
        if (!kvData) return new Response('404: 订阅不存在或已被销毁', { status: 404 });
        
        cfg = JSON.parse(kvData);
        if (!cfg.accessedIPs) cfg.accessedIPs = [];

        if (cfg.burn) {
          await env.MY_KV.delete(shortId);
        } else {
          const now = Date.now();
          const isExpired = (cfg.expireAt && now > cfg.expireAt) || (cfg.expireDays && now > cfg.createdAt + cfg.expireDays * 86400000);
          if (isExpired) {
             await env.MY_KV.delete(shortId); return new Response('410: 订阅已过期', { status: 410 });
          }
          if (cfg.maxDownloads) {
             if (!cfg.accessedIPs.includes(clientIP)) {
                 if (cfg.accessedIPs.length >= cfg.maxDownloads) return new Response(`403: IP 上限`, { status: 403 });
                 cfg.accessedIPs.push(clientIP); await env.MY_KV.put(shortId, JSON.stringify(cfg));
             }
          }
        }

        const filename = cfg.filename ? encodeURIComponent(cfg.filename) : 'My_Config';
        let headers = {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `inline; filename="${filename}.${cfg.universal ? 'txt' : 'yaml'}"`,
          'Profile-Update-Interval': '12',
          'profile-title': decodeURIComponent(filename)
        };
        if (cfg.subInfo) headers['Subscription-Userinfo'] = `upload=${cfg.subInfo.up}; download=${cfg.subInfo.down}; total=${cfg.subInfo.total}; expire=${cfg.subInfo.expire}`;

        let outText = "";
        if (cfg.universal) {
          const processed = extractProxies(tryDecodeBase64(cfg.links));
          outText = btoa(unescape(encodeURIComponent(processed)));
        } else outText = await buildConfig(cfg.links, cfg.tmplUrl);

        return new Response(outText, { headers });
      } catch (e) { return new Response('Error: ' + e.message, { status: 500 }); }
    }

    const bgImg = env.IMG || '';
    const workerDomain = `${url.protocol}//${url.host}/sub`;

    // ====================================================
    // 前端 Web UI
    // ====================================================
    const html = `
    <!DOCTYPE html>
    <html lang="zh-CN" data-theme="light">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>⚡ Pro 订阅控制台</title>
      <style>
        :root {
          --bg-color: #f8fafc; --text-main: #0f172a; --text-muted: #475569; 
          --primary: #4f46e5; --accent: #0ea5e9; --danger: #ef4444;
          --success: #10b981; --warning: #f59e0b;
          --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); 
          --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          
          --glass-bg: rgba(255, 255, 255, 0.78);
          --glass-border: rgba(255, 255, 255, 0.6);
          --input-bg: rgba(255, 255, 255, 0.5);
        }
        
        [data-theme="dark"] {
          --bg-color: #0f172a; --text-main: #f8fafc; --text-muted: #cbd5e1;
          --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
          --glass-bg: rgba(15, 23, 42, 0.75);
          --glass-border: rgba(255, 255, 255, 0.1);
          --input-bg: rgba(0, 0, 0, 0.3);
        }

        body { 
          font-family: 'Inter', system-ui, -apple-system, sans-serif; 
          background-color: var(--bg-color); color: var(--text-main); 
          margin: 0; padding: 40px 20px; display: flex; justify-content: center; 
          transition: background-color 0.3s, color 0.3s;
        }

        ${bgImg ? `
        body { background-image: url('${bgImg}'); background-size: cover; background-position: center; background-attachment: fixed; }
        .card, .tmpl-card, .upload-area {
          background: var(--glass-bg) !important; 
          backdrop-filter: blur(24px) saturate(150%); -webkit-backdrop-filter: blur(24px) saturate(150%); 
          border: 1px solid var(--glass-border) !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
        }
        textarea, input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"], select {
          background: var(--input-bg) !important;
          border: 1px solid var(--glass-border) !important;
          backdrop-filter: blur(10px);
        }
        .text-shadow { text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        [data-theme="dark"] .text-shadow { text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
        .header h1, .header p { text-shadow: 0 2px 8px rgba(0,0,0,0.5); color: #fff !important; }
        ` : '.text-shadow {}'}

        .container { width: 100%; max-width: 720px; position: relative; z-index: 10; }
        
        .theme-toggle { position: fixed; top: 20px; right: 20px; width: 44px; height: 44px; border-radius: 50%; background: var(--glass-bg, var(--panel-bg)); border: 1px solid var(--glass-border); color: var(--text-main); display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; box-shadow: var(--shadow-md); transition: all 0.3s; z-index: 9999; backdrop-filter: blur(20px); }
        .theme-toggle:hover { transform: scale(1.1); }

        .header { text-align: center; margin-bottom: 30px; transition: color 0.3s; }
        .header h1 { font-size: 28px; font-weight: 800; margin: 0 0 8px 0; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .header p { color: var(--text-muted); font-size: 14px; margin: 0; }

        .card { background: var(--glass-bg, #fff); border: 1px solid var(--glass-border, #e2e8f0); border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: var(--shadow-sm); transition: all 0.3s ease; }
        
        .card-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; color: var(--text-main); }
        
        .tabs { display: flex; background: var(--input-bg); border-radius: 10px; padding: 4px; margin-bottom: 15px; border: 1px solid var(--glass-border); }
        .tab-btn { flex: 1; padding: 10px; text-align: center; font-size: 14px; font-weight: 600; color: var(--text-muted); cursor: pointer; border-radius: 8px; transition: all 0.2s; user-select: none; }
        .tab-btn.active { background: var(--primary); color: #fff; box-shadow: var(--shadow-sm); }
        .tab-content { display: none; }
        .tab-content.active { display: block; animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        textarea { width: 100%; height: 160px; padding: 14px; border: 1px solid var(--glass-border); border-radius: 12px; background: var(--input-bg); color: var(--text-main); font-family: 'JetBrains Mono', monospace; font-size: 13px; resize: vertical; box-sizing: border-box; transition: all 0.2s; }
        textarea:focus, input:focus, select:focus { outline: none; border-color: var(--primary) !important; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2); }
        
        .upload-area { border: 2px dashed var(--primary); border-radius: 12px; padding: 40px 20px; text-align: center; cursor: pointer; color: var(--primary); font-weight: 600; transition: all 0.2s; background: rgba(79, 70, 229, 0.05); }
        .upload-area:hover { background: rgba(79, 70, 229, 0.1); }
        .upload-desc { font-size: 12px; color: var(--text-muted); margin-top: 10px; font-weight: normal; }

        .row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--glass-border); transition: border-color 0.3s;}
        .row:last-child { border-bottom: none; padding-bottom: 0; }
        .row-text { flex: 1; }
        .row-text strong { display: block; font-size: 14px; margin-bottom: 2px; }
        .row-text span { color: var(--text-muted); font-size: 12px; }

        input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"], select { padding: 10px 14px; border: 1px solid var(--glass-border); border-radius: 10px; background: var(--input-bg); color: var(--text-main); font-size: 14px; transition: all 0.2s; }
        .input-wrap { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
        
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(156, 163, 175, 0.5); transition: .3s; border-radius: 24px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        input:checked + .slider { background-color: var(--primary); }
        input:checked + .slider:before { transform: translateX(20px); }

        .tmpl-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
        .tmpl-card { padding: 10px 16px; border: 1px solid var(--glass-border); border-radius: 10px; background: var(--input-bg); cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; position: relative; color: var(--text-main); }
        .tmpl-card:hover { border-color: var(--primary); }
        .tmpl-card.active { border-color: var(--primary) !important; background: rgba(79, 70, 229, 0.15) !important; color: var(--primary) !important; font-weight: bold; }
        .tmpl-card .del-btn { position: absolute; top:-6px; right:-6px; background: var(--danger); color: white; border-radius: 50%; width: 18px; height: 18px; text-align: center; line-height: 16px; font-size: 12px; display: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        .tmpl-card:hover .del-btn { display: block; }

        .btn-primary { width: 100%; padding: 16px; border: none; border-radius: 12px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: #fff; font-weight: 700; font-size: 16px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4); }
        
        .alert-box { background: rgba(245, 158, 11, 0.1); border-left: 4px solid var(--warning); padding: 12px 16px; border-radius: 0 8px 8px 0; margin-top: 15px; font-size: 13px; color: #d97706; }
        .hidden { display: none !important; }
        
        .traffic-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--glass-border);}
        .traffic-grid input { width: 100%; box-sizing: border-box; }
      </style>
    </head>
    <body>

      <button class="theme-toggle" onclick="toggleTheme()" title="切换日夜模式"><span id="themeIcon">🌙</span></button>

      <div class="container">
        <div class="header">
          <h1>✈️ Pro 控制台</h1>
          <p>商业级订阅分发与安全管理中心</p>
        </div>

        <div class="card text-shadow">
          <div class="tabs">
            <div class="tab-btn active" onclick="switchTab('paste')" id="tab-paste">📄 剪贴板</div>
            <div class="tab-btn" onclick="switchTab('file')" id="tab-file">⬆️ 文件上传</div>
            <div class="tab-btn" onclick="switchTab('url')" id="tab-url">🔗 订阅链接</div>
          </div>
          
          <div id="content-paste" class="tab-content active">
            <textarea id="inputLinks" placeholder="支持:&#10;• 单条节点 (vless://, vmess://, tuic://, hy2:// 等)&#10;• Base64 编码的订阅字符串&#10;• 完整的 Clash YAML 配置片段"></textarea>
          </div>
          
          <div id="content-file" class="tab-content">
            <div class="upload-area" id="dropZone" onclick="document.getElementById('fileInput').click()">
               <div style="font-size: 24px; margin-bottom: 10px;">📂</div>
               <div id="fileStatus">点击此处选择文件，或将文件拖拽到此处</div>
               <div class="upload-desc">仅支持文本格式 (.txt, .yaml, .conf, .json 或无后缀)<br>严禁上传图片、视频、压缩包等非文本文件。</div>
            </div>
            <input type="file" id="fileInput" accept=".txt,.yaml,.yml,.json,.ini,.conf" style="display:none;" onchange="handleFile(this.files[0])">
          </div>

          <div id="content-url" class="tab-content">
            <input type="text" id="inputUrl" placeholder="输入机场订阅链接 (支持各种协议机场)" style="width: 100%; box-sizing: border-box; padding: 16px;">
            <div class="upload-desc" style="margin-top: 10px;">点击生成时，系统会从服务器端代为拉取并解析该链接内的节点。</div>
          </div>
        </div>
        
        <div class="card text-shadow">
          <div class="card-title">⚙️ 基础设置</div>
          <div class="row">
            <div class="row-text"><strong>配置显示名称</strong><span>导入客户端后显示的文件名</span></div>
            <div class="input-wrap"><input type="text" id="filename" placeholder="如: 我的专属网络" style="width: 160px;"></div>
          </div>
          <div class="row">
            <div class="row-text"><strong>固定链接后缀</strong><span>留空则随机生成</span></div>
            <div class="input-wrap"><input type="text" id="alias" placeholder="如: myvip" style="width: 160px;"></div>
          </div>
          <div class="row">
            <div class="row-text"><strong>开启通用订阅格式</strong><span>输出 Base64，兼容 v2rayN 等全平台</span></div>
            <label class="switch"><input type="checkbox" id="universal" onchange="toggleUniversal()"><span class="slider"></span></label>
          </div>
          <div id="universalWarning" class="alert-box hidden">
            ⚠️ <b>注意：</b>开启后，将无法加载路由模板，测速和分流规则将失效！仅当发给非 Clash 客户端时使用。
          </div>
        </div>

        <div class="card text-shadow" id="tmplPanel">
          <div class="card-title">🔗 路由模板挂载 (仅 Clash 生效)</div>
          <div class="tmpl-grid" id="tmplGrid">加载中...</div>
          <div class="input-wrap hidden" id="addTmplArea" style="margin-top:15px; justify-content: flex-start; flex-wrap: wrap;">
            <input type="text" id="newTmplName" placeholder="模板别名" style="flex:1; min-width: 120px;">
            <input type="text" id="newTmplUrl" placeholder="https://raw..." style="flex:2; min-width: 200px;">
            <button onclick="saveNewTmpl('local')" style="padding: 10px 16px; border:none; border-radius:10px; cursor:pointer; font-weight:600; background:var(--glass-border); color:var(--text-main);">本地</button>
            <button onclick="saveNewTmpl('cloud')" style="padding: 10px 16px; border:none; border-radius:10px; cursor:pointer; font-weight:600; background:var(--primary); color:#fff;">云端</button>
          </div>
        </div>

        <div class="card text-shadow">
          <div class="card-title">🛡️ 安全与面板控制</div>
          <div class="row" style="flex-wrap: wrap;">
            <div class="row-text"><strong>精确自动过期</strong><span>到期后订阅链接彻底销毁</span></div>
            <div class="input-wrap">
              <label class="switch"><input type="checkbox" id="enableExpire" onchange="document.getElementById('expireSettings').classList.toggle('hidden')"><span class="slider"></span></label>
            </div>
          </div>
          <div id="expireSettings" class="hidden" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--glass-border); display: flex; gap: 10px; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
            <select id="expireType" onchange="toggleExpireInput()" style="width: auto;">
              <option value="days">按天数</option><option value="hours">按小时</option><option value="date">指定日期和时间</option>
            </select>
            <input type="number" id="expireNum" placeholder="输入天数..." style="width: 120px;">
            <input type="datetime-local" id="expireDate" class="hidden" style="width: 190px;">
          </div>
          
          <div class="row">
            <div class="row-text"><strong>独立 IP 防泄露</strong><span>允许拉取订阅的不同网络数量</span></div>
            <div class="input-wrap">
              <input type="number" id="maxDown" class="hidden" placeholder="IP数" style="width: 70px;">
              <label class="switch"><input type="checkbox" onchange="document.getElementById('maxDown').classList.toggle('hidden')"><span class="slider"></span></label>
            </div>
          </div>
          <div class="row">
            <div class="row-text"><strong>阅后即焚模式</strong><span>被客户端拉取一次后立即自毁</span></div>
            <label class="switch"><input type="checkbox" id="burnMode"><span class="slider"></span></label>
          </div>
          <div class="row">
            <div class="row-text"><strong>伪装流量数据面板</strong><span>在客户端展示饼图和到期时间</span></div>
            <label class="switch"><input type="checkbox" onchange="document.getElementById('trafficArea').classList.toggle('hidden')"><span class="slider"></span></label>
          </div>
          <div id="trafficArea" class="hidden traffic-grid">
            <input type="text" id="tUp" placeholder="已用上传 (如10G)">
            <input type="text" id="tDown" placeholder="已用下载 (如50G)">
            <input type="text" id="tTotal" placeholder="总计流量 (如200G)">
            <input type="date" id="tExpireDate" style="grid-column: 1 / -1;">
          </div>
        </div>

        <button class="btn-primary" id="generateBtn" onclick="generateLink()">🚀 生成订阅链接</button>

        <div id="resultArea" class="card hidden text-shadow" style="border-color: var(--success) !important; margin-top: 20px; box-shadow: 0 0 0 1px var(--success);">
          <div style="color: var(--success); font-weight: 700; margin-bottom: 12px; text-align: center;">🎉 链接已生成成功！</div>
          <input type="text" id="subUrl" style="width: 100%; text-align: center; font-weight: 600; color: var(--primary); padding: 14px;" readonly>
          <div style="display: flex; gap: 12px; margin-top: 15px;">
            <button onclick="window.open(document.getElementById('subUrl').value)" style="flex: 1; padding: 12px; border-radius: 10px; border:1px solid var(--glass-border); background:var(--input-bg); color:var(--text-main); font-weight:600; cursor:pointer;">👀 在线预览</button>
            <button onclick="copyUrl()" style="flex: 1; padding: 12px; border-radius: 10px; border:none; background: var(--primary); color: white; font-weight:600; cursor:pointer;">📋 一键复制</button>
          </div>
        </div>
      </div>

      <script>
        function initTheme() {
          const savedTheme = localStorage.getItem('__pro_theme');
          const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (savedTheme === 'dark' || (!savedTheme && isSystemDark)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.getElementById('themeIcon').innerText = '🌞';
          } else {
            document.documentElement.setAttribute('data-theme', 'light');
            document.getElementById('themeIcon').innerText = '🌙';
          }
        }
        function toggleTheme() {
          const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          localStorage.setItem('__pro_theme', next);
          document.getElementById('themeIcon').innerText = next === 'dark' ? '🌞' : '🌙';
        }
        initTheme();

        let currentTab = 'paste';
        let uploadedFileText = '';

        function switchTab(tab) {
          currentTab = tab;
          document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
          document.getElementById('tab-' + tab).classList.add('active');
          document.getElementById('content-' + tab).classList.add('active');
        }

        const dropZone = document.getElementById('dropZone');
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--primary)'; });
        dropZone.addEventListener('drop', (e) => {
          e.preventDefault(); dropZone.style.borderColor = 'var(--primary)';
          if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });

        function handleFile(file) {
          if (!file) return;
          if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.name.endsWith('.zip') || file.name.endsWith('.rar')) {
            return alert('❌ 不支持的文件格式！仅支持文本配置 (如 .txt, .yaml等)。');
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            uploadedFileText = e.target.result;
            document.getElementById('fileStatus').innerHTML = \`✅ <b>已成功加载:</b> \${file.name} <br>大小: \${(file.size/1024).toFixed(2)} KB\`;
            dropZone.style.background = 'rgba(16, 185, 129, 0.1)';
            dropZone.style.borderColor = 'var(--success)';
          };
          reader.readAsText(file);
        }

        const domain = '${workerDomain}';
        const baseTemplates = [
          { id: 'noom', name: '🟢 NooM Pro', url: 'https://raw.githubusercontent.com/lijboys/li-rules/refs/heads/main/Rewards/NooM.ini' },
          { id: 'none', name: '❌ 纯净节点', url: '' }
        ];
        let cloudTemplates = [], localTemplates = JSON.parse(localStorage.getItem('__local_tmpls') || '[]');
        let currentSelectedUrl = baseTemplates[0].url;

        function toggleUniversal() {
          const isChecked = document.getElementById('universal').checked;
          document.getElementById('tmplPanel').style.display = isChecked ? 'none' : 'block';
          document.getElementById('universalWarning').classList.toggle('hidden', !isChecked);
        }

        function toggleExpireInput() {
          const type = document.getElementById('expireType').value;
          if (type === 'date') {
            document.getElementById('expireNum').classList.add('hidden');
            document.getElementById('expireDate').classList.remove('hidden');
          } else {
            document.getElementById('expireNum').classList.remove('hidden');
            document.getElementById('expireDate').classList.add('hidden');
            document.getElementById('expireNum').placeholder = type === 'days' ? '输入天数...' : '输入小时数...';
          }
        }

        async function fetchCloudTmpls() {
          try { cloudTemplates = await (await fetch('/api/tmpl')).json(); } catch(e) {}
          renderTmpls();
        }

        function renderTmpls() {
          const grid = document.getElementById('tmplGrid');
          grid.innerHTML = '';
          baseTemplates.forEach(t => renderCard(t, 'base', -1));
          cloudTemplates.forEach((t, i) => renderCard(t, 'cloud', i));
          localTemplates.forEach((t, i) => renderCard(t, 'local', i));
          renderCard({ id: 'add', name: '➕ 添加模板...', url: 'ACTION_ADD' }, 'base', -1);
        }

        function renderCard(t, type, index) {
          const div = document.createElement('div');
          div.className = 'tmpl-card ' + (t.url === currentSelectedUrl && t.id !== 'add' ? 'active' : '');
          div.innerText = t.name;
          if (type !== 'base') {
            const delBtn = document.createElement('div');
            delBtn.className = 'del-btn'; delBtn.innerText = '×';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteTmpl(type, index); };
            div.appendChild(delBtn);
          }
          div.onclick = () => {
            if (t.id === 'add') {
              document.getElementById('addTmplArea').classList.remove('hidden');
              document.querySelectorAll('.tmpl-card').forEach(c => c.classList.remove('active'));
              div.classList.add('active');
              return;
            }
            document.getElementById('addTmplArea').classList.add('hidden');
            currentSelectedUrl = t.url; renderTmpls(); 
          };
          document.getElementById('tmplGrid').appendChild(div); // FIX IS HERE
        }

        async function saveNewTmpl(mode) {
          const name = document.getElementById('newTmplName').value.trim();
          const url = document.getElementById('newTmplUrl').value.trim();
          if (!name || !url) return;
          if (mode === 'local') {
            localTemplates.push({ name: '💻 ' + name, url: url });
            localStorage.setItem('__local_tmpls', JSON.stringify(localTemplates));
            finishSave(url);
          } else {
            let pwd = localStorage.getItem('__admin_pwd') || prompt('☁️ 验证密码：');
            if (!pwd) return;
            const newTmpls = [...cloudTemplates, { name: '☁️ ' + name, url: url }];
            try {
              const res = await fetch('/api/tmpl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pwd, tmpls: newTmpls }) });
              if (res.status === 403) { localStorage.removeItem('__admin_pwd'); return alert('密码错误'); }
              localStorage.setItem('__admin_pwd', pwd); cloudTemplates = newTmpls; finishSave(url);
            } catch(e) { alert('保存失败'); }
          }
        }
        function finishSave(url) { currentSelectedUrl = url; document.getElementById('newTmplName').value = ''; document.getElementById('newTmplUrl').value = ''; document.getElementById('addTmplArea').classList.add('hidden'); renderTmpls(); }

        async function deleteTmpl(type, index) {
          if (!confirm('确定删除吗？')) return;
          if (type === 'local') {
            if (localTemplates[index].url === currentSelectedUrl) currentSelectedUrl = baseTemplates[0].url;
            localTemplates.splice(index, 1); localStorage.setItem('__local_tmpls', JSON.stringify(localTemplates)); renderTmpls();
          } else {
            let pwd = localStorage.getItem('__admin_pwd') || prompt('密码：');
            const newTmpls = [...cloudTemplates];
            if (newTmpls[index].url === currentSelectedUrl) currentSelectedUrl = baseTemplates[0].url;
            newTmpls.splice(index, 1);
            try {
              const res = await fetch('/api/tmpl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pwd, tmpls: newTmpls }) });
              if (res.status === 403) return localStorage.removeItem('__admin_pwd');
              cloudTemplates = newTmpls; renderTmpls();
            } catch(e) {}
          }
        }

        function parseBytes(str) {
          if (!str) return 0;
          const s = str.toUpperCase(); const val = parseFloat(s);
          if (s.includes('T')) return Math.floor(val * 1099511627776);
          if (s.includes('G')) return Math.floor(val * 1073741824);
          if (s.includes('M')) return Math.floor(val * 1048576);
          return val; 
        }

        async function getFinalInputText() {
          if (currentTab === 'paste') {
             return document.getElementById('inputLinks').value.trim();
          } else if (currentTab === 'file') {
             if (!uploadedFileText) throw new Error('请先上传文件');
             return uploadedFileText.trim();
          } else if (currentTab === 'url') {
             const subUrl = document.getElementById('inputUrl').value.trim();
             if (!subUrl) throw new Error('请填写订阅链接');
             const res = await fetch('/api/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subUrl }) });
             if (!res.ok) throw new Error('云端代拉取订阅失败');
             return await res.text();
          }
        }

        async function generateLink() {
          const btn = document.getElementById('generateBtn');
          btn.innerText = '⏳ 处理中...';
          try {
            const links = await getFinalInputText();
            if (!links) throw new Error('解析到的内容为空');

            const payload = {
              links: links,
              filename: document.getElementById('filename').value.trim(),
              alias: document.getElementById('alias').value.trim(),
              universal: document.getElementById('universal').checked,
              tmplUrl: currentSelectedUrl,
              maxDownloads: document.getElementById('maxDown').value ? parseInt(document.getElementById('maxDown').value) : null,
              burn: document.getElementById('burnMode').checked,
            };

            if (document.getElementById('enableExpire').checked) {
               const type = document.getElementById('expireType').value;
               let expireAt = null;
               if (type === 'days') {
                  const val = parseFloat(document.getElementById('expireNum').value);
                  if (val) expireAt = Date.now() + val * 86400000;
               } else if (type === 'hours') {
                  const val = parseFloat(document.getElementById('expireNum').value);
                  if (val) expireAt = Date.now() + val * 3600000;
               } else if (type === 'date') {
                  const val = document.getElementById('expireDate').value;
                  if (val) expireAt = new Date(val).getTime();
               }
               if (expireAt) payload.expireAt = expireAt;
            }

            if (!document.getElementById('trafficArea').classList.contains('hidden')) {
              let expDateStr = document.getElementById('tExpireDate').value;
              payload.subInfo = { up: parseBytes(document.getElementById('tUp').value), down: parseBytes(document.getElementById('tDown').value), total: parseBytes(document.getElementById('tTotal').value), expire: expDateStr ? Math.floor(new Date(expDateStr).getTime() / 1000) : 0 };
            }

            const res = await fetch('/api/shorten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error(await res.text());
            
            document.getElementById('subUrl').value = domain + '/' + await res.text();
            document.getElementById('resultArea').classList.remove('hidden');
          } catch(e) {
            alert('❌ 失败: ' + e.message);
          } finally { btn.innerText = '🚀 生成订阅链接'; }
        }

        async function copyUrl() { document.getElementById('subUrl').select(); try { await navigator.clipboard.writeText(document.getElementById('subUrl').value); alert('✅ 已复制！');} catch(e){} }
        window.onload = fetchCloudTmpls;
      </script>
    </body>
    </html>
    `;

    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' }});
  }
};
