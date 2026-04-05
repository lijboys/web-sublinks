// Version: 12.0.0 [2026-04-05]

const CONFIG = { KV_TMPL_KEY: "__sys_cloud_templates__" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ====================================================
    // API 路由
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

    if (url.pathname === '/api/fetch' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.subUrl) return new Response('No URL', { status: 400 });
        const res = await fetch(body.subUrl, { headers: { 'User-Agent': 'ClashMeta/1.14.0' } });
        if (!res.ok) throw new Error('拉取失败');
        return new Response(await res.text(), { status: 200 });
      } catch (e) { return new Response(e.message, { status: 500 }); }
    }

    // ====================================================
    // 核心解析器
    // ====================================================
    const addFlag = (name) => {
      if (/🇭🇰|🇹🇼|🇯🇵|🇸🇬|🇰🇷|🇺🇸|🇬🇧|🇫🇷|🇩🇪|🇳🇱|🇷🇺/.test(name)) return name;
      const rules = [
        { regex: /HK|Hong Kong|香港|深港|广港|沪港/i, flag: '🇭🇰' },
        { regex: /TW|Taiwan|台湾|台灣|台北|新北|广台/i, flag: '🇹🇼' },
        { regex: /JP|Japan|日本|东京|大阪|埼玉|广日/i, flag: '🇯🇵' },
        { regex: /SG|Singapore|新加坡|狮城|广新/i, flag: '🇸🇬' },
        { regex: /KR|Korea|韩国|首尔|春川|广韩/i, flag: '🇰🇷' },
        { regex: /US|America|United States|美国|洛杉矶|圣何塞|纽约|西雅图|芝加哥|波特兰|达拉斯|广美/i, flag: '🇺🇸' },
        { regex: /UK|Britain|英国|伦敦/i, flag: '🇬🇧' },
        { regex: /FR|France|法国|巴黎/i, flag: '🇫🇷' },
        { regex: /DE|Germany|德国|法兰克福/i, flag: '🇩🇪' },
        { regex: /NL|Netherlands|荷兰|阿姆斯特丹/i, flag: '🇳🇱' },
        { regex: /RU|Russia|俄罗斯|莫斯科/i, flag: '🇷🇺' },
        { regex: /IN|India|印度|孟买/i, flag: '🇮🇳' },
        { regex: /AU|Australia|澳大利亚|悉尼/i, flag: '🇦🇺' },
        { regex: /CA|Canada|加拿大|蒙特利尔/i, flag: '🇨🇦' }
      ];
      for (let r of rules) if (r.regex.test(name)) return `${r.flag} ${name}`;
      return name;
    };

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
          if (link.startsWith('- {') || link.startsWith('- name:')) { proxies.push(`  ${link}`); continue; }
          if (link.startsWith('vless://')) {
            const u = new URL(link);
            const rawName = addFlag(decodeURIComponent(u.hash.substring(1)));
            const name = getUniqueName(rawName, 'vless');
            let proxy = `  - {name: "${name}", server: "${u.hostname}", port: ${u.port}, type: vless, uuid: "${u.username}"`;
            if (u.searchParams.get('security') === 'reality') {
              proxy += `, tls: true, flow: "${u.searchParams.get('flow') || 'xtls-rprx-vision'}", skip-cert-verify: true, reality-opts: {public-key: "${u.searchParams.get('pbk')}"}`;
              if(u.searchParams.get('sid')) proxy += `, short-id: "${u.searchParams.get('sid')}"`;
              proxy += `, servername: "${u.searchParams.get('sni')}", client-fingerprint: "${u.searchParams.get('fp') || 'chrome'}"`;
            }
            proxy += `}`; proxies.push(proxy);
          } 
          else if (link.startsWith('hysteria2://')) {
            const u = new URL(link);
            const name = getUniqueName(addFlag(decodeURIComponent(u.hash.substring(1))), 'hy2');
            const sni = u.searchParams.get('sni') || u.hostname;
            proxies.push(`  - {name: "${name}", server: "${u.hostname}", port: ${u.port}, type: hysteria2, password: "${u.username}", sni: "${sni}", skip-cert-verify: true, alpn: [h3]}`);
          }
          else if (link.startsWith('tuic://')) {
            const u = new URL(link);
            const name = getUniqueName(addFlag(decodeURIComponent(u.hash.substring(1))), 'tuic');
            const auth = decodeURIComponent(u.username).split(':');
            const sni = u.searchParams.get('sni') || u.hostname;
            proxies.push(`  - {name: "${name}", server: "${u.hostname}", port: ${u.port}, type: tuic, uuid: "${auth[0]}", password: "${auth[1]}", sni: "${sni}", skip-cert-verify: true, alpn: [h3], congestion-controller: bbr, udp-relay-mode: native}`);
          }
          else if (link.startsWith('vmess://')) {
            const b64 = link.substring(8).replace(/-/g, '+').replace(/_/g, '/');
            const pad = b64.length % 4;
            const paddedB64 = pad ? b64 + '='.repeat(4 - pad) : b64;
            const json = JSON.parse(decodeURIComponent(escape(atob(paddedB64))));
            const name = getUniqueName(addFlag(json.ps || "VMess"), 'vmess');
            let proxy = `  - {name: "${name}", server: "${json.add}", port: ${json.port}, type: vmess, uuid: "${json.id}", alterId: ${json.aid}, cipher: auto`;
            if (json.tls === 'tls') proxy += `, tls: true, skip-cert-verify: true, servername: "${json.host}"`;
            if (json.net === 'ws') proxy += `, network: ws, ws-opts: {path: "${json.path}", headers: {Host: "${json.host}"}}`;
            proxy += `}`; proxies.push(proxy);
          }
          else if (link.startsWith('ss://') || link.startsWith('trojan://') || link.startsWith('ssr://')) {
             proxies.push(`  # 暂不转换此协议至YAML: ${link}`);
          }
        } catch (e) { proxies.push(`  # 解析失败: ${link} -> ${e.message}`); }
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
      } catch (err) { return "proxies:\n  - {name: '加载远程模板失败', type: direct}\n" + proxiesStr; }

      let finalConfig = tmplText.replace(/^proxies:.*$/m, `proxies:\n${proxiesStr}`);
      if (finalConfig === tmplText) finalConfig = tmplText + "\nproxies:\n" + proxiesStr;
      return finalConfig;
    };

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
      } catch(e) { return new Response('Format Error', { status: 400 }); }
    }

    // ====================================================
    // 下发路由 (兼容 免存长链 与 KV短链)
    // ====================================================
    if (url.pathname.startsWith('/sub')) {
      let cfg = {};
      const shortId = url.pathname.split('/')[2];
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

      try {
        // 1. 如果是免存长链 (包含 ?data=xxx)
        if (url.searchParams.get('data')) {
           cfg.links = decodeURIComponent(escape(atob(url.searchParams.get('data'))));
           const tmplB64 = url.searchParams.get('tmpl');
           if (tmplB64) cfg.tmplUrl = atob(tmplB64);
           cfg.universal = url.searchParams.get('uni') === '1';
           cfg.filename = url.searchParams.get('name') || 'My_Config';
        } 
        // 2. 如果是 KV 云端短链
        else {
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
            if (isExpired) { await env.MY_KV.delete(shortId); return new Response('410: 订阅已过期', { status: 410 }); }
            if (cfg.maxDownloads) {
               if (!cfg.accessedIPs.includes(clientIP)) {
                   if (cfg.accessedIPs.length >= cfg.maxDownloads) return new Response(`403: IP 上限拦截\\nIP: ${clientIP}`, { status: 403 });
                   cfg.accessedIPs.push(clientIP); await env.MY_KV.put(shortId, JSON.stringify(cfg));
               }
            }
          }
        }

        // 组装最终响应
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
          --primary: #4f46e5; --primary-hover: #4338ca; --accent: #0ea5e9; --danger: #ef4444; --success: #10b981; --warning: #f59e0b;
          --bg-color: #f1f5f9; --text-main: #0f172a; --text-muted: #64748b; 
          --glass-bg: rgba(255, 255, 255, 0.4); --glass-border: rgba(255, 255, 255, 0.5); --input-bg: rgba(255, 255, 255, 0.6); --input-border: rgba(15, 23, 42, 0.1);
          --inner-highlight: inset 0 1px 1px rgba(255, 255, 255, 0.8);
          --shadow-card: 0 10px 30px -10px rgba(0, 0, 0, 0.08);
          --blur-radius: 16px;
        }
        
        [data-theme="dark"] {
          --bg-color: #0f172a; --text-main: #f8fafc; --text-muted: #94a3b8;
          --glass-bg: rgba(15, 23, 42, 0.65); --glass-border: rgba(255, 255, 255, 0.1); --input-bg: rgba(0, 0, 0, 0.2); --input-border: rgba(255, 255, 255, 0.1);
          --inner-highlight: inset 0 1px 1px rgba(255, 255, 255, 0.05);
          --shadow-card: 0 15px 35px -5px rgba(0, 0, 0, 0.4);
        }

        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.5); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.8); }

        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: var(--bg-color); color: var(--text-main); margin: 0; padding: 40px 20px; display: flex; justify-content: center; line-height: 1.6; transition: background-color 0.4s, color 0.4s; }

        ${bgImg ? `
        body { background-image: url('${bgImg}'); background-size: cover; background-position: center; background-attachment: fixed; }
        .card, .theme-toggle { background: var(--glass-bg) !important; backdrop-filter: blur(var(--blur-radius)) saturate(180%); -webkit-backdrop-filter: blur(var(--blur-radius)) saturate(180%); border: 1px solid var(--glass-border) !important; }
        ` : ''}

        .card { box-shadow: var(--shadow-card), var(--inner-highlight); }
        .container { width: 100%; max-width: 1100px; position: relative; z-index: 10; }
        
        .header { text-align: center; margin-bottom: 40px; transition: color 0.3s; }
        .header h1 { font-size: 32px; font-weight: 800; margin: 0 0 10px 0; letter-spacing: -0.5px; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
        .header p { color: var(--text-muted); font-size: 15px; margin: 0; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.1);}

        .grid-layout { display: grid; grid-template-columns: 1.1fr 1fr; gap: 32px; align-items: start; }
        .col-left { display: flex; flex-direction: column; gap: 24px; position: sticky; top: 32px; transform: translateZ(0); }
        .col-right { display: flex; flex-direction: column; gap: 24px; transform: translateZ(0); }

        @media (max-width: 900px) {
          body { padding: 30px 16px; }
          .grid-layout { grid-template-columns: 1fr; gap: 24px; }
          .col-left { position: relative; top: 0; }
        }

        .theme-toggle { position: fixed; top: 24px; right: 24px; width: 48px; height: 48px; border-radius: 50%; background: var(--bg-color); border: 1px solid var(--input-border); color: var(--text-main); display: flex; align-items: center; justify-content: center; font-size: 22px; cursor: pointer; box-shadow: var(--shadow-card); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 9999; }
        .theme-toggle:hover { transform: scale(1.05) translateY(-2px); }

        .card { background: var(--bg-color); border: 1px solid var(--input-border); border-radius: 20px; padding: 28px; transition: all 0.3s ease; }
        .card-title { font-size: 17px; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: var(--text-main); letter-spacing: -0.3px;}
        
        .tabs { display: flex; background: var(--input-bg); border-radius: 12px; padding: 6px; margin-bottom: 20px; border: 1px solid var(--input-border); box-shadow: var(--inner-highlight); }
        .tab-btn { flex: 1; padding: 10px; text-align: center; font-size: 14px; font-weight: 600; color: var(--text-muted); cursor: pointer; border-radius: 8px; transition: all 0.2s; user-select: none; }
        .tab-btn.active { background: var(--primary); color: #fff; box-shadow: 0 2px 8px rgba(79,70,229,0.3); }
        .tab-content { display: none; }
        .tab-content.active { display: block; animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        textarea, input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"], select { width: 100%; padding: 12px 16px; border: 1px solid var(--input-border); border-radius: 12px; background: var(--input-bg); color: var(--text-main); font-size: 14px; font-family: inherit; transition: all 0.2s ease; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); }
        textarea { height: 160px; font-family: 'JetBrains Mono', monospace; font-size: 13px; resize: vertical; }
        textarea:focus, input:focus, select:focus { outline: none; border-color: var(--primary) !important; background: var(--bg-color); box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.15); }
        
        .upload-area { border: 2px dashed var(--primary); border-radius: 16px; padding: 40px 20px; text-align: center; cursor: pointer; color: var(--primary); font-weight: 600; transition: all 0.3s; background: rgba(79, 70, 229, 0.03); }
        .upload-area:hover { background: rgba(79, 70, 229, 0.08); transform: scale(0.99); }
        .upload-desc { font-size: 13px; color: var(--text-muted); margin-top: 12px; font-weight: normal; line-height: 1.6;}

        .row { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid var(--input-border); flex-wrap: wrap; gap: 12px;}
        .row:first-of-type { padding-top: 0; }
        .row:last-child { border-bottom: none; padding-bottom: 0; }
        .row-text { flex: 1; min-width: 160px; }
        .row-text strong { display: block; font-size: 15px; margin-bottom: 4px; font-weight: 600; color: var(--text-main);}
        .row-text span { color: var(--text-muted); font-size: 13px; }

        .input-wrap { display: flex; align-items: center; gap: 12px; flex: 1; justify-content: flex-end; min-width: 180px; }

        .switch { position: relative; display: inline-block; width: 48px; height: 26px; flex-shrink: 0; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(148, 163, 184, 0.4); transition: .3s; border-radius: 26px; }
        .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .3s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        input:checked + .slider { background-color: var(--success); }
        input:checked + .slider:before { transform: translateX(22px); }

        .tmpl-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
        .tmpl-card { padding: 12px 16px; border: 1px solid var(--input-border); border-radius: 12px; background: var(--input-bg); cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); position: relative; color: var(--text-muted); flex: 1; min-width: 140px; text-align: center; box-shadow: var(--inner-highlight);}
        .tmpl-card:hover { border-color: var(--primary); color: var(--text-main); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .tmpl-card.active { border-color: var(--primary) !important; background: rgba(79, 70, 229, 0.1) !important; color: var(--primary) !important; font-weight: 700; }
        .tmpl-card .del-btn { position: absolute; top:-8px; right:-8px; background: var(--danger); color: white; border-radius: 50%; width: 22px; height: 22px; text-align: center; line-height: 20px; font-size: 14px; display: none; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4); z-index: 2;}
        .tmpl-card:hover .del-btn { display: block; }

        .btn-primary { width: 100%; padding: 18px; border: none; border-radius: 16px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: #fff; font-weight: 700; font-size: 17px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 6px 20px rgba(79, 70, 229, 0.3); margin-top: auto; }
        .btn-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 25px rgba(79, 70, 229, 0.4); }
        
        .btn-sub { padding: 12px 18px; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s; }
        
        .alert-box { background: rgba(245, 158, 11, 0.1); border-left: 4px solid var(--warning); padding: 14px 18px; border-radius: 0 12px 12px 0; margin-top: 16px; font-size: 14px; color: #d97706; line-height: 1.5; }
        .hidden { display: none !important; }
        
        .traffic-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--input-border);}
      </style>
    </head>
    <body>

      <button class="theme-toggle" onclick="toggleTheme()" title="切换日夜模式"><span id="themeIcon">🌙</span></button>

      <div class="container">
        <div class="header">
          <h1>✈️ Pro 控制台</h1>
          <p>商业级订阅分发与安全管理中心</p>
        </div>

        <div class="grid-layout">
          
          <div class="col-left">
            <div class="card" style="margin-bottom: 0;">
              <div class="tabs">
                <div class="tab-btn active" onclick="switchTab('paste')" id="tab-paste">📄 剪贴板</div>
                <div class="tab-btn" onclick="switchTab('file')" id="tab-file">⬆️ 文件上传</div>
                <div class="tab-btn" onclick="switchTab('url')" id="tab-url">🔗 订阅链接</div>
              </div>
              <div id="content-paste" class="tab-content active">
                <textarea id="inputLinks" placeholder="支持:&#10;• 单条节点 (vless://, hy2:// 等)&#10;• Base64 订阅密文&#10;• 完整的 Clash YAML 配置"></textarea>
              </div>
              <div id="content-file" class="tab-content">
                <div class="upload-area" id="dropZone" onclick="document.getElementById('fileInput').click()">
                   <div style="font-size: 32px; margin-bottom: 12px;">📂</div>
                   <div id="fileStatus" style="font-size: 15px;">点击选择文件，或将文件拖拽到此处</div>
                   <div class="upload-desc">支持 .txt, .yaml, .json 等文本配置<br>严禁上传图片或压缩包</div>
                </div>
                <input type="file" id="fileInput" accept=".txt,.yaml,.yml,.json,.ini,.conf" style="display:none;" onchange="handleFile(this.files[0])">
              </div>
              <div id="content-url" class="tab-content">
                <input type="text" id="inputUrl" placeholder="输入机场订阅链接..." style="padding: 18px;">
                <div class="upload-desc">由服务器端代为拉取，无视跨域与防火墙拦截。</div>
              </div>
            </div>

            <div class="card" id="tmplPanel" style="margin-bottom: 0;">
              <div class="card-title">🔗 路由模板挂载 (仅 Clash 生效)</div>
              <div class="tmpl-grid" id="tmplGrid">加载中...</div>
              <div class="hidden" id="addTmplArea" style="margin-top:20px;">
                <div style="display: flex; gap:12px; margin-bottom:12px; flex-wrap: wrap;">
                  <input type="text" id="newTmplName" placeholder="模板别名" style="flex:1; min-width: 100px;">
                  <input type="text" id="newTmplUrl" placeholder="https://raw..." style="flex:2; min-width: 180px;">
                </div>
                <div style="display: flex; gap:12px;">
                  <button onclick="saveNewTmpl('local')" class="btn-sub" style="flex:1; background: var(--input-bg); color: var(--text-main); border: 1px solid var(--input-border);">💻 本地存留</button>
                  <button onclick="saveNewTmpl('cloud')" class="btn-sub" style="flex:1; background: var(--primary); color: white;">☁️ 云端同步</button>
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 16px;">
              <button class="btn-primary" id="generateBtn" onclick="generateLink()" style="flex: 2;">🚀 生成云端短链</button>
              <button class="btn-primary" id="generateLongBtn" onclick="generateLong()" style="flex: 1; background: var(--input-bg); color: var(--text-main); border: 1px solid var(--input-border); box-shadow: none;">🎈 免存长链</button>
            </div>

            <div id="resultArea" class="card hidden" style="border: 2px solid var(--success) !important; margin-bottom: 0; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.15);">
              <div style="color: var(--success); font-weight: 800; font-size: 16px; margin-bottom: 16px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>✅</span> 链接已生成成功
              </div>
              <input type="text" id="subUrl" style="text-align: center; font-weight: 600; color: var(--primary); font-size: 15px; padding: 16px; background: rgba(79, 70, 229, 0.05);" readonly>
              <div style="display: flex; gap: 16px; margin-top: 20px; flex-wrap: wrap;">
                <button onclick="window.open(document.getElementById('subUrl').value)" class="btn-sub" style="flex: 1; min-width: 140px; background: var(--input-bg); color: var(--text-main); border: 1px solid var(--input-border);">👀 浏览器预览</button>
                <button onclick="copyUrl()" class="btn-sub" style="flex: 1; min-width: 140px; background: var(--primary); color: white; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">📋 一键复制</button>
              </div>
            </div>
          </div>

          <div class="col-right">
            <div class="card">
              <div class="card-title">⚙️ 基础设置</div>
              <div class="row">
                <div class="row-text"><strong>配置显示名</strong><span>导入后显示的文件名</span></div>
                <div class="input-wrap"><input type="text" id="filename" placeholder="如: 我的网络"></div>
              </div>
              <div class="row">
                <div class="row-text"><strong>短链接后缀</strong><span>留空随机生成</span></div>
                <div class="input-wrap"><input type="text" id="alias" placeholder="如: myvip"></div>
              </div>
              <div class="row">
                <div class="row-text"><strong>通用订阅格式</strong><span>Base64 兼容全平台</span></div>
                <label class="switch"><input type="checkbox" id="universal" onchange="toggleUniversal()"><span class="slider"></span></label>
              </div>
              <div id="universalWarning" class="alert-box hidden">
                ⚠️ <b>注意：</b>开启后路由模板与分流规则将失效。
              </div>
            </div>

            <div class="card">
              <div class="card-title">🛡️ 高级安全管理</div>
              <div class="row">
                <div class="row-text"><strong>精确自动过期</strong><span>到期后彻底销毁链接</span></div>
                <label class="switch"><input type="checkbox" id="enableExpire" onchange="document.getElementById('expireSettings').classList.toggle('hidden')"><span class="slider"></span></label>
              </div>
              <div id="expireSettings" class="hidden" style="margin-top: 12px; padding-top: 16px; border-top: 1px dashed var(--input-border); display: flex; gap: 12px; flex-wrap: wrap;">
                <select id="expireType" onchange="toggleExpireInput()" style="flex:1; min-width: 110px;">
                  <option value="days">按天数</option><option value="hours">按小时</option><option value="date">指定日期</option>
                </select>
                <input type="number" id="expireNum" placeholder="数值..." style="flex:1; min-width: 110px;">
                <input type="datetime-local" id="expireDate" class="hidden" style="width:100%;">
              </div>
              
              <div class="row">
                <div class="row-text"><strong>独立 IP 防泄露</strong><span>限制允许拉取的网络数</span></div>
                <div class="input-wrap" style="max-width: 100px;"><input type="number" id="maxDown" placeholder="IP数"></div>
              </div>
              <div class="row">
                <div class="row-text"><strong>阅后即焚模式</strong><span>拉取一次即刻自毁</span></div>
                <label class="switch"><input type="checkbox" id="burnMode"><span class="slider"></span></label>
              </div>
              <div class="row">
                <div class="row-text"><strong>伪装流量数据</strong><span>展示饼图及到期日期</span></div>
                <label class="switch"><input type="checkbox" onchange="document.getElementById('trafficArea').classList.toggle('hidden')"><span class="slider"></span></label>
              </div>
              <div id="trafficArea" class="hidden traffic-grid">
                <input type="text" id="tUp" placeholder="上传 (10G)">
                <input type="text" id="tDown" placeholder="下载 (50G)">
                <input type="text" id="tTotal" placeholder="总计 (200G)">
                <input type="date" id="tExpireDate" style="grid-column: 1 / -1;">
              </div>
            </div>
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
            return alert('❌ 不支持的文件格式！仅支持纯文本。');
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            uploadedFileText = e.target.result;
            document.getElementById('fileStatus').innerHTML = \`✅ <b style="color:var(--success)">已成功加载:</b> \${file.name} <br>大小: \${(file.size/1024).toFixed(2)} KB\`;
            dropZone.style.background = 'rgba(16, 185, 129, 0.05)';
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
          document.getElementById('tmplGrid').appendChild(div);
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

        // --- 生成云端短链 ---
        async function generateLink() {
          const btn = document.getElementById('generateBtn');
          const oldText = btn.innerText;
          btn.innerText = '⏳ 处理中...';
          try {
            const links = await getFinalInputText();
            if (!links) throw new Error('解析到的内容为空');

            let maxDownVal = document.getElementById('maxDown').value;
            const payload = {
              links: links,
              filename: document.getElementById('filename').value.trim(),
              alias: document.getElementById('alias').value.trim(),
              universal: document.getElementById('universal').checked,
              tmplUrl: currentSelectedUrl,
              maxDownloads: maxDownVal ? parseInt(maxDownVal) : null,
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
          } finally { btn.innerText = oldText; }
        }

        // --- 生成免存长链 ---
        async function generateLong() {
          const btn = document.getElementById('generateLongBtn');
          const originalText = btn.innerText;
          btn.innerText = '⏳ 打包中...';
          try {
            const links = await getFinalInputText();
            if (!links) throw new Error('解析到的内容为空');

            const encodedData = btoa(unescape(encodeURIComponent(links)));
            let finalUrl = domain + '?data=' + encodedData;
            
            if (document.getElementById('universal').checked) {
               finalUrl += '&uni=1';
            } else if (currentSelectedUrl) {
               finalUrl += '&tmpl=' + btoa(currentSelectedUrl);
            }
            
            const filename = document.getElementById('filename').value.trim();
            if (filename) finalUrl += '&name=' + encodeURIComponent(filename);

            document.getElementById('subUrl').value = finalUrl;
            document.getElementById('resultArea').classList.remove('hidden');
            
            alert('💡 提示：您生成了免存长链。因为数据并未存入云端，右侧面板中的「安全控制」和「流量面板」功能对长链无效。但配置改名与路由模板依然生效！');
          } catch(e) {
            alert('❌ 失败: ' + e.message);
          } finally { btn.innerText = originalText; }
        }

        async function copyUrl() { document.getElementById('subUrl').select(); try { await navigator.clipboard.writeText(document.getElementById('subUrl').value); alert('✅ 链接已复制！');} catch(e){} }
        window.onload = fetchCloudTmpls;
      </script>
    </body>
    </html>
    `;

    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' }});
  }
};
