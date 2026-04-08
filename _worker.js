const CONFIG = { KV_TMPL_KEY: "__sys_cloud_templates__" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const textRes = (text, status = 200, headers = {}) =>
      new Response(text, { status, headers });

    const jsonRes = (data, status = 200, headers = {}) =>
      new Response(typeof data === "string" ? data : JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
      });

    /* =========================
     * 模块1：通用工具
     * ========================= */

    const addFlag = (name) => {
      name = String(name || "").trim() || "未命名";
      if (/🇭🇰|🇹🇼|🇯🇵|🇸🇬|🇰🇷|🇺🇸|🇬🇧|🇫🇷|🇩🇪|🇳🇱|🇷🇺|🇮🇳|🇦🇺|🇨🇦/.test(name)) return name;
      const rules = [
        [/(\b|[^A-Z])(HK|Hong Kong|香港|深港|广港|沪港)(\b|[^A-Z])/i, "🇭🇰"],
        [/(\b|[^A-Z])(TW|Taiwan|台湾|台灣|台北|新北|广台)(\b|[^A-Z])/i, "🇹🇼"],
        [/(\b|[^A-Z])(JP|Japan|日本|东京|大阪|埼玉|广日)(\b|[^A-Z])/i, "🇯🇵"],
        [/(\b|[^A-Z])(SG|Singapore|新加坡|狮城|广新)(\b|[^A-Z])/i, "🇸🇬"],
        [/(\b|[^A-Z])(KR|Korea|韩国|首尔|春川|广韩)(\b|[^A-Z])/i, "🇰🇷"],
        [/(\b|[^A-Z])(US|America|United States|美国|洛杉矶|圣何塞|纽约|西雅图|芝加哥|波特兰|达拉斯|广美)(\b|[^A-Z])/i, "🇺🇸"],
        [/(\b|[^A-Z])(UK|Britain|英国|伦敦)(\b|[^A-Z])/i, "🇬🇧"],
        [/(\b|[^A-Z])(FR|France|法国|巴黎)(\b|[^A-Z])/i, "🇫🇷"],
        [/(\b|[^A-Z])(DE|Germany|德国|法兰克福)(\b|[^A-Z])/i, "🇩🇪"],
        [/(\b|[^A-Z])(NL|Netherlands|荷兰|阿姆斯特丹)(\b|[^A-Z])/i, "🇳🇱"],
        [/(\b|[^A-Z])(RU|Russia|俄罗斯|莫斯科)(\b|[^A-Z])/i, "🇷🇺"],
        [/(\b|[^A-Z])(IN|India|印度|孟买)(\b|[^A-Z])/i, "🇮🇳"],
        [/(\b|[^A-Z])(AU|Australia|澳大利亚|悉尼)(\b|[^A-Z])/i, "🇦🇺"],
        [/(\b|[^A-Z])(CA|Canada|加拿大|蒙特利尔)(\b|[^A-Z])/i, "🇨🇦"]
      ];
      for (const [r, f] of rules) if (r.test(name)) return `${f} ${name}`;
      return name;
    };

    const tryDecodeBase64 = (str) => {
      try {
        let s = String(str || "").replace(/\s+/g, "");
        if (/^[A-Za-z0-9+/=._-]+$/.test(s) && s.length > 20 && !String(str).includes("- name:")) {
          s = s.replace(/-/g, "+").replace(/_/g, "/");
          const pad = s.length % 4;
          if (pad) s += "=".repeat(4 - pad);
          const decoded = decodeURIComponent(escape(atob(s)));
          if (decoded.includes("://") || decoded.includes("proxies:") || decoded.includes("- name:")) return decoded;
        }
      } catch {}
      return str;
    };

    const extractProxies = (text) => {
      text = String(text || "");
      if (text.includes("proxies:")) {
        const m = text.match(/proxies:\s*([\s\S]*)/i);
        if (m) return m[1].trim();
      }
      return text.trim();
    };

    const splitProxyBlocks = (text) => {
      const lines = String(text || "").split(/\r?\n/);
      const blocks = [];
      let current = [];
      for (const raw of lines) {
        const line = raw.replace(/\r/g, "");
        if (/^\s*-\s+name:/i.test(line) || /^\s*-\s*\{/i.test(line)) {
          if (current.length) blocks.push(current.join("\n"));
          current = [line];
        } else {
          if (current.length) current.push(line);
          else if (line.trim()) blocks.push(line);
        }
      }
      if (current.length) blocks.push(current.join("\n"));
      return blocks.map(x => x.trim()).filter(Boolean);
    };

    const parseSimpleYamlBlock = (block) => {
      const obj = {};
      const lines = String(block || "").trim().split(/\r?\n/);
      lines.forEach((line, i) => {
        line = line.replace(/\r/g, "").trimEnd();
        if (i === 0) {
          const m = line.trim().match(/^-\s*name:\s*(.+)$/i);
          if (m) obj.name = m[1].trim().replace(/^['"]|['"]$/g, "");
          return;
        }
        line = line.trim();
        const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (m) obj[m[1].trim()] = (m[2] || "").trim().replace(/^['"]|['"]$/g, "");
      });
      return obj;
    };

    const buildProxyLine = (obj) => {
      const parts = [];
      for (const [k, v] of Object.entries(obj)) {
        if (v === "" || v === null || typeof v === "undefined") continue;
        if (Array.isArray(v)) {
          parts.push(`${k}: [${v.map(x => typeof x === "number" ? x : `"${String(x).replace(/"/g, '\\"')}"`).join(", ")}]`);
        } else if (typeof v === "object") {
          const sub = [];
          for (const [kk, vv] of Object.entries(v)) {
            if (Array.isArray(vv)) {
              sub.push(`${kk}: [${vv.map(x => typeof x === "number" ? x : `"${String(x).replace(/"/g, '\\"')}"`).join(", ")}]`);
            } else if (typeof vv === "object" && vv !== null) {
              const mini = [];
              for (const [mk, mv] of Object.entries(vv)) mini.push(`${mk}: ${typeof mv === "number" ? mv : `"${String(mv).replace(/"/g, '\\"')}"`}`);
              sub.push(`${kk}: {${mini.join(", ")}}`);
            } else {
              sub.push(`${kk}: ${vv === "true" || vv === "false" || typeof vv === "number" ? vv : `"${String(vv).replace(/"/g, '\\"')}"`}`);
            }
          }
          parts.push(`${k}: {${sub.join(", ")}}`);
        } else {
          parts.push(`${k}: ${v === "true" || v === "false" || typeof v === "number" ? v : `"${String(v).replace(/"/g, '\\"')}"`}`);
        }
      }
      return `  - {${parts.join(", ")}}`;
    };

    const isSs2022Cipher = (cipher) => {
      const c = String(cipher || "").trim().toLowerCase();
      return [
        "2022-blake3-aes-128-gcm",
        "2022-blake3-aes-256-gcm",
        "2022-blake3-chacha20-poly1305"
      ].includes(c);
    };

    const dedupeProxyGroups = (yamlText) => {
      const lines = String(yamlText || "").split(/\r?\n/);
      const out = [];
      const seen = new Set();

      let inGroups = false;
      let skipBlock = false;
      let currentIndent = null;

      for (const line of lines) {
        if (/^proxy-groups:\s*$/.test(line.trim())) {
          inGroups = true;
          skipBlock = false;
          currentIndent = null;
          out.push(line);
          continue;
        }

        if (inGroups) {
          if (/^[A-Za-z0-9_-]+:\s*$/.test(line.trim()) && !/^\s/.test(line)) {
            inGroups = false;
            skipBlock = false;
            currentIndent = null;
            out.push(line);
            continue;
          }

          const m = line.match(/^(\s*)-\s+name:\s*(.+)\s*$/);
          if (m) {
            const indent = m[1].length;
            const name = m[2].trim().replace(/^['"]|['"]$/g, "");
            if (seen.has(name)) {
              skipBlock = true;
              currentIndent = indent;
              continue;
            }
            seen.add(name);
            skipBlock = false;
            currentIndent = indent;
            out.push(line);
            continue;
          }

          if (skipBlock) {
            if (/^\s+/.test(line)) {
              const lineIndent = line.length - line.trimStart().length;
              if (currentIndent !== null && lineIndent > currentIndent) continue;
            }
            skipBlock = false;
            currentIndent = null;
          }
        }

        out.push(line);
      }

      return out.join("\n");
    };

    /* =========================
     * 模块2：节点解析
     * ========================= */

    const parseYamlProxyBlock = (block, processName) => {
      const trim = String(block || "").trim();
      if (!trim) return null;

      if (trim.startsWith("- {")) {
        const rep = trim.replace(/(name:\s*['"]?)([^'",}]+)(['"]?)/i, (_, a, b, c) => a + processName(String(b).trim()) + c);
        return `  ${rep}`;
      }

      if (!/^\s*-\s*name:/i.test(trim)) return null;

      const o = parseSimpleYamlBlock(trim);
      if (!o.name || !o.type) return `  # 无法识别代理块: ${trim.replace(/\n/g, " | ")}`;

      const name = processName(o.name);
      const type = String(o.type).trim().toLowerCase();

      if (["direct","block","reject","dns","urltest","select","fallback","load-balance","relay","selector"].includes(type)) return null;

      if (type === "vless") {
        const proxy = { name, server: o.server || "", port: Number(o.port || 0), type: "vless", uuid: o.uuid || "", encryption: "none" };
        if (o.tls && o.tls !== "false") proxy.tls = "true";
        if (o.servername) proxy.servername = o.servername;
        if (o.network) proxy.network = o.network;
        return buildProxyLine(proxy);
      }

      if (type === "ss" || type === "shadowsocks") {
        const cipher = String(o.cipher || "").trim();
        const password = String(o.password || "");
        if (!cipher || !password) return `  # 无效 SS 节点: ${name}`;
        if (isSs2022Cipher(cipher)) return `  # 跳过 SS2022 节点: ${name}`;
        return buildProxyLine({ name, server: o.server || "", port: Number(o.port || 0), type: "ss", cipher, password, udp: "true" });
      }

      if (type === "trojan") {
        const password = String(o.password || "");
        if (!password) return `  # 无效 Trojan 节点: ${name}`;
        return buildProxyLine({ name, server: o.server || "", port: Number(o.port || 0), type: "trojan", password, sni: o.sni || o.servername || o.server || "", "skip-cert-verify": "true" });
      }

      if (type === "vmess") {
        let cipher = String(o.cipher || "").trim();
        if (!cipher) cipher = "auto";
        const proxy = { name, server: o.server || "", port: Number(o.port || 0), type: "vmess", uuid: o.uuid || "", alterId: Number(o.alterId || 0), cipher };
        if (o.tls && o.tls !== "false") { proxy.tls = "true"; proxy["skip-cert-verify"] = "true"; }
        if (o.servername) proxy.servername = o.servername;
        if (o.network) proxy.network = o.network;
        return buildProxyLine(proxy);
      }

      if (type === "hysteria2") {
        const password = String(o.password || "");
        if (!password) return `  # 无效 Hysteria2 节点: ${name}`;
        return buildProxyLine({ name, server: o.server || "", port: Number(o.port || 0), type: "hysteria2", password, sni: o.sni || o.server || "", "skip-cert-verify": "true", alpn: ["h3"] });
      }

      if (type === "tuic") {
        const uuid = String(o.uuid || "");
        const password = String(o.password || "");
        if (!uuid || !password) return `  # 无效 TUIC 节点: ${name}`;
        return buildProxyLine({ name, server: o.server || "", port: Number(o.port || 0), type: "tuic", uuid, password, sni: o.sni || o.server || "", "skip-cert-verify": "true", alpn: ["h3"], "congestion-controller": "bbr", "udp-relay-mode": "native" });
      }

      return null;
    };

    const parseShareLink = (line, processName) => {
      try {
        if (line.startsWith("vless://")) {
          const u = new URL(line);
          const name = processName(decodeURIComponent(u.hash.substring(1) || "VLESS"));
          const proxy = { name, server: u.hostname, port: Number(u.port || 0), type: "vless", uuid: u.username, encryption: u.searchParams.get("encryption") || "none" };
          const sec = u.searchParams.get("security") || "";
          if (sec === "tls" || sec === "reality") {
            proxy.tls = "true";
            proxy["skip-cert-verify"] = "true";
            proxy.servername = u.searchParams.get("sni") || u.hostname;
          }
          if (u.searchParams.get("flow")) proxy.flow = u.searchParams.get("flow");
          const net = u.searchParams.get("type") || "tcp";
          if (net === "ws") {
            proxy.network = "ws";
            proxy["ws-opts"] = { path: u.searchParams.get("path") || "/", headers: { Host: u.searchParams.get("host") || u.searchParams.get("sni") || u.hostname } };
          } else if (net === "grpc") {
            proxy.network = "grpc";
            proxy["grpc-opts"] = { "grpc-service-name": u.searchParams.get("serviceName") || u.searchParams.get("service-name") || "" };
          } else if (net === "http" || net === "h2") {
            proxy.network = "http";
          } else proxy.network = "tcp";
          return buildProxyLine(proxy);
        }

        if (line.startsWith("vmess://")) {
          let b64 = line.substring(8).replace(/-/g, "+").replace(/_/g, "/");
          const pad = b64.length % 4;
          if (pad) b64 += "=".repeat(4 - pad);
          const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
          const name = processName(json.ps || "VMess");
          let cipher = String(json.scy || "").trim();
          if (!cipher) cipher = "auto";
          const proxy = { name, server: json.add || "", port: Number(json.port || 0), type: "vmess", uuid: json.id || "", alterId: Number(json.aid || 0), cipher };
          if (json.tls === "tls") {
            proxy.tls = "true";
            proxy["skip-cert-verify"] = "true";
            proxy.servername = json.sni || json.host || json.add || "";
          }
          if (json.net === "ws") {
            proxy.network = "ws";
            proxy["ws-opts"] = { path: json.path || "/", headers: { Host: json.host || json.add || "" } };
          } else if (json.net === "grpc") {
            proxy.network = "grpc";
            proxy["grpc-opts"] = { "grpc-service-name": json.path || json.serviceName || "" };
          } else proxy.network = "tcp";
          return buildProxyLine(proxy);
        }

        if (line.startsWith("trojan://")) {
          const u = new URL(line);
          const password = decodeURIComponent(u.username || "");
          if (!password) return null;
          const name = processName(decodeURIComponent(u.hash.substring(1) || "Trojan"));
          const proxy = { name, server: u.hostname, port: Number(u.port || 0), type: "trojan", password, sni: u.searchParams.get("sni") || u.hostname, "skip-cert-verify": "true" };
          if (u.searchParams.get("type") === "ws") {
            proxy.network = "ws";
            proxy["ws-opts"] = { path: u.searchParams.get("path") || "/", headers: { Host: u.searchParams.get("host") || u.searchParams.get("sni") || u.hostname } };
          } else if (u.searchParams.get("type") === "grpc") {
            proxy.network = "grpc";
            proxy["grpc-opts"] = { "grpc-service-name": u.searchParams.get("serviceName") || u.searchParams.get("service-name") || "" };
          }
          return buildProxyLine(proxy);
        }

        if (line.startsWith("ss://")) {
          let name = "SS";
          if (line.includes("#")) name = decodeURIComponent(line.split("#").pop());
          name = processName(name);

          let cipher = "", password = "", host = "", port = 0;
          let body = line.substring(5).split("#")[0].split("?")[0];

          if (body.includes("@")) {
            const [a, hp] = body.split("@", 2);
            try {
              const cred = decodeURIComponent(escape(atob(a.replace(/-/g, "+").replace(/_/g, "/"))));
              if (cred.includes(":")) [cipher, password] = cred.split(":", 2);
            } catch {
              try {
                const u = new URL("scheme://" + body);
                cipher = u.username || "";
                password = u.password || "";
                host = u.hostname || "";
                port = Number(u.port || 0);
              } catch {}
            }
            if (!host && hp.includes(":")) {
              const x = hp.split(":");
              host = x[0];
              port = Number(x[1] || 0);
            }
          } else {
            try {
              const decoded = decodeURIComponent(escape(atob(body.replace(/-/g, "+").replace(/_/g, "/"))));
              if (decoded.includes("@")) {
                const [creds, hp] = decoded.split("@", 2);
                if (creds.includes(":")) [cipher, password] = creds.split(":", 2);
                if (hp.includes(":")) {
                  const x = hp.split(":");
                  host = x[0];
                  port = Number(x[1] || 0);
                }
              }
            } catch {}
          }

          if (!cipher || !password) return null;
          if (isSs2022Cipher(cipher)) return `  # 跳过 SS2022 节点: ${name}`;
          return buildProxyLine({ name, server: host, port, type: "ss", cipher, password, udp: "true" });
        }

        if (line.startsWith("hysteria2://")) {
          const u = new URL(line);
          const password = decodeURIComponent(u.username || "");
          if (!password) return null;
          const name = processName(decodeURIComponent(u.hash.substring(1) || "Hysteria2"));
          return buildProxyLine({ name, server: u.hostname, port: Number(u.port || 0), type: "hysteria2", password, sni: u.searchParams.get("sni") || u.hostname, "skip-cert-verify": "true", alpn: ["h3"] });
        }

        if (line.startsWith("tuic://")) {
          const u = new URL(line);
          const auth = decodeURIComponent(u.username || "").split(":");
          const uuid = auth[0] || "";
          const password = auth[1] || "";
          if (!uuid || !password) return null;
          const name = processName(decodeURIComponent(u.hash.substring(1) || "TUIC"));
          return buildProxyLine({ name, server: u.hostname, port: Number(u.port || 0), type: "tuic", uuid, password, sni: u.searchParams.get("sni") || u.hostname, "skip-cert-verify": "true", alpn: ["h3"], "congestion-controller": "bbr", "udp-relay-mode": "native" });
        }

        if (/^\s*type:\s*/i.test(line) || /^\s*server:\s*/i.test(line) || /^\s*port:\s*/i.test(line)) return null;
        return `  # 暂不转换此协议: ${line}`;
      } catch {
        return `  # 解析失败: ${line}`;
      }
    };

    const parseLinksToArray = (linksStr, replaceRule) => {
      let s = extractProxies(tryDecodeBase64(linksStr));
      const blocks = splitProxyBlocks(s);
      const proxies = [];
      const nameCount = {};

      const processName = (raw) => {
        let n = String(raw || "").trim();
        if (replaceRule && replaceRule.find) {
          try { n = n.replace(new RegExp(replaceRule.find, "gi"), replaceRule.replace || ""); } catch {}
        }
        n = addFlag(n);
        if (nameCount[n]) {
          const idx = nameCount[n];
          nameCount[n]++;
          return `${n}-${idx}`;
        }
        nameCount[n] = 1;
        return n;
      };

      for (const block of blocks) {
        const line = String(block || "").trim();
        if (!line) continue;
        if (/^\s*-\s*name:/i.test(line) || /^\s*-\s*\{/i.test(line)) {
          const x = parseYamlProxyBlock(line, processName);
          if (x) proxies.push(x);
        } else {
          const x = parseShareLink(line, processName);
          if (x) proxies.push(x);
        }
      }
      return proxies.join("\n");
    };

    const buildConfig = async (rawLinks, tmplUrl, replaceRule) => {
      const proxiesStr = parseLinksToArray(rawLinks, replaceRule);
      if (!tmplUrl) return "proxies:\n" + proxiesStr;

      let tmplText = "";
      try {
        const res = await fetch(tmplUrl);
        if (!res.ok) throw new Error("Fetch failed");
        tmplText = await res.text();
      } catch {
        return "proxies:\n" + proxiesStr;
      }

      tmplText = dedupeProxyGroups(tmplText);

      let out = tmplText.replace(/^proxies:\s*$/m, `proxies:\n${proxiesStr}`);
      if (out === tmplText) out = tmplText.replace(/proxies:\s*\n/m, `proxies:\n${proxiesStr}\n`);
      if (out === tmplText) out = tmplText + "\nproxies:\n" + proxiesStr;
      return out;
    };

    /* =========================
     * 模块3：API
     * ========================= */

if (url.pathname === "/api/list_subs" && request.method === "POST") {
  try {
    const body = await request.json();
    if (body.pwd !== env.ADMIN_PWD) return textRes("密码错误", 403);

    const list = await env.MY_KV.list();
    const subs = [];
    for (const key of list.keys) {
      if (key.name === CONFIG.KV_TMPL_KEY) continue;
      const meta = key.metadata || {};
      subs.push({
        id: key.name,
        name: meta.name || "未命名",
        remark: meta.remark || "",
        createdAt: meta.createdAt || 0,
        accessed: meta.accessed || 0,
        max: meta.max || "无",
        burn: meta.burn || false
      });
    }
    subs.sort((a, b) => b.createdAt - a.createdAt);
    return jsonRes(subs);
  } catch {
    return textRes("Error", 500);
  }
}

    if (url.pathname === "/api/del_sub" && request.method === "POST") {
      try {
        const body = await request.json();
        if (body.pwd !== env.ADMIN_PWD) return textRes("密码错误", 403);
        if (body.id && body.id !== CONFIG.KV_TMPL_KEY) await env.MY_KV.delete(body.id);
        return textRes("OK");
      } catch {
        return textRes("Error", 500);
      }
    }

    if (url.pathname === "/api/del_batch" && request.method === "POST") {
      try {
        const body = await request.json();
        if (body.pwd !== env.ADMIN_PWD) return textRes("密码错误", 403);
        const ids = Array.isArray(body.ids) ? body.ids : [];
        let deleted = 0;
        for (const id of ids) {
          if (id && id !== CONFIG.KV_TMPL_KEY) {
            await env.MY_KV.delete(id);
            deleted++;
          }
        }
        return jsonRes({ ok: true, deleted });
      } catch {
        return textRes("Error", 500);
      }
    }

    if (url.pathname === "/api/tmpl") {
      if (request.method === "GET") {
        const data = await env.MY_KV.get(CONFIG.KV_TMPL_KEY);
        return jsonRes(data || "[]");
      }
      if (request.method === "POST") {
        try {
          const body = await request.json();
          if (body.pwd !== env.ADMIN_PWD) return textRes("密码错误", 403);
          await env.MY_KV.put(CONFIG.KV_TMPL_KEY, JSON.stringify(body.tmpls || []));
          return textRes("OK");
        } catch {
          return textRes("数据错误", 400);
        }
      }
    }

    if (url.pathname === "/api/fetch" && request.method === "POST") {
      try {
        const body = await request.json();
        if (!body.subUrl) return textRes("No URL", 400);

        const res = await fetch(body.subUrl, { headers: { "User-Agent": "ClashMeta/1.14.0" } });
        if (!res.ok) throw new Error("拉取失败");

        const text = await res.text();
        let name = res.headers.get("profile-title") || "";
        const disp = res.headers.get("content-disposition");

        if (!name && disp) {
          const m = disp.match(/filename\*?=UTF-8''([^'";\n]*)/i) || disp.match(/filename=["']?([^'";\n]+)["']?/i);
          if (m) name = decodeURIComponent(m[1]).replace(/\.(txt|yaml|yml|json)$/i, "");
        }
        return jsonRes({ text, name });
      } catch (e) {
        return textRes(e.message, 500);
      }
    }

    if (url.pathname === "/api/shorten" && request.method === "POST") {
  try {
    const payload = await request.json();
    if (!payload.links) return textRes("Empty", 400);

    const shortId = payload.alias ? encodeURIComponent(payload.alias) : Math.random().toString(36).substring(2, 8);
    payload.createdAt = Date.now();
    payload.accessedIPs = [];
    payload.remark = (payload.remark || "").trim();

    await env.MY_KV.put(shortId, JSON.stringify(payload), {
      metadata: {
        name: payload.filename || "未命名",
        remark: payload.remark || "",
        createdAt: payload.createdAt,
        max: payload.maxDownloads || "无",
        burn: payload.burn || false,
        accessed: 0
      }
    });

    return textRes(shortId);
  } catch {
    return textRes("Format Error", 400);
  }
}

    /* =========================
     * 模块4：订阅输出
     * ========================= */

    if (url.pathname.startsWith("/sub")) {
      let cfg = {};
      const shortId = url.pathname.split("/")[2];
      const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

      try {
        if (!shortId) return textRes("Invalid ID", 400);
        const kvData = await env.MY_KV.get(shortId);
        if (!kvData) return textRes("404: 订阅不存在或已被销毁", 404);

        cfg = JSON.parse(kvData);
        if (!cfg.accessedIPs) cfg.accessedIPs = [];

        if (cfg.burn) {
          await env.MY_KV.delete(shortId);
        } else {
          const now = Date.now();
          const isExpired = (cfg.expireAt && now > cfg.expireAt) || (cfg.expireDays && now > cfg.createdAt + cfg.expireDays * 86400000);
          if (isExpired) {
            await env.MY_KV.delete(shortId);
            return textRes("410: 订阅已过期", 410);
          }

          if (cfg.maxDownloads && !cfg.accessedIPs.includes(clientIP)) {
            if (cfg.accessedIPs.length >= cfg.maxDownloads) return textRes(`403: IP 上限拦截\nIP: ${clientIP}`, 403);
            cfg.accessedIPs.push(clientIP);
            await env.MY_KV.put(shortId, JSON.stringify(cfg), {
              metadata: {
                name: cfg.filename || "未命名",
                createdAt: cfg.createdAt,
                max: cfg.maxDownloads || "无",
                burn: cfg.burn || false,
                accessed: cfg.accessedIPs.length
              }
            });
          }
        }

        const filename = cfg.filename ? encodeURIComponent(cfg.filename) : "My_Config";
        const headers = {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `inline; filename="${filename}.${cfg.universal ? "txt" : "yaml"}"`,
          "Profile-Update-Interval": "12",
          "profile-title": decodeURIComponent(filename)
        };
        if (cfg.subInfo) headers["Subscription-Userinfo"] = `upload=${cfg.subInfo.up}; download=${cfg.subInfo.down}; total=${cfg.subInfo.total}; expire=${cfg.subInfo.expire}`;

        let outText = "";
        if (cfg.universal) {
          let rawData = extractProxies(tryDecodeBase64(cfg.links));
          if (cfg.replaceRule && cfg.replaceRule.find) {
            try { rawData = rawData.replace(new RegExp(cfg.replaceRule.find, "gi"), cfg.replaceRule.replace || ""); } catch {}
          }
          outText = btoa(unescape(encodeURIComponent(rawData)));
        } else {
          outText = await buildConfig(cfg.links, cfg.tmplUrl, cfg.replaceRule);
        }

        return textRes(outText, 200, headers);
      } catch (e) {
        return textRes("Error: " + e.message, 500);
      }
    }

    if (url.searchParams.get("data")) {
      try {
        const decoded = decodeURIComponent(escape(atob(url.searchParams.get("data"))));
        const cfg = {
          links: decoded,
          universal: url.searchParams.get("uni") === "1",
          filename: url.searchParams.get("name") || "My_Config"
        };

        if (url.searchParams.get("tmpl")) {
          try { cfg.tmplUrl = atob(url.searchParams.get("tmpl")); } catch {}
        }
        if (url.searchParams.get("rf")) {
          try {
            cfg.replaceRule = {
              find: decodeURIComponent(escape(atob(url.searchParams.get("rf")))),
              replace: url.searchParams.get("rt") ? decodeURIComponent(escape(atob(url.searchParams.get("rt")))) : ""
            };
          } catch {}
        }

        const filename = encodeURIComponent(cfg.filename || "My_Config");
        const headers = {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `inline; filename="${filename}.${cfg.universal ? "txt" : "yaml"}"`,
          "Profile-Update-Interval": "12",
          "profile-title": decodeURIComponent(filename)
        };

        const outText = cfg.universal
          ? btoa(unescape(encodeURIComponent(extractProxies(tryDecodeBase64(cfg.links)))))
          : await buildConfig(cfg.links, cfg.tmplUrl, cfg.replaceRule);

        return textRes(outText, 200, headers);
      } catch {
        return textRes("400: 长链数据解码失败", 400);
      }
    }

    /* =========================
     * 模块5：后台页面（防炸版 + 预览功能）
     * ========================= */

    if (url.pathname === "/panel") {
      const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>👑 控制台后台管理</title>
  <style>
    :root{--primary:#4f46e5;--accent:#0ea5e9;--danger:#ef4444;--success:#10b981;--warning:#f59e0b;--bg:#f1f5f9;--text:#0f172a;--muted:#64748b;--glass:rgba(255,255,255,.84);--border:rgba(15,23,42,.08);--input:rgba(255,255,255,.62);--shadow:0 10px 30px -10px rgba(0,0,0,.08)}
    [data-theme="dark"]{--bg:#0f172a;--text:#f8fafc;--muted:#94a3b8;--glass:rgba(15,23,42,.75);--border:rgba(255,255,255,.1);--input:rgba(0,0,0,.24);--shadow:0 15px 35px -5px rgba(0,0,0,.4)}
    *{box-sizing:border-box}
    body{font-family:Inter,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:28px 16px;transition:.3s}
    .container{max-width:1220px;margin:0 auto}
    .card{background:var(--glass);backdrop-filter:blur(16px);border:1px solid var(--border);border-radius:22px;padding:24px;box-shadow:var(--shadow)}
    .header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}
    .header h1{margin:0;font-size:28px;background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .top-actions{display:flex;gap:10px;flex-wrap:wrap}
    .btn{border:none;padding:11px 16px;border-radius:12px;cursor:pointer;font-weight:800;font-size:14px;background:var(--input);color:var(--text);border:1px solid var(--border)}
    .btn-primary{background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;border:none}
    .btn-danger{background:rgba(239,68,68,.12);color:var(--danger);border:1px solid rgba(239,68,68,.28)}
    .btn-success{background:rgba(16,185,129,.12);color:var(--success);border:1px solid rgba(16,185,129,.28)}
    .preview-btn{background:var(--success);color:#fff;border:1px solid rgba(16,185,129,.28)}
    .login-box{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;padding:16px;border:1px dashed var(--border);border-radius:16px;background:rgba(127,127,127,.05)}
    .list{display:flex;flex-direction:column;gap:14px}
    .item{background:var(--input);border:1px solid var(--border);border-radius:16px;padding:18px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .info{flex:1;min-width:290px}
    .info strong{display:block;font-size:16px;margin-bottom:10px;word-break:break-all}
    .tags{display:flex;gap:8px;flex-wrap:wrap}
    .tag{font-size:12px;color:var(--muted);background:rgba(127,127,127,.12);padding:5px 10px;border-radius:999px}
    .tag.red{color:var(--danger);background:rgba(239,68,68,.12)}
    .ops{display:flex;gap:8px;flex-wrap:wrap}
    .toast{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);background:var(--glass);backdrop-filter:blur(16px);padding:14px 20px;border-radius:14px;border:1px solid var(--border);box-shadow:var(--shadow);font-weight:800;z-index:9999}
    input[type=password],input[type=text]{width:100%;padding:12px 16px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px}
  </style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <h1>👑 订阅管理中心（CF 完整版）</h1>
      <div class="top-actions">
        <button class="btn" onclick="toggleTheme()" id="themeBtn">🌙 切换主题</button>
        <button class="btn" onclick="location.href='/'">↩ 前台首页</button>
      </div>
    </div>

    <div class="login-box" id="loginBox">
      <input type="password" id="pwdInput" placeholder="输入管理员密码" style="flex:1;min-width:220px;">
      <button class="btn btn-primary" onclick="loginAndLoad()">🔐 登录后台</button>
      <button class="btn btn-danger" onclick="logout()">🚪 退出</button>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-success" onclick="refreshList()">🔄 刷新</button>
      <button class="btn btn-danger" onclick="batchDelete()">🗑️ 批量删除选中</button>
      <button class="btn" onclick="selectAll(true)">全选</button>
      <button class="btn" onclick="selectAll(false)">取消全选</button>
    </div>

    <input id="searchInput" placeholder="搜索短链ID / 配置名..." style="width:100%;padding:12px 16px;border-radius:12px;border:1px solid var(--border);background:var(--input);margin-bottom:16px;" oninput="renderList()">

    <div id="listContainer" class="list"></div>
  </div>
</div>

<script>
let allSubs = [];
let pwdCache = '';

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 2800);
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('themeBtn').textContent = isDark ? '🌙 切换主题' : '🌞 切换主题';
}

async function loginAndLoad() {
  const inputPwd = document.getElementById('pwdInput').value.trim();
  if (!inputPwd) return showToast('请输入密码');
  pwdCache = inputPwd;
  localStorage.setItem('__admin_pwd', inputPwd);
  await loadList();
}

function logout() {
  pwdCache = '';
  localStorage.removeItem('__admin_pwd');
  document.getElementById('listContainer').innerHTML = '<div style="text-align:center;padding:60px;color:var(--muted)">已退出，请重新登录</div>';
  showToast('已退出');
}

async function apiCall(endpoint, body) {
  if (!body) body = {};
  if (!pwdCache) pwdCache = localStorage.getItem('__admin_pwd') || '';
  const res = await fetch('/api/' + endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(Object.assign({}, body, { pwd: pwdCache }))
  });
  if (res.status === 403) {
    logout();
    throw new Error('密码错误');
  }
  if (!res.ok) throw new Error('请求失败');
  return res;
}

async function loadList() {
  try {
    const res = await apiCall('list_subs');
    allSubs = await res.json();
    renderList();
  } catch (e) {
    showToast(e.message || '加载失败');
  }
}

async function refreshList() {
  await loadList();
  showToast('列表已刷新');
}

function renderList() {
  const kw = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = allSubs.filter(function(s){
    return !kw || s.id.toLowerCase().includes(kw) || (s.name || '').toLowerCase().includes(kw);
  });

  const container = document.getElementById('listContainer');
  if (!filtered.length) {
    container.innerHTML = '<div style="text-align:center;padding:80px 20px;color:var(--muted);font-size:15px">暂无订阅</div>';
    return;
  }

  container.innerHTML = filtered.map(function(sub){
    return '<div class="item">' +
      '<div class="info">' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
          '<input type="checkbox" class="sub-check" value="' + sub.id + '" style="transform:scale(1.3)">' +
          '<strong>/sub/' + sub.id + '</strong>' +
        '</label>' +
        '<div class="tags">' +
          '<span class="tag">📛 ' + (sub.name || '未命名') + '</span>' +
          (sub.remark ? '<span class="tag">📝 ' + sub.remark + '</span>' : '') +
          '<span class="tag">👀 已访问 ' + (sub.accessed || 0) + ' 次</span>' +
          (sub.max !== '无' ? '<span class="tag">限 ' + sub.max + ' IP</span>' : '') +
          (sub.burn ? '<span class="tag red">🔥 阅后即焚</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ops">' +
        '<button class="btn preview-btn" onclick="previewSub(\\'' + sub.id + '\\')">👀 预览订阅</button>' +
        '<button class="btn" onclick="copyLink(\\'' + sub.id + '\\')">📋 复制链接</button>' +
        '<button class="btn btn-danger" onclick="deleteSingle(\\'' + sub.id + '\\')">永久删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function selectAll(checked) {
  document.querySelectorAll('.sub-check').forEach(function(cb){
    cb.checked = checked;
  });
}

async function copyLink(id) {
  try {
    await navigator.clipboard.writeText(location.origin + '/sub/' + id);
    showToast('链接已复制');
  } catch(e) {
    showToast('复制失败');
  }
}

async function previewSub(id) {
  window.open(location.origin + '/sub/' + id, '_blank');
  showToast('已打开预览');
}

async function deleteSingle(id) {
  if (!confirm('确定永久删除这条订阅吗？')) return;
  try {
    await apiCall('del_sub', { id: id });
    showToast('已删除');
    await loadList();
  } catch (e) {
    showToast(e.message || '删除失败');
  }
}

async function batchDelete() {
  const ids = Array.from(document.querySelectorAll('.sub-check:checked')).map(function(cb){
    return cb.value;
  });
  if (!ids.length) return showToast('请先勾选要删除的项目');
  if (!confirm('确定删除选中的 ' + ids.length + ' 条订阅？')) return;
  try {
    await apiCall('del_batch', { ids: ids });
    showToast('批量删除完成');
    await loadList();
  } catch (e) {
    showToast(e.message || '批量删除失败');
  }
}

window.onload = function() {
  const savedPwd = localStorage.getItem('__admin_pwd');
  if (savedPwd) {
    pwdCache = savedPwd;
    document.getElementById('pwdInput').value = savedPwd;
    loadList();
  }
};
</script>
</body></html>`;

      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    /* =========================
     * 模块6：前台页面（最终平衡版）
     * ========================= */

    const pageWorkerOrigin = `${url.protocol}//${url.host}`;
    const pageBgStyle = env.IMG ? `
body{
  background-image:
    linear-gradient(rgba(255,255,255,.14), rgba(255,255,255,.14)),
    url('${env.IMG}');
  background-size:cover;
  background-position:center;
  background-attachment:fixed;
}
[data-theme="dark"] body{
  background-image:
    linear-gradient(rgba(0,0,0,.10), rgba(0,0,0,.10)),
    url('${env.IMG}');
}
` : "";

    return textRes(`<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ web-sublinks | CF 控制台</title>
  <style>
    :root{
      --primary:#4f46e5;--accent:#0ea5e9;--danger:#ef4444;--success:#10b981;--warning:#f59e0b;
      --bg:#f1f5f9;--text:#0f172a;--muted:#64748b;--glass:rgba(255,255,255,.12);--border:rgba(15,23,42,.10);--input:rgba(255,255,255,.32);--shadow:0 10px 30px -10px rgba(0,0,0,.12)
    }
    [data-theme="dark"]{
      --bg:#0f172a;--text:#f8fafc;--muted:#cbd5e1;--glass:rgba(15,23,42,.42);--border:rgba(255,255,255,.12);--input:rgba(255,255,255,.10);--shadow:0 15px 35px -5px rgba(0,0,0,.45)
    }
    *{box-sizing:border-box}
    body{font-family:Inter,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:28px 20px 40px;display:flex;justify-content:center;transition:.3s}
    ${pageBgStyle}
    .container{width:100%;max-width:1320px}
    .header{text-align:center;margin-bottom:28px}
    .header h1{font-size:34px;font-weight:800;margin:0 0 10px;background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;cursor:pointer;user-select:none}
    .header p{margin:0;color:var(--muted);font-size:15px}
    .theme-toggle{position:fixed;top:24px;right:24px;width:56px;height:56px;border:none;border-radius:50%;background:var(--glass);backdrop-filter:blur(14px);color:var(--text);cursor:pointer;box-shadow:var(--shadow);border:1px solid var(--border);font-size:22px;z-index:999}
    .grid{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);gap:24px;align-items:start}
    .col-left,.col-right{display:flex;flex-direction:column;gap:22px;min-width:0}
    @media(max-width:980px){.grid{grid-template-columns:1fr}}
    .card{background:var(--glass);backdrop-filter:blur(16px);border:1px solid var(--border);border-radius:22px;padding:24px;box-shadow:var(--shadow)}
    .left-main-card{min-height:500px}
    .tabs{display:flex;background:var(--input);border:1px solid var(--border);border-radius:14px;padding:6px;margin-bottom:18px}
    .tab-btn{flex:1;padding:12px 10px;border-radius:10px;text-align:center;font-weight:800;font-size:15px;color:var(--muted);cursor:pointer}
    .tab-btn.active{background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff}
    .tab-content{display:none}
    .tab-content.active{display:block}
    textarea,input[type=text],input[type=number],input[type=date],input[type=datetime-local],select,input[type=password]{
      width:100%;padding:13px 16px;border-radius:14px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px
    }
    textarea{min-height:265px;resize:vertical;font-family:Consolas,monospace}
    textarea:focus,input:focus,select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px rgba(79,70,229,.14)}
    .upload-area{border:2px dashed rgba(79,70,229,.65);border-radius:18px;padding:48px 18px;text-align:center;cursor:pointer;color:var(--primary);font-weight:800;background:rgba(79,70,229,.04)}
    .upload-desc{font-size:12px;color:var(--muted);margin-top:10px}
    .row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border);flex-wrap:wrap}
    .row:last-child{border-bottom:none;padding-bottom:0}
    .row:first-child{padding-top:0}
    .row-text{flex:1;min-width:180px}
    .row-text strong{display:block;font-size:15px;margin-bottom:4px}
    .row-text span{font-size:13px;color:var(--muted)}
    .input-wrap{display:flex;gap:10px;min-width:180px;flex:1;justify-content:flex-end}
    .switch{position:relative;display:inline-block;width:50px;height:28px}
    .switch input{opacity:0;width:0;height:0}
    .slider{position:absolute;inset:0;background:rgba(148,163,184,.45);border-radius:28px;cursor:pointer}
    .slider:before{content:"";position:absolute;left:4px;bottom:4px;width:20px;height:20px;background:#fff;border-radius:50%;transition:.25s}
    input:checked + .slider{background:var(--success)}
    input:checked + .slider:before{transform:translateX(22px)}
    .tmpl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
    @media(max-width:640px){.tmpl-grid{grid-template-columns:1fr}}
    .tmpl-card{
      padding:13px 14px;border:1px solid var(--border);background:var(--input);border-radius:14px;cursor:pointer;position:relative;
      min-height:58px;text-align:center;color:var(--muted);font-size:14px;display:flex;align-items:center;justify-content:center;font-weight:700
    }
    .tmpl-card.active{border-color:var(--primary);color:var(--primary);font-weight:800;box-shadow:0 0 0 3px rgba(79,70,229,.08) inset}
    .tmpl-card .del-btn{display:none;position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:var(--danger);color:#fff;line-height:22px;font-size:14px}
    .tmpl-card:hover .del-btn{display:block}
    .btn-primary{width:100%;padding:17px;border:none;border-radius:16px;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;font-weight:800;font-size:16px;cursor:pointer;box-shadow:0 8px 20px rgba(79,70,229,.28)}
    .btn-sub{padding:12px 16px;border-radius:14px;border:1px solid var(--border);background:var(--input);color:var(--text);cursor:pointer;font-weight:800}
    .hidden{display:none!important}
    .alert-box{background:rgba(245,158,11,.12);border-left:4px solid var(--warning);padding:14px 16px;border-radius:0 12px 12px 0;color:#d97706;font-size:14px}
    .traffic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin-top:16px;padding-top:16px;border-top:1px dashed var(--border)}
    .result-ok{border:2px solid rgba(16,185,129,.55)!important}
    .toast-wrap{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:9999}
    .toast{background:var(--glass);backdrop-filter:blur(16px);border:1px solid var(--border);padding:14px 22px;border-radius:14px;box-shadow:var(--shadow);font-weight:700}
    .storage-tip{margin-top:12px;font-size:12px;color:var(--muted)}
    .admin-entry{display:none;margin-top:14px;padding:14px;border:1px dashed var(--border);border-radius:14px;background:rgba(127,127,127,.08)}
    .admin-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .admin-row input{flex:1;min-width:220px}
    .action-row{display:flex;gap:14px}
    .action-row .btn-primary:first-child{flex:1.4}
    .action-row .btn-primary:last-child{
      flex:1;
      background:var(--input);
      color:var(--text);
      border:1px solid var(--border);
      box-shadow:none
    }
    @media(max-width:640px){
      .action-row{flex-direction:column}
    }
  </style>
</head>
<body>
  <button class="theme-toggle" onclick="toggleTheme()" id="themeBtn">🌙</button>
  <div class="toast-wrap" id="toastWrap"></div>

  <div class="container">
    <div class="header">
      <h1 id="mainTitle">✈️ web-sublinks</h1>
      <p>Cloudflare Workers 前台完整控制台</p>

      <div class="admin-entry" id="adminEntry">
        <div class="admin-row">
          <input type="password" id="adminPwdInput" placeholder="请输入管理员密码后进入后台">
          <button class="btn-sub" onclick="enterAdminPanel()" style="background:var(--primary);color:#fff;border-color:transparent;">🔐 进入后台</button>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="col-left">
        <div class="card left-main-card">
          <div class="tabs">
            <div class="tab-btn active" onclick="switchTab('paste')" id="tab-paste">📄 剪贴板</div>
            <div class="tab-btn" onclick="switchTab('file')" id="tab-file">⬆️ 文件</div>
            <div class="tab-btn" onclick="switchTab('url')" id="tab-url">🔗 订阅</div>
          </div>

          <div id="content-paste" class="tab-content active">
            <textarea id="inputLinks" placeholder="支持分享链接、Base64、完整 YAML、多行 Clash proxies"></textarea>
          </div>

          <div id="content-file" class="tab-content">
            <div class="upload-area" id="dropZone" onclick="document.getElementById('fileInput').click()">
              <div style="font-size:30px;margin-bottom:10px;">📂</div>
              <div id="fileStatus">点击选择文件，或拖拽到此处</div>
              <div class="upload-desc">支持 .txt / .yaml / .yml / .json / .ini / .conf</div>
            </div>
            <input type="file" id="fileInput" style="display:none" accept=".txt,.yaml,.yml,.json,.ini,.conf">
          </div>

          <div id="content-url" class="tab-content">
            <input type="text" id="inputUrl" placeholder="输入订阅链接">
            <div class="storage-tip">由 Worker 代拉取，适合本地网络受限场景</div>
          </div>
        </div>

        <div class="card" id="tmplPanel">
          <div style="font-weight:800;margin-bottom:8px;">🔗 路由模板挂载（仅 Clash 生效）</div>
          <div class="tmpl-grid" id="tmplGrid">加载中...</div>
          <div class="hidden" id="addTmplArea" style="margin-top:16px;">
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
              <input type="text" id="newTmplName" placeholder="模板别名" style="flex:1;min-width:100px;">
              <input type="text" id="newTmplUrl" placeholder="https://raw..." style="flex:2;min-width:180px;">
            </div>
            <div style="display:flex;gap:12px;">
              <button onclick="saveNewTmpl('local')" class="btn-sub" style="flex:1;">💻 本地保存</button>
              <button onclick="saveNewTmpl('cloud')" class="btn-sub" style="flex:1;background:var(--primary);color:#fff;border-color:transparent;">☁️ 云端同步</button>
            </div>
          </div>
        </div>

        <div class="action-row">
          <button class="btn-primary" id="generateBtn" onclick="generateLink()">🚀 生成云端短链</button>
          <button class="btn-primary" id="generateLongBtn" onclick="generateLong()">🎈 免存长链</button>
        </div>

        <div id="resultArea" class="card hidden result-ok">
          <div style="color:var(--success);font-weight:800;font-size:16px;margin-bottom:16px;text-align:center;">✅ 链接生成成功</div>
          <input type="text" id="subUrl" readonly style="text-align:center;font-weight:700;color:var(--primary);background:rgba(79,70,229,.05);">
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:18px;">
            <button onclick="window.open(document.getElementById('subUrl').value)" class="btn-sub" style="flex:1;">👀 浏览器预览</button>
            <button onclick="copyUrl(false)" class="btn-sub" style="flex:1;background:var(--primary);color:#fff;border-color:transparent;">📋 复制链接</button>
          </div>
        </div>
      </div>

      <div class="col-right">
        <div class="card">
          <div style="font-weight:800;margin-bottom:10px;">⚙️ 基础设置</div>
          <div class="row">
            <div class="row-text"><strong>配置显示名</strong><span>留空自动提取</span></div>
            <div class="input-wrap"><input type="text" id="filename" placeholder="如：我的网络"></div>
          </div>
          <div class="row">
            <div class="row-text"><strong>备注信息</strong><span>仅后台可见，方便区分用途</span></div>
            <div class="input-wrap"><input type="text" id="remark" placeholder="如：张三-iPhone / 测试专用"></div>
          </div>
          <div class="row">
            <div class="row-text"><strong>短链接后缀</strong><span>留空随机生成</span></div>
            <div class="input-wrap"><input type="text" id="alias" placeholder="如：myvip"></div>
          </div>
          <div class="row">
            <div class="row-text"><strong>节点批量改名</strong><span>支持正则替换</span></div>
            <div class="input-wrap" style="flex-wrap:nowrap;">
              <input type="text" id="repFind" placeholder="查找" style="width:50%;">
              <input type="text" id="repTo" placeholder="替换为" style="width:50%;">
            </div>
          </div>
          <div class="row">
            <div class="row-text"><strong>通用订阅格式</strong><span>Base64 兼容模式</span></div>
            <label class="switch"><input type="checkbox" id="universal" onchange="toggleUniversal()"><span class="slider"></span></label>
          </div>
          <div id="universalWarning" class="alert-box hidden">⚠️ 开启后路由模板将失效，仅输出通用 Base64。</div>
          <div class="storage-tip">CF 版支持 KV 短链 + 长链双模式</div>
        </div>

        <div class="card">
          <div style="font-weight:800;margin-bottom:10px;">🛡️ 高级安全管理</div>
          <div class="row">
            <div class="row-text"><strong>精确自动过期</strong><span>到期后自动销毁</span></div>
            <label class="switch"><input type="checkbox" id="enableExpire" onchange="document.getElementById('expireSettings').classList.toggle('hidden')"><span class="slider"></span></label>
          </div>
          <div id="expireSettings" class="hidden" style="margin-top:12px;padding-top:14px;border-top:1px dashed var(--border);display:flex;gap:12px;flex-wrap:wrap;">
            <select id="expireType" onchange="toggleExpireInput()" style="flex:1;"><option value="days">天数</option><option value="hours">小时</option><option value="date">指定日期</option></select>
            <input type="number" id="expireNum" placeholder="数值..." style="flex:1;">
            <input type="datetime-local" id="expireDate" class="hidden" style="width:100%;">
          </div>
          <div class="row">
            <div class="row-text"><strong>独立 IP 防泄露</strong><span>限制访问网络数</span></div>
            <div class="input-wrap" style="max-width:120px;"><input type="number" id="maxDown" placeholder="IP数"></div>
          </div>
          <div class="row">
            <div class="row-text"><strong>阅后即焚模式</strong><span>首次拉取即销毁</span></div>
            <label class="switch"><input type="checkbox" id="burnMode"><span class="slider"></span></label>
          </div>
          <div class="row">
            <div class="row-text"><strong>伪装流量面板</strong><span>返回流量信息头</span></div>
            <label class="switch"><input type="checkbox" onchange="document.getElementById('trafficArea').classList.toggle('hidden')"><span class="slider"></span></label>
          </div>
          <div id="trafficArea" class="hidden traffic-grid">
            <input type="text" id="tUp" placeholder="上传 10G">
            <input type="text" id="tDown" placeholder="下载 50G">
            <input type="text" id="tTotal" placeholder="总计 200G">
            <input type="date" id="tExpireDate" style="grid-column:1/-1;">
          </div>
        </div>
      </div>
    </div>
  </div>

<script>
let localTemplates=[];
try{
  const stored=localStorage.getItem('__local_tmpls');
  if(stored)localTemplates=JSON.parse(stored)||[];
}catch(e){
  localStorage.removeItem('__local_tmpls');
}

let currentTab='paste',uploadedFileText='';
const domain='${pageWorkerOrigin}';
const panelUrl='${pageWorkerOrigin}/panel';
const baseTemplates=[
  {id:'noom',name:'🟢 NooM Pro',url:'https://raw.githubusercontent.com/lijboys/li-rules/refs/heads/main/Rewards/NooM.ini'},
  {id:'none',name:'❌ 纯净节点',url:''}
];
let cloudTemplates=[],currentSelectedUrl=baseTemplates[0].url;

function showToast(msg){
  const w=document.getElementById('toastWrap');
  w.innerHTML='<div class="toast">'+msg+'</div>';
  setTimeout(()=>w.innerHTML='',3000);
}
function initTheme(){
  const saved=localStorage.getItem('__pro_theme');
  const dark=saved==='dark'||(!saved&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  document.getElementById('themeBtn').innerText=dark?'🌞':'🌙';
}
function toggleTheme(){
  const next=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('__pro_theme',next);
  document.getElementById('themeBtn').innerText=next==='dark'?'🌞':'🌙';
}
initTheme();

function switchTab(tab){
  currentTab=tab;
  document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.getElementById('content-'+tab).classList.add('active');
}
document.getElementById('dropZone').addEventListener('dragover',e=>{e.preventDefault()});
document.getElementById('dropZone').addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files.length>0)handleFile(e.dataTransfer.files[0])});
document.getElementById('fileInput').addEventListener('change',function(){if(this.files[0])handleFile(this.files[0])});

function handleFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    uploadedFileText=e.target.result||'';
    document.getElementById('fileStatus').innerHTML='✅ 已加载：'+file.name;
  };
  reader.readAsText(file);
}
function toggleUniversal(){
  const checked=document.getElementById('universal').checked;
  document.getElementById('tmplPanel').style.display=checked?'none':'block';
  document.getElementById('universalWarning').classList.toggle('hidden',!checked);
}
function toggleExpireInput(){
  const t=document.getElementById('expireType').value;
  document.getElementById('expireNum').classList.toggle('hidden',t==='date');
  document.getElementById('expireDate').classList.toggle('hidden',t!=='date');
}

async function fetchCloudTmpls(){
  try{
    const res=await fetch('/api/tmpl');
    if(res.ok) cloudTemplates=await res.json();
  }catch(e){}
  renderTmpls();
}
function renderTmpls(){
  const grid=document.getElementById('tmplGrid');
  grid.innerHTML='';
  [...baseTemplates.map((x,i)=>[x,'base',i]),...cloudTemplates.map((x,i)=>[x,'cloud',i]),...localTemplates.map((x,i)=>[x,'local',i]),[{id:'add',name:'➕ 添加模板...',url:'ACTION_ADD'},'base',-1]]
  .forEach(([t,type,index])=>{
    const div=document.createElement('div');
    div.className='tmpl-card '+((t.url===currentSelectedUrl&&t.id!=='add')?'active':'');
    div.innerText=t.name;
    if(type!=='base'){
      const del=document.createElement('div');
      del.className='del-btn';
      del.innerText='×';
      del.onclick=(e)=>{e.stopPropagation();deleteTmpl(type,index)};
      div.appendChild(del);
    }
    div.onclick=()=>{
      if(t.id==='add'){
        document.getElementById('addTmplArea').classList.remove('hidden');
        document.querySelectorAll('.tmpl-card').forEach(c=>c.classList.remove('active'));
        div.classList.add('active');
        return;
      }
      document.getElementById('addTmplArea').classList.add('hidden');
      currentSelectedUrl=t.url;
      renderTmpls();
    };
    grid.appendChild(div);
  });
}
async function saveNewTmpl(mode){
  const name=document.getElementById('newTmplName').value.trim();
  const url=document.getElementById('newTmplUrl').value.trim();
  if(!name||!url) return showToast('请填写模板别名和 URL');

  if(mode==='local'){
    localTemplates.push({name:'💻 '+name,url:url});
    localStorage.setItem('__local_tmpls',JSON.stringify(localTemplates));
    finishSave(url);
    return;
  }

  let pwd=localStorage.getItem('__admin_pwd')||prompt('请输入管理员密码');
  if(!pwd)return;

  const newTmpls=[...cloudTemplates,{name:'☁️ '+name,url:url}];
  const res=await fetch('/api/tmpl',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({pwd:pwd,tmpls:newTmpls})
  });

  if(res.status===403){
    localStorage.removeItem('__admin_pwd');
    return showToast('密码错误');
  }
  if(!res.ok){
    return showToast(await res.text()||'保存失败');
  }

  localStorage.setItem('__admin_pwd',pwd);
  cloudTemplates=newTmpls;
  finishSave(url);
}
function finishSave(url){
  currentSelectedUrl=url;
  document.getElementById('newTmplName').value='';
  document.getElementById('newTmplUrl').value='';
  document.getElementById('addTmplArea').classList.add('hidden');
  renderTmpls();
}
async function deleteTmpl(type,index){
  if(!confirm('确定删除模板吗？')) return;

  if(type==='local'){
    if(localTemplates[index].url===currentSelectedUrl) currentSelectedUrl=baseTemplates[0].url;
    localTemplates.splice(index,1);
    localStorage.setItem('__local_tmpls',JSON.stringify(localTemplates));
    return renderTmpls();
  }

  let pwd=localStorage.getItem('__admin_pwd')||prompt('请输入管理员密码');
  if(!pwd)return;

  const newTmpls=[...cloudTemplates];
  if(newTmpls[index].url===currentSelectedUrl) currentSelectedUrl=baseTemplates[0].url;
  newTmpls.splice(index,1);

  const res=await fetch('/api/tmpl',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({pwd:pwd,tmpls:newTmpls})
  });

  if(res.status===403){
    localStorage.removeItem('__admin_pwd');
    return showToast('密码错误');
  }
  if(!res.ok){
    return showToast(await res.text()||'删除失败');
  }

  localStorage.setItem('__admin_pwd',pwd);
  cloudTemplates=newTmpls;
  renderTmpls();
}

function parseBytes(str){
  if(!str) return 0;
  const s=String(str).toUpperCase(),v=parseFloat(s);
  if(isNaN(v)) return 0;
  if(s.includes('T')) return Math.floor(v*1099511627776);
  if(s.includes('G')) return Math.floor(v*1073741824);
  if(s.includes('M')) return Math.floor(v*1048576);
  if(s.includes('K')) return Math.floor(v*1024);
  return Math.floor(v);
}
async function getFinalInputText(){
  let text='',defaultName='';
  if(currentTab==='paste'){
    text=document.getElementById('inputLinks').value.trim();
  }else if(currentTab==='file'){
    if(!uploadedFileText) throw new Error('请先上传文件');
    text=uploadedFileText.trim();
  }else if(currentTab==='url'){
    const subUrl=document.getElementById('inputUrl').value.trim();
    if(!subUrl) throw new Error('请填写订阅链接');
    const res=await fetch('/api/fetch',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({subUrl:subUrl})
    });
    if(!res.ok) throw new Error(await res.text()||'代拉取失败');
    const data=await res.json();
    text=data.text||'';
    defaultName=data.name||'';
  }
  if(!defaultName&&text){
    const m=text.match(/^[#;!\\/]+\\s*(?:NAME|profile-title|title|name):\\s*(.+)$/im);
    if(m) defaultName=m[1].trim();
  }
  return {text,defaultName};
}
async function generateLink(){
  const btn=document.getElementById('generateBtn'),old=btn.innerText;
  btn.innerText='⏳ 处理中...';
  try{
    const {text,defaultName}=await getFinalInputText();
    if(!text) throw new Error('解析内容为空');

    const payload={
      links:text,
      filename:document.getElementById('filename').value.trim()||defaultName||'',
      remark:document.getElementById('remark').value.trim(),
      alias:document.getElementById('alias').value.trim(),
      universal:document.getElementById('universal').checked,
      tmplUrl:currentSelectedUrl,
      maxDownloads:document.getElementById('maxDown').value?parseInt(document.getElementById('maxDown').value):null,
      burn:document.getElementById('burnMode').checked
    };

    const repFind=document.getElementById('repFind').value.trim();
    const repTo=document.getElementById('repTo').value;
    if(repFind) payload.replaceRule={find:repFind,replace:repTo};

    if(document.getElementById('enableExpire').checked){
      const type=document.getElementById('expireType').value;
      let expireAt=null;
      if(type==='days'){
        const val=parseFloat(document.getElementById('expireNum').value);
        if(val) expireAt=Date.now()+val*86400000;
      }else if(type==='hours'){
        const val=parseFloat(document.getElementById('expireNum').value);
        if(val) expireAt=Date.now()+val*3600000;
      }else if(type==='date'){
        const val=document.getElementById('expireDate').value;
        if(val) expireAt=new Date(val).getTime();
      }
      if(expireAt) payload.expireAt=expireAt;
    }

    if(!document.getElementById('trafficArea').classList.contains('hidden')){
      const expDateStr=document.getElementById('tExpireDate').value;
      payload.subInfo={
        up:parseBytes(document.getElementById('tUp').value),
        down:parseBytes(document.getElementById('tDown').value),
        total:parseBytes(document.getElementById('tTotal').value),
        expire:expDateStr?Math.floor(new Date(expDateStr).getTime()/1000):0
      };
    }

    const res=await fetch('/api/shorten',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const txt=await res.text();
    if(!res.ok) throw new Error(txt);

    document.getElementById('subUrl').value=domain+'/sub/'+txt;
    document.getElementById('resultArea').classList.remove('hidden');
    copyUrl(true);
    showToast('生成成功并已自动复制');
  }catch(e){
    showToast(e.message||'生成失败');
  }finally{
    btn.innerText=old;
  }
}
async function generateLong(){
  const btn=document.getElementById('generateLongBtn'),old=btn.innerText;
  btn.innerText='⏳ 打包中...';
  try{
    const {text,defaultName}=await getFinalInputText();
    if(!text) throw new Error('内容为空');

    let finalUrl=domain+'/?data='+btoa(unescape(encodeURIComponent(text)));
    if(document.getElementById('universal').checked) finalUrl+='&uni=1';
    else if(currentSelectedUrl) finalUrl+='&tmpl='+btoa(currentSelectedUrl);

    const finalFilename=document.getElementById('filename').value.trim()||defaultName||'';
    if(finalFilename) finalUrl+='&name='+encodeURIComponent(finalFilename);

    const repFind=document.getElementById('repFind').value.trim();
    const repTo=document.getElementById('repTo').value;
    if(repFind){
      finalUrl+='&rf='+btoa(unescape(encodeURIComponent(repFind)))+'&rt='+btoa(unescape(encodeURIComponent(repTo)));
    }

    document.getElementById('subUrl').value=finalUrl;
    document.getElementById('resultArea').classList.remove('hidden');
    copyUrl(true);
    showToast('长链已生成并自动复制');
  }catch(e){
    showToast(e.message||'生成失败');
  }finally{
    btn.innerText=old;
  }
}
async function copyUrl(isAuto){
  try{
    await navigator.clipboard.writeText(document.getElementById('subUrl').value);
    if(!isAuto) showToast('已复制到剪贴板');
  }catch(e){
    if(!isAuto) showToast('复制失败，请手动复制');
  }
}

let __titleTapCount=0,__titleTapTimer=null;
function revealAdminEntry(){
  const box=document.getElementById('adminEntry');
  if(!box)return;
  box.style.display='block';
  showToast('已开启后台入口');
  const input=document.getElementById('adminPwdInput');
  if(input) input.focus();
}
async function enterAdminPanel(){
  const input=document.getElementById('adminPwdInput');
  const pwd=(input?input.value:'').trim();
  if(!pwd){showToast('请输入管理员密码');return}
  try{
    const res=await fetch('/api/list_subs',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pwd})
    });
    if(res.status===403){showToast('管理员密码错误');return}
    if(!res.ok){showToast('验证失败：'+res.status);return}
    localStorage.setItem('__admin_pwd',pwd);
    location.href=panelUrl;
  }catch(e){
    showToast('网络错误，无法进入后台');
  }
}
function initHiddenAdminEntry(){
  const title=document.getElementById('mainTitle');
  if(!title)return;
  title.addEventListener('click',function(){
    __titleTapCount++;
    clearTimeout(__titleTapTimer);
    if(__titleTapCount>=5){
      __titleTapCount=0;
      revealAdminEntry();
      return;
    }
    __titleTapTimer=setTimeout(()=>{__titleTapCount=0},1200);
  });
  const input=document.getElementById('adminPwdInput');
  if(input){
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter') enterAdminPanel();
    });
  }
}

window.onload=()=>{
  fetchCloudTmpls();
  initHiddenAdminEntry();
};
</script>
</body>
</html>`, 200, { "Content-Type": "text/html;charset=UTF-8" });
  }
};
