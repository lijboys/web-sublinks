const CONFIG={KV_TMPL_KEY:"__sys_cloud_templates__"};

export default{async fetch(request,env){
const url=new URL(request.url),j=(d,s=200,h={})=>new Response(typeof d==="string"?d:JSON.stringify(d),{status:s,headers:h});

if(url.pathname==="/api/list_subs"&&request.method==="POST"){
try{
const b=await request.json();
if(b.pwd!==env.ADMIN_PWD)return j("密码错误",403);
const list=await env.MY_KV.list(),subs=[];
for(const k of list.keys){
if(k.name===CONFIG.KV_TMPL_KEY)continue;
const m=k.metadata||{};
subs.push({id:k.name,name:m.name||"未命名",createdAt:m.createdAt||0,accessed:m.accessed||0,max:m.max||"无",burn:m.burn||false});
}
subs.sort((a,b)=>b.createdAt-a.createdAt);
return j(subs,200,{"Content-Type":"application/json"});
}catch(e){return j("Error",500);}
}

if(url.pathname==="/api/del_sub"&&request.method==="POST"){
try{
const b=await request.json();
if(b.pwd!==env.ADMIN_PWD)return j("密码错误",403);
if(b.id&&b.id!==CONFIG.KV_TMPL_KEY)await env.MY_KV.delete(b.id);
return j("OK");
}catch(e){return j("Error",500);}
}

if(url.pathname==="/api/tmpl"){
if(!env.MY_KV)return j("[]",200,{"Content-Type":"application/json"});
if(request.method==="GET"){
const data=await env.MY_KV.get(CONFIG.KV_TMPL_KEY);
return j(data||"[]",200,{"Content-Type":"application/json"});
}
if(request.method==="POST"){
try{
const b=await request.json();
if(b.pwd!==env.ADMIN_PWD)return j("密码错误",403);
await env.MY_KV.put(CONFIG.KV_TMPL_KEY,JSON.stringify(b.tmpls||[]));
return j("OK");
}catch(e){return j("数据错误",400);}
}
}

if(url.pathname==="/api/fetch"&&request.method==="POST"){
try{
const b=await request.json();
if(!b.subUrl)return j("No URL",400);
const r=await fetch(b.subUrl,{headers:{"User-Agent":"ClashMeta/1.14.0"}});
if(!r.ok)throw new Error("拉取失败");
const text=await r.text();
let name=r.headers.get("profile-title")||"",disp=r.headers.get("content-disposition");
if(!name&&disp){
const m=disp.match(/filename\*?=UTF-8''([^'";\n]*)/i)||disp.match(/filename=["']?([^'";\n]+)["']?/i);
if(m)name=decodeURIComponent(m[1]).replace(/\.(txt|yaml|yml|json)$/i,"");
}
return j({text,name},200,{"Content-Type":"application/json"});
}catch(e){return j(e.message,500);}
}

const addFlag=n=>{
n=String(n||"").trim()||"未命名";
if(/🇭🇰|🇹🇼|🇯🇵|🇸🇬|🇰🇷|🇺🇸|🇬🇧|🇫🇷|🇩🇪|🇳🇱|🇷🇺|🇮🇳|🇦🇺|🇨🇦/.test(n))return n;
const rs=[
[/(\b|[^A-Z])(HK|Hong Kong|香港|深港|广港|沪港)(\b|[^A-Z])/i,"🇭🇰"],
[/(\b|[^A-Z])(TW|Taiwan|台湾|台灣|台北|新北|广台)(\b|[^A-Z])/i,"🇹🇼"],
[/(\b|[^A-Z])(JP|Japan|日本|东京|大阪|埼玉|广日)(\b|[^A-Z])/i,"🇯🇵"],
[/(\b|[^A-Z])(SG|Singapore|新加坡|狮城|广新)(\b|[^A-Z])/i,"🇸🇬"],
[/(\b|[^A-Z])(KR|Korea|韩国|首尔|春川|广韩)(\b|[^A-Z])/i,"🇰🇷"],
[/(\b|[^A-Z])(US|America|United States|美国|洛杉矶|圣何塞|纽约|西雅图|芝加哥|波特兰|达拉斯|广美)(\b|[^A-Z])/i,"🇺🇸"],
[/(\b|[^A-Z])(UK|Britain|英国|伦敦)(\b|[^A-Z])/i,"🇬🇧"],
[/(\b|[^A-Z])(FR|France|法国|巴黎)(\b|[^A-Z])/i,"🇫🇷"],
[/(\b|[^A-Z])(DE|Germany|德国|法兰克福)(\b|[^A-Z])/i,"🇩🇪"],
[/(\b|[^A-Z])(NL|Netherlands|荷兰|阿姆斯特丹)(\b|[^A-Z])/i,"🇳🇱"],
[/(\b|[^A-Z])(RU|Russia|俄罗斯|莫斯科)(\b|[^A-Z])/i,"🇷🇺"],
[/(\b|[^A-Z])(IN|India|印度|孟买)(\b|[^A-Z])/i,"🇮🇳"],
[/(\b|[^A-Z])(AU|Australia|澳大利亚|悉尼)(\b|[^A-Z])/i,"🇦🇺"],
[/(\b|[^A-Z])(CA|Canada|加拿大|蒙特利尔)(\b|[^A-Z])/i,"🇨🇦"]
];
for(const[r,f]of rs)if(r.test(n))return`${f} ${n}`;
return n;
};

const tryDecodeBase64=s=>{
try{
let x=String(s||"").replace(/\s+/g,"");
if(/^[A-Za-z0-9+/=._-]+$/.test(x)&&x.length>20&&!String(s).includes("- name:")){
x=x.replace(/-/g,"+").replace(/_/g,"/");
const p=x.length%4;if(p)x+="=".repeat(4-p);
const d=decodeURIComponent(escape(atob(x)));
if(d.includes("://")||d.includes("proxies:")||d.includes("- name:"))return d;
}
}catch(e){}
return s;
};

const extractProxies=t=>{
t=String(t||"");
if(t.includes("proxies:")){
const m=t.match(/proxies:\s*([\s\S]*)/i);
if(m)return m[1].trim();
}
return t.trim();
};

const splitProxyBlocks=t=>{
const lines=String(t||"").split(/\r?\n/),blocks=[];let cur=[];
for(const raw of lines){
const line=raw.replace(/\r/g,"");
if(/^\s*-\s+name:/i.test(line)||/^\s*-\s*\{/i.test(line)){
if(cur.length)blocks.push(cur.join("\n"));
cur=[line];
}else{
if(cur.length)cur.push(line);
else if(line.trim())blocks.push(line);
}
}
if(cur.length)blocks.push(cur.join("\n"));
return blocks.map(x=>x.trim()).filter(Boolean);
};

const parseSimpleYamlBlock=b=>{
const o={},lines=String(b||"").trim().split(/\r?\n/);
lines.forEach((line,i)=>{
line=line.replace(/\r/g,"").trimEnd();
if(i===0){
const m=line.trim().match(/^-\s*name:\s*(.+)$/i);
if(m)o.name=m[1].trim().replace(/^['"]|['"]$/g,"");
return;
}
line=line.trim();
const m=line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
if(m){
let v=(m[2]||"").trim().replace(/^['"]|['"]$/g,"");
o[m[1].trim()]=v;
}
});
return o;
};

const buildProxyLine=o=>{
const parts=[];
for(const[k,v]of Object.entries(o)){
if(v===""||v===null||typeof v==="undefined")continue;
if(Array.isArray(v)){
parts.push(`${k}: [${v.map(x=>typeof x==="number"?x:`"${String(x).replace(/"/g,'\\"')}"`).join(", ")}]`);
}else if(typeof v==="object"){
const sub=[];
for(const[kk,vv]of Object.entries(v)){
if(Array.isArray(vv)){
sub.push(`${kk}: [${vv.map(x=>typeof x==="number"?x:`"${String(x).replace(/"/g,'\\"')}"`).join(", ")}]`);
}else if(typeof vv==="object"&&vv!==null){
const mini=[];
for(const[mk,mv]of Object.entries(vv))mini.push(`${mk}: ${typeof mv==="number"?mv:`"${String(mv).replace(/"/g,'\\"')}"`}`);
sub.push(`${kk}: {${mini.join(", ")}}`);
}else{
sub.push(`${kk}: ${vv==="true"||vv==="false"||typeof vv==="number"?vv:`"${String(vv).replace(/"/g,'\\"')}"`}`);
}
}
parts.push(`${k}: {${sub.join(", ")}}`);
}else{
parts.push(`${k}: ${v==="true"||v==="false"||typeof v==="number"?v:`"${String(v).replace(/"/g,'\\"')}"`}`);
}
}
return`  - {${parts.join(", ")}}`;
};

const parseYamlProxyBlock=(block,processName)=>{
const trim=String(block||"").trim();
if(!trim)return null;

if(trim.startsWith("- {")){
const rep=trim.replace(/(name:\s*['"]?)([^'",}]+)(['"]?)/i,(_,a,b,c)=>a+processName(String(b).trim())+c);
return`  ${rep}`;
}
if(!/^\s*-\s*name:/i.test(trim))return null;

const o=parseSimpleYamlBlock(trim);
if(!o.name||!o.type)return`  # 无法识别代理块: ${trim.replace(/\n/g," | ")}`;

const name=processName(o.name),type=String(o.type).trim().toLowerCase();

if(["direct","block","reject","dns","urltest","select","fallback","load-balance","relay","selector"].includes(type)){
const obj={name,type};
for(const[k,v]of Object.entries(o)){
if(k==="name"||k==="type")continue;
if(v===""||String(v).toLowerCase()==="null")continue;
if(v==="true"||v==="false")obj[k]=v;
else if(!isNaN(Number(v))&&v!=="")obj[k]=Number(v);
else if(/^\[(.*)\]$/.test(v))obj[k]=v.slice(1,-1).split(",").map(x=>x.trim().replace(/^['"]|['"]$/g,"")).filter(Boolean);
else obj[k]=v;
}
return buildProxyLine(obj);
}

if(type==="vless")return buildProxyLine({name,server:o.server||"",port:Number(o.port||0),type:"vless",uuid:o.uuid||"",encryption:o.encryption||"none",...(o.tls&&o.tls!=="false"?{tls:"true"}:{}),...(o.servername?{servername:o.servername}:{}),...(o.network?{network:o.network}:{})});
if(type==="ss"||type==="shadowsocks")return buildProxyLine({name,server:o.server||"",port:Number(o.port||0),type:"ss",cipher:o.cipher||"",password:o.password||"",udp:"true"});
if(type==="trojan")return buildProxyLine({name,server:o.server||"",port:Number(o.port||0),type:"trojan",password:o.password||"",sni:o.sni||o.servername||o.server||"","skip-cert-verify":"true"});
if(type==="vmess")return buildProxyLine({name,server:o.server||"",port:Number(o.port||0),type:"vmess",uuid:o.uuid||"",alterId:Number(o.alterId||0),cipher:o.cipher||"auto"});
if(type==="hysteria2")return buildProxyLine({name,server:o.server||"",port:Number(o.port||0),type:"hysteria2",password:o.password||"",sni:o.sni||o.server||"","skip-cert-verify":"true",alpn:["h3"]});
if(type==="tuic")return buildProxyLine({name,server:o.server||"",port:Number(o.port||0),type:"tuic",uuid:o.uuid||"",password:o.password||"",sni:o.sni||o.server||"","skip-cert-verify":"true",alpn:["h3"],"congestion-controller":"bbr","udp-relay-mode":"native"});

const fb={name,type};
for(const[k,v]of Object.entries(o)){
if(k==="name"||k==="type")continue;
if(v===""||String(v).toLowerCase()==="null")continue;
if(v==="true"||v==="false")fb[k]=v;
else if(!isNaN(Number(v))&&v!=="")fb[k]=Number(v);
else fb[k]=v;
}
return buildProxyLine(fb);
};

const parseLinksToArray=(linksStr,replaceRule)=>{
let s=extractProxies(tryDecodeBase64(linksStr)),blocks=splitProxyBlocks(s),proxies=[],nameCount={};
const processName=raw=>{
let n=String(raw||"").trim();
if(replaceRule&&replaceRule.find){try{n=n.replace(new RegExp(replaceRule.find,"gi"),replaceRule.replace||"");}catch(e){}}
n=addFlag(n);
if(nameCount[n]){const i=nameCount[n];nameCount[n]++;return`${n}-${i}`;}
nameCount[n]=1;return n;
};

for(const block of blocks){
const line=String(block||"").trim();
if(!line)continue;
try{
if(/^\s*-\s*name:/i.test(line)||/^\s*-\s*\{/i.test(line)){const x=parseYamlProxyBlock(line,processName);if(x)proxies.push(x);continue;}

if(line.startsWith("vless://")){
const u=new URL(line),name=processName(decodeURIComponent(u.hash.substring(1)||"VLESS"));
let proxy={name,server:u.hostname,port:Number(u.port||0),type:"vless",uuid:u.username,encryption:u.searchParams.get("encryption")||"none"};
const sec=u.searchParams.get("security")||"";
if(sec==="tls"||sec==="reality"){proxy.tls="true";proxy["skip-cert-verify"]="true";proxy.servername=u.searchParams.get("sni")||u.hostname;}
if(u.searchParams.get("flow"))proxy.flow=u.searchParams.get("flow");
const net=u.searchParams.get("type")||"tcp";
if(net==="ws"){proxy.network="ws";proxy["ws-opts"]={path:u.searchParams.get("path")||"/",headers:{Host:u.searchParams.get("host")||u.searchParams.get("sni")||u.hostname}};}
else if(net==="grpc"){proxy.network="grpc";proxy["grpc-opts"]={"grpc-service-name":u.searchParams.get("serviceName")||u.searchParams.get("service-name")||""};}
else if(net==="http"||net==="h2")proxy.network="http";
else proxy.network="tcp";
proxies.push(buildProxyLine(proxy));
}
else if(line.startsWith("hysteria2://")){
const u=new URL(line),name=processName(decodeURIComponent(u.hash.substring(1)||"Hysteria2")),sni=u.searchParams.get("sni")||u.hostname;
proxies.push(buildProxyLine({name,server:u.hostname,port:Number(u.port||0),type:"hysteria2",password:u.username,sni,"skip-cert-verify":"true",alpn:["h3"]}));
}
else if(line.startsWith("tuic://")){
const u=new URL(line),name=processName(decodeURIComponent(u.hash.substring(1)||"TUIC")),auth=decodeURIComponent(u.username||"").split(":"),sni=u.searchParams.get("sni")||u.hostname;
proxies.push(buildProxyLine({name,server:u.hostname,port:Number(u.port||0),type:"tuic",uuid:auth[0]||"",password:auth[1]||"",sni,"skip-cert-verify":"true",alpn:["h3"],"congestion-controller":"bbr","udp-relay-mode":"native"}));
}
else if(line.startsWith("vmess://")){
const b64=line.substring(8).replace(/-/g,"+").replace(/_/g,"/"),pad=b64.length%4,padded=pad?b64+"=".repeat(4-pad):b64;
const js=JSON.parse(decodeURIComponent(escape(atob(padded)))),name=processName(js.ps||"VMess");
let proxy={name,server:js.add||"",port:Number(js.port||0),type:"vmess",uuid:js.id||"",alterId:Number(js.aid||0),cipher:"auto"};
if(js.tls==="tls"){proxy.tls="true";proxy["skip-cert-verify"]="true";proxy.servername=js.sni||js.host||js.add||"";}
if(js.net==="ws"){proxy.network="ws";proxy["ws-opts"]={path:js.path||"/",headers:{Host:js.host||js.add||""}};}
else if(js.net==="grpc"){proxy.network="grpc";proxy["grpc-opts"]={"grpc-service-name":js.path||js.serviceName||""};}
else proxy.network="tcp";
proxies.push(buildProxyLine(proxy));
}
else if(line.startsWith("ss://")||line.startsWith("trojan://")||line.startsWith("ssr://")){
proxies.push(`  # 暂不转换此协议至YAML: ${line}`);
}
}catch(e){proxies.push(`  # 解析失败: ${line} -> ${e.message}`);}
}
return proxies.join("\n");
};

const buildConfig=async(rawLinks,tmplUrl,replaceRule)=>{
const proxiesStr=parseLinksToArray(rawLinks,replaceRule);
if(!tmplUrl)return"proxies:\n"+proxiesStr;
let tmplText="";
try{
const r=await fetch(tmplUrl);
if(!r.ok)throw new Error("Fetch failed");
tmplText=await r.text();
}catch(e){
return'proxies:\n  - {name: "加载远程模板失败", type: "direct"}\n'+proxiesStr;
}
let out=tmplText.replace(/^proxies:\s*$/m,`proxies:\n${proxiesStr}`);
if(out===tmplText)out=tmplText.replace(/proxies:\s*\n/m,`proxies:\n${proxiesStr}\n`);
if(out===tmplText)out=tmplText+"\nproxies:\n"+proxiesStr;
return out;
};

if(request.method==="POST"&&url.pathname==="/api/shorten"){
if(!env.MY_KV)return j("KV NOT FOUND",500);
try{
const payload=await request.json();
if(!payload.links)return j("Empty",400);
const shortId=payload.alias?encodeURIComponent(payload.alias):Math.random().toString(36).substring(2,8);
payload.createdAt=Date.now();
payload.accessedIPs=[];
await env.MY_KV.put(shortId,JSON.stringify(payload),{metadata:{name:payload.filename||"未命名",createdAt:payload.createdAt,max:payload.maxDownloads||"无",burn:payload.burn||false,accessed:0}});
return j(shortId);
}catch(e){return j("Format Error",400);}
}

if(url.pathname.startsWith("/sub")){
let cfg={},shortId=url.pathname.split("/")[2],clientIP=request.headers.get("CF-Connecting-IP")||"unknown";
try{
if(!env.MY_KV)return j("KV ERROR",500);
if(!shortId)return j("Invalid ID",400);
const kvData=await env.MY_KV.get(shortId);
if(!kvData)return j("404: 订阅不存在或已被销毁",404);
cfg=JSON.parse(kvData);
if(!cfg.accessedIPs)cfg.accessedIPs=[];
if(cfg.burn){
await env.MY_KV.delete(shortId);
}else{
const now=Date.now(),isExpired=(cfg.expireAt&&now>cfg.expireAt)||(cfg.expireDays&&now>cfg.createdAt+cfg.expireDays*86400000);
if(isExpired){await env.MY_KV.delete(shortId);return j("410: 订阅已过期",410);}
if(cfg.maxDownloads&&!cfg.accessedIPs.includes(clientIP)){
if(cfg.accessedIPs.length>=cfg.maxDownloads)return j(`403: IP 上限拦截\nIP: ${clientIP}`,403);
cfg.accessedIPs.push(clientIP);
await env.MY_KV.put(shortId,JSON.stringify(cfg),{metadata:{name:cfg.filename||"未命名",createdAt:cfg.createdAt,max:cfg.maxDownloads||"无",burn:cfg.burn||false,accessed:cfg.accessedIPs.length}});
}
}
const filename=cfg.filename?encodeURIComponent(cfg.filename):"My_Config";
const headers={"Content-Type":"text/plain; charset=utf-8","Content-Disposition":`inline; filename="${filename}.${cfg.universal?"txt":"yaml"}"`,"Profile-Update-Interval":"12","profile-title":decodeURIComponent(filename)};
if(cfg.subInfo)headers["Subscription-Userinfo"]=`upload=${cfg.subInfo.up}; download=${cfg.subInfo.down}; total=${cfg.subInfo.total}; expire=${cfg.subInfo.expire}`;
let outText="";
if(cfg.universal){
let rawData=extractProxies(tryDecodeBase64(cfg.links));
if(cfg.replaceRule&&cfg.replaceRule.find){try{rawData=rawData.replace(new RegExp(cfg.replaceRule.find,"gi"),cfg.replaceRule.replace||"");}catch(e){}}
outText=btoa(unescape(encodeURIComponent(rawData)));
}else outText=await buildConfig(cfg.links,cfg.tmplUrl,cfg.replaceRule);
return new Response(outText,{headers});
}catch(e){return j("Error: "+e.message,500);}
}

const bgImg=env.IMG||"",workerDomain=`${url.protocol}//${url.host}/sub`;

const html=`<!DOCTYPE html><html lang="zh-CN" data-theme="light"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>⚡ web-sublinks | Pro 控制台</title><style>
:root{--primary:#4f46e5;--accent:#0ea5e9;--danger:#ef4444;--success:#10b981;--warning:#f59e0b;--bg-color:#f1f5f9;--text-main:#0f172a;--text-muted:#64748b;--glass-bg:rgba(255,255,255,.7);--glass-border:rgba(255,255,255,.5);--input-bg:rgba(255,255,255,.6);--input-border:rgba(15,23,42,.1);--inner-highlight:inset 0 1px 1px rgba(255,255,255,.8);--shadow-card:0 10px 30px -10px rgba(0,0,0,.08);--blur-radius:16px}
[data-theme="dark"]{--bg-color:#0f172a;--text-main:#f8fafc;--text-muted:#94a3b8;--glass-bg:rgba(15,23,42,.65);--glass-border:rgba(255,255,255,.1);--input-bg:rgba(0,0,0,.2);--input-border:rgba(255,255,255,.1);--inner-highlight:inset 0 1px 1px rgba(255,255,255,.05);--shadow-card:0 15px 35px -5px rgba(0,0,0,.4)}
*{box-sizing:border-box}body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background-color:var(--bg-color);color:var(--text-main);margin:0;padding:40px 20px;display:flex;justify-content:center;line-height:1.6;transition:.4s}
${bgImg?`body{background-image:url('${bgImg}');background-size:cover;background-position:center;background-attachment:fixed}.card,.theme-toggle{background:var(--glass-bg)!important;backdrop-filter:blur(var(--blur-radius)) saturate(180%);-webkit-backdrop-filter:blur(var(--blur-radius)) saturate(180%);border:1px solid var(--glass-border)!important}`:""}
.container{width:100%;max-width:1100px}.header{text-align:center;margin-bottom:40px}.header h1{font-size:32px;font-weight:800;margin:0 0 10px;letter-spacing:-.5px;background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;cursor:pointer;user-select:none}.header p{color:var(--text-muted);font-size:15px;margin:0;font-weight:500}
.grid-layout{display:grid;grid-template-columns:1.1fr 1fr;gap:32px;align-items:start}.col-left,.col-right{display:flex;flex-direction:column;gap:24px}@media(max-width:900px){body{padding:30px 16px}.grid-layout{grid-template-columns:1fr;gap:24px}}
.theme-toggle{position:fixed;top:24px;right:24px;width:48px;height:48px;border-radius:50%;background:var(--bg-color);border:1px solid var(--input-border);color:var(--text-main);display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;box-shadow:var(--shadow-card);z-index:9999}
.card{background:var(--bg-color);border:1px solid var(--input-border);border-radius:20px;padding:28px;box-shadow:var(--shadow-card),var(--inner-highlight)}
.card-title{font-size:17px;font-weight:700;margin-bottom:20px;display:flex;align-items:center;gap:10px}
.tabs{display:flex;background:var(--input-bg);border-radius:12px;padding:6px;margin-bottom:20px;border:1px solid var(--input-border)}.tab-btn{flex:1;padding:10px;text-align:center;font-size:14px;font-weight:600;color:var(--text-muted);cursor:pointer;border-radius:8px}.tab-btn.active{background:var(--primary);color:#fff}
.tab-content{display:none}.tab-content.active{display:block}
textarea,input[type=text],input[type=number],input[type=date],input[type=datetime-local],select{width:100%;padding:12px 16px;border:1px solid var(--input-border);border-radius:12px;background:var(--input-bg);color:var(--text-main);font-size:14px;font-family:inherit}
textarea{height:160px;font-family:JetBrains Mono,monospace;font-size:13px;resize:vertical}
textarea:focus,input:focus,select:focus{outline:none;border-color:var(--primary)!important;box-shadow:0 0 0 4px rgba(79,70,229,.15)}
.upload-area{border:2px dashed var(--primary);border-radius:16px;padding:40px 20px;text-align:center;cursor:pointer;color:var(--primary);font-weight:600;background:rgba(79,70,229,.03)}
.row{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--input-border);flex-wrap:wrap;gap:12px}.row:last-child{border-bottom:none;padding-bottom:0}
.row-text{flex:1;min-width:160px}.row-text strong{display:block;font-size:15px;margin-bottom:4px;font-weight:600}.row-text span{color:var(--text-muted);font-size:13px}
.input-wrap{display:flex;align-items:center;gap:12px;flex:1;justify-content:flex-end;min-width:180px}
.switch{position:relative;display:inline-block;width:48px;height:26px}.switch input{opacity:0;width:0;height:0}.slider{position:absolute;inset:0;background-color:rgba(148,163,184,.4);border-radius:26px}.slider:before{position:absolute;content:"";height:20px;width:20px;left:3px;bottom:3px;background:#fff;transition:.3s;border-radius:50%}input:checked + .slider{background-color:var(--success)}input:checked + .slider:before{transform:translateX(22px)}
.tmpl-grid{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}.tmpl-card{padding:12px 16px;border:1px solid var(--input-border);border-radius:12px;background:var(--input-bg);cursor:pointer;font-size:14px;font-weight:500;position:relative;color:var(--text-muted);flex:1;min-width:140px;text-align:center}.tmpl-card.active{border-color:var(--primary)!important;background:rgba(79,70,229,.1)!important;color:var(--primary)!important;font-weight:700}.tmpl-card .del-btn{position:absolute;top:-8px;right:-8px;background:var(--danger);color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:20px;font-size:14px;display:none}.tmpl-card:hover .del-btn{display:block}
.btn-primary{width:100%;padding:18px;border:none;border-radius:16px;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;font-weight:700;font-size:17px;cursor:pointer}.btn-sub{padding:12px 18px;border:none;border-radius:12px;cursor:pointer;font-weight:600;font-size:14px}.btn-danger{background:rgba(239,68,68,.1);color:var(--danger);border:1px solid rgba(239,68,68,.3);padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px}
.alert-box{background:rgba(245,158,11,.1);border-left:4px solid var(--warning);padding:14px 18px;border-radius:0 12px 12px 0;margin-top:16px;font-size:14px;color:#d97706}.hidden{display:none!important}.traffic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin-top:16px;padding-top:16px;border-top:1px dashed var(--input-border)}
.toast-container{position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;flex-direction:column;gap:12px;pointer-events:none}.toast{background:var(--glass-bg,#fff);backdrop-filter:blur(12px);border:1px solid var(--glass-border,#e2e8f0);padding:14px 24px;border-radius:14px;box-shadow:var(--shadow-card),var(--inner-highlight);font-weight:600;font-size:15px}
.admin-list{display:flex;flex-direction:column;gap:10px;max-height:400px;overflow-y:auto;padding-right:5px}.admin-item{background:var(--input-bg);border:1px solid var(--input-border);border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center}.admin-item-info strong{font-size:15px;display:block;margin-bottom:4px}.admin-item-info span{font-size:12px;color:var(--text-muted);display:inline-block;margin-right:12px}.admin-item-info span b{color:var(--primary);font-weight:700}
</style></head><body>
<button class="theme-toggle" onclick="toggleTheme()"><span id="themeIcon">🌙</span></button><div class="toast-container" id="toastContainer"></div>
<div class="container"><div class="header"><h1 id="secretTitle">✈️ web-sublinks</h1><p>商业级订阅分发与安全管理中心</p></div>
<div class="grid-layout"><div class="col-left">
<div class="card"><div class="tabs"><div class="tab-btn active" onclick="switchTab('paste')" id="tab-paste">📄 剪贴板</div><div class="tab-btn" onclick="switchTab('file')" id="tab-file">⬆️ 文件</div><div class="tab-btn" onclick="switchTab('url')" id="tab-url">🔗 订阅</div></div>
<div id="content-paste" class="tab-content active"><textarea id="inputLinks" placeholder="支持单条节点、Base64或完整 YAML..."></textarea></div>
<div id="content-file" class="tab-content"><div class="upload-area" id="dropZone" onclick="document.getElementById('fileInput').click()"><div style="font-size:32px;margin-bottom:12px">📂</div><div id="fileStatus" style="font-size:15px">点击选择文件，或将文件拖拽到此处</div><div style="font-size:12px;color:var(--text-muted);margin-top:10px">仅支持文本格式 (.txt, .yaml等)</div></div><input type="file" id="fileInput" accept=".txt,.yaml,.yml,.json,.ini,.conf" style="display:none;" onchange="handleFile(this.files[0])"></div>
<div id="content-url" class="tab-content"><input type="text" id="inputUrl" placeholder="输入机场订阅链接..." style="padding:18px;"><div style="font-size:12px;color:var(--text-muted);margin-top:10px">由云端智能代拉取，无视网络拦截。</div></div>
<div id="content-admin" class="tab-content"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px"><span style="font-weight:bold;color:var(--primary)">👑 隐藏云端后台</span><button onclick="switchTab('paste')" class="btn-sub" style="padding:6px 12px;background:var(--input-bg);border:1px solid var(--input-border)">退出后台</button></div><div class="admin-list" id="adminList">加载中...</div></div></div>
<div class="card" id="tmplPanel"><div class="card-title">🔗 路由模板挂载 (仅 Clash 生效)</div><div class="tmpl-grid" id="tmplGrid">加载中...</div><div class="hidden" id="addTmplArea" style="margin-top:20px;"><div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;"><input type="text" id="newTmplName" placeholder="模板别名" style="flex:1;min-width:100px;"><input type="text" id="newTmplUrl" placeholder="https://raw..." style="flex:2;min-width:180px;"></div><div style="display:flex;gap:12px;"><button onclick="saveNewTmpl('local')" class="btn-sub" style="flex:1;background:var(--input-bg);color:var(--text-main);border:1px solid var(--input-border)">💻 本地保存</button><button onclick="saveNewTmpl('cloud')" class="btn-sub" style="flex:1;background:var(--primary);color:#fff">☁️ 云端同步</button></div></div></div>
<div style="display:flex;gap:16px;"><button class="btn-primary" id="generateBtn" onclick="generateLink()" style="flex:2">🚀 生成云端短链</button><button class="btn-primary" id="generateLongBtn" onclick="generateLong()" style="flex:1;background:var(--input-bg);color:var(--text-main);border:1px solid var(--input-border);box-shadow:none">🎈 免存长链</button></div>
<div id="resultArea" class="card hidden" style="border:2px solid var(--success)!important"><div style="color:var(--success);font-weight:800;font-size:16px;margin-bottom:16px;text-align:center">✅ 链接生成成功</div><input type="text" id="subUrl" style="text-align:center;font-weight:600;color:var(--primary);font-size:15px;padding:16px;background:rgba(79,70,229,.05)" readonly><div style="display:flex;gap:16px;margin-top:20px;flex-wrap:wrap;"><button onclick="window.open(document.getElementById('subUrl').value)" class="btn-sub" style="flex:1;background:var(--input-bg);color:var(--text-main);border:1px solid var(--input-border)">👀 浏览器预览</button><button onclick="copyUrl(false)" class="btn-sub" style="flex:1;background:var(--primary);color:#fff">📋 手动复制</button></div></div>
</div>
<div class="col-right">
<div class="card"><div class="card-title">⚙️ 基础设置</div>
<div class="row"><div class="row-text"><strong>配置显示名</strong><span>留空自动提取</span></div><div class="input-wrap"><input type="text" id="filename" placeholder="如: 我的网络"></div></div>
<div class="row"><div class="row-text"><strong>短链接后缀</strong><span>留空随机生成</span></div><div class="input-wrap"><input type="text" id="alias" placeholder="如: myvip"></div></div>
<div class="row"><div class="row-text"><strong>节点批量改名</strong><span>支持正则替换</span></div><div class="input-wrap" style="flex-wrap:nowrap;gap:8px"><input type="text" id="repFind" placeholder="查找" style="width:50%"><input type="text" id="repTo" placeholder="替换为" style="width:50%"></div></div>
<div class="row"><div class="row-text"><strong>通用订阅格式</strong><span>Base64 兼容全平台</span></div><label class="switch"><input type="checkbox" id="universal" onchange="toggleUniversal()"><span class="slider"></span></label></div>
<div id="universalWarning" class="alert-box hidden">⚠️ 开启后路由模板将失效。</div></div>
<div class="card"><div class="card-title">🛡️ 高级安全管理</div>
<div class="row"><div class="row-text"><strong>精确自动过期</strong><span>到期后销毁链接</span></div><label class="switch"><input type="checkbox" id="enableExpire" onchange="document.getElementById('expireSettings').classList.toggle('hidden')"><span class="slider"></span></label></div>
<div id="expireSettings" class="hidden" style="margin-top:12px;padding-top:16px;border-top:1px dashed var(--input-border);display:flex;gap:12px;flex-wrap:wrap;"><select id="expireType" onchange="toggleExpireInput()" style="flex:1"><option value="days">天数</option><option value="hours">小时</option><option value="date">指定日期</option></select><input type="number" id="expireNum" placeholder="数值..." style="flex:1"><input type="datetime-local" id="expireDate" class="hidden" style="width:100%"></div>
<div class="row"><div class="row-text"><strong>独立 IP 防泄露</strong><span>限制允许的网络数</span></div><div class="input-wrap" style="max-width:100px"><input type="number" id="maxDown" placeholder="IP数"></div></div>
<div class="row"><div class="row-text"><strong>阅后即焚模式</strong><span>拉取即自毁</span></div><label class="switch"><input type="checkbox" id="burnMode"><span class="slider"></span></label></div>
<div class="row"><div class="row-text"><strong>伪装流量面板</strong><span>展示饼图及到期</span></div><label class="switch"><input type="checkbox" onchange="document.getElementById('trafficArea').classList.toggle('hidden')"><span class="slider"></span></label></div>
<div id="trafficArea" class="hidden traffic-grid"><input type="text" id="tUp" placeholder="上传 (10G)"><input type="text" id="tDown" placeholder="下载 (50G)"><input type="text" id="tTotal" placeholder="总计 (200G)"><input type="date" id="tExpireDate" style="grid-column:1/-1"></div>
</div></div></div></div>
<script>
function showToast(msg,icon="🔔"){const c=document.getElementById("toastContainer"),t=document.createElement("div");t.className="toast";t.innerHTML="<span>"+icon+"</span> "+msg;c.appendChild(t);setTimeout(()=>{t.parentNode&&t.parentNode.removeChild(t)},3000)}
function initTheme(){const s=localStorage.getItem("__pro_theme"),d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(s==="dark"||(!s&&d)){document.documentElement.setAttribute("data-theme","dark");document.getElementById("themeIcon").innerText="🌞"}else{document.documentElement.setAttribute("data-theme","light");document.getElementById("themeIcon").innerText="🌙"}}
function toggleTheme(){const n=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",n);localStorage.setItem("__pro_theme",n);document.getElementById("themeIcon").innerText=n==="dark"?"🌞":"🌙"}
initTheme();

let currentTab="paste",uploadedFileText="";
function switchTab(tab){currentTab=tab;document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));document.querySelectorAll(".tab-content").forEach(c=>c.classList.remove("active"));document.getElementById("tab-"+tab)&&document.getElementById("tab-"+tab).classList.add("active");document.getElementById("content-"+tab)&&document.getElementById("content-"+tab).classList.add("active")}
let clickCount=0,clickTimer=null;
document.getElementById("secretTitle").addEventListener("click",()=>{clickCount++;if(clickCount===1)clickTimer=setTimeout(()=>clickCount=0,1500);if(clickCount>=5){clearTimeout(clickTimer);clickCount=0;loadAdminData()}});

async function loadAdminData(){
let pwd=localStorage.getItem("__admin_pwd")||prompt("👑 欢迎来到隐藏后台\\n请输入管理员密码：");if(!pwd)return;
switchTab("admin");document.getElementById("adminList").innerHTML='<div style="text-align:center;padding:20px;">⏳ 云端数据读取中...</div>';
try{
const res=await fetch("/api/list_subs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pwd})});
if(res.status===403){localStorage.removeItem("__admin_pwd");showToast("密码错误","❌");switchTab("paste");return;}
localStorage.setItem("__admin_pwd",pwd);
const subs=await res.json();
if(!subs.length){document.getElementById("adminList").innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);">暂无云端短链数据</div>';return;}
let html="";
subs.forEach(s=>{const d=new Date(s.createdAt).toLocaleString(),burn=s.burn?'<span style="color:var(--danger);border:1px solid var(--danger);padding:2px 4px;border-radius:4px;font-size:10px;">阅后即焚</span>':"";html+=\`<div class="admin-item"><div class="admin-item-info"><strong>🔗 /sub/\${s.id} \${burn}</strong><span>配置名: <b>\${s.name||""}</b></span><span>IP访问: <b>\${s.accessed} / \${s.max}</b></span><br><span style="margin-top:4px;">📅 创建于: \${d}</span></div><button class="btn-danger" onclick="deleteSub('\${s.id}')">销毁</button></div>\`;});
document.getElementById("adminList").innerHTML=html;
}catch(e){showToast("加载失败","❌");switchTab("paste");}
}

async function deleteSub(id){
if(!confirm("确定要从 KV 云端彻底销毁这个订阅链接吗？"))return;
const pwd=localStorage.getItem("__admin_pwd");
try{
const res=await fetch("/api/del_sub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pwd,id})});
if(res.ok){showToast("已从云端彻底销毁！","✅");loadAdminData()}else showToast("销毁失败","❌");
}catch(e){}
}

const dropZone=document.getElementById("dropZone");
dropZone.addEventListener("dragover",e=>{e.preventDefault();dropZone.style.borderColor="var(--accent)"});
dropZone.addEventListener("dragleave",()=>dropZone.style.borderColor="var(--primary)");
dropZone.addEventListener("drop",e=>{e.preventDefault();dropZone.style.borderColor="var(--primary)";if(e.dataTransfer.files.length>0)handleFile(e.dataTransfer.files[0])});

function handleFile(file){
if(!file)return;
if(file.type.startsWith("image/")||file.type.startsWith("video/")||file.name.endsWith(".zip"))return showToast("不支持的文件格式！","❌");
const r=new FileReader();
r.onload=e=>{uploadedFileText=e.target.result;document.getElementById("fileStatus").innerHTML='✅ <b style="color:var(--success)">已加载:</b> '+file.name;dropZone.style.background='rgba(16,185,129,.05)';dropZone.style.borderColor='var(--success)'};
r.readAsText(file);
}

const domain='${workerDomain}',baseTemplates=[{id:"noom",name:"🟢 NooM Pro",url:"https://raw.githubusercontent.com/lijboys/li-rules/refs/heads/main/Rewards/NooM.ini"},{id:"none",name:"❌ 纯净节点",url:""}];
let cloudTemplates=[],localTemplates=JSON.parse(localStorage.getItem("__local_tmpls")||"[]"),currentSelectedUrl=baseTemplates[0].url;

function toggleUniversal(){const c=document.getElementById("universal").checked;document.getElementById("tmplPanel").style.display=c?"none":"block";document.getElementById("universalWarning").classList.toggle("hidden",!c)}
function toggleExpireInput(){const t=document.getElementById("expireType").value;if(t==="date"){document.getElementById("expireNum").classList.add("hidden");document.getElementById("expireDate").classList.remove("hidden")}else{document.getElementById("expireNum").classList.remove("hidden");document.getElementById("expireDate").classList.add("hidden")}}
async function fetchCloudTmpls(){try{cloudTemplates=await(await fetch("/api/tmpl")).json()}catch(e){}renderTmpls()}
function renderTmpls(){const g=document.getElementById("tmplGrid");g.innerHTML="";baseTemplates.forEach(t=>renderCard(t,"base",-1));cloudTemplates.forEach((t,i)=>renderCard(t,"cloud",i));localTemplates.forEach((t,i)=>renderCard(t,"local",i));renderCard({id:"add",name:"➕ 添加模板...",url:"ACTION_ADD"},"base",-1)}
function renderCard(t,type,index){const d=document.createElement("div");d.className="tmpl-card "+(t.url===currentSelectedUrl&&t.id!=="add"?"active":"");d.innerText=t.name;if(type!=="base"){const x=document.createElement("div");x.className="del-btn";x.innerText="×";x.onclick=e=>{e.stopPropagation();deleteTmpl(type,index)};d.appendChild(x)}d.onclick=()=>{if(t.id==="add"){document.getElementById("addTmplArea").classList.remove("hidden");document.querySelectorAll(".tmpl-card").forEach(c=>c.classList.remove("active"));d.classList.add("active");return}document.getElementById("addTmplArea").classList.add("hidden");currentSelectedUrl=t.url;renderTmpls()};document.getElementById("tmplGrid").appendChild(d)}
async function saveNewTmpl(mode){
const name=document.getElementById("newTmplName").value.trim(),url=document.getElementById("newTmplUrl").value.trim();if(!name||!url)return;
if(mode==="local"){localTemplates.push({name:"💻 "+name,url});localStorage.setItem("__local_tmpls",JSON.stringify(localTemplates));finishSave(url)}
else{
let pwd=localStorage.getItem("__admin_pwd")||prompt("☁️ 验证密码：");if(!pwd)return;
const newTmpls=[...cloudTemplates,{name:"☁️ "+name,url}];
try{
const res=await fetch("/api/tmpl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pwd,tmpls:newTmpls})});
if(res.status===403){localStorage.removeItem("__admin_pwd");return showToast("密码错误","❌")}
if(!res.ok)return showToast("保存失败","❌");
localStorage.setItem("__admin_pwd",pwd);cloudTemplates=newTmpls;finishSave(url);
}catch(e){showToast("保存失败","❌")}
}}
function finishSave(url){currentSelectedUrl=url;document.getElementById("newTmplName").value="";document.getElementById("newTmplUrl").value="";document.getElementById("addTmplArea").classList.add("hidden");renderTmpls()}
async function deleteTmpl(type,index){
if(!confirm("确定删除吗？"))return;
if(type==="local"){if(localTemplates[index].url===currentSelectedUrl)currentSelectedUrl=baseTemplates[0].url;localTemplates.splice(index,1);localStorage.setItem("__local_tmpls",JSON.stringify(localTemplates));renderTmpls()}
else{
let pwd=localStorage.getItem("__admin_pwd")||prompt("密码：");if(!pwd)return;
const newTmpls=[...cloudTemplates];if(newTmpls[index].url===currentSelectedUrl)currentSelectedUrl=baseTemplates[0].url;newTmpls.splice(index,1);
try{
const res=await fetch("/api/tmpl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pwd,tmpls:newTmpls})});
if(res.status===403){localStorage.removeItem("__admin_pwd");return showToast("密码错误","❌")}
if(!res.ok)return showToast("删除失败","❌");
localStorage.setItem("__admin_pwd",pwd);cloudTemplates=newTmpls;renderTmpls();
}catch(e){}
}}
function parseBytes(str){if(!str)return 0;const s=String(str).toUpperCase(),v=parseFloat(s);if(isNaN(v))return 0;if(s.includes("T"))return Math.floor(v*1099511627776);if(s.includes("G"))return Math.floor(v*1073741824);if(s.includes("M"))return Math.floor(v*1048576);if(s.includes("K"))return Math.floor(v*1024);return Math.floor(v)}
async function getFinalInputText(){
let text="",defaultName="";
if(currentTab==="paste")text=document.getElementById("inputLinks").value.trim();
else if(currentTab==="file"){if(!uploadedFileText)throw new Error("请先上传文件");text=uploadedFileText.trim();}
else if(currentTab==="url"){
const subUrl=document.getElementById("inputUrl").value.trim();if(!subUrl)throw new Error("请填写订阅链接");
const res=await fetch("/api/fetch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subUrl})});
if(!res.ok)throw new Error("云端代拉取失败，请检查链接");
const data=await res.json();text=data.text;defaultName=data.name;
}
if(!defaultName&&text){const m=text.match(/^[#;!\/]+\s*(?:NAME|profile-title|title|name):\s*(.+)$/im);if(m)defaultName=m[1].trim();}
return{text,defaultName};
}

async function generateLink(){
const btn=document.getElementById("generateBtn"),old=btn.innerText;btn.innerText="⏳ 处理中...";
try{
const{text:links,defaultName}=await getFinalInputText();if(!links)throw new Error("解析内容为空");
const finalFilename=document.getElementById("filename").value.trim()||defaultName||"",maxDownVal=document.getElementById("maxDown").value;
const payload={links,filename:finalFilename,alias:document.getElementById("alias").value.trim(),universal:document.getElementById("universal").checked,tmplUrl:currentSelectedUrl,maxDownloads:maxDownVal?parseInt(maxDownVal):null,burn:document.getElementById("burnMode").checked};
const repFind=document.getElementById("repFind").value.trim(),repTo=document.getElementById("repTo").value;if(repFind)payload.replaceRule={find:repFind,replace:repTo};
if(document.getElementById("enableExpire").checked){
const type=document.getElementById("expireType").value;let expireAt=null;
if(type==="days"){const v=parseFloat(document.getElementById("expireNum").value);if(v)expireAt=Date.now()+v*86400000}
else if(type==="hours"){const v=parseFloat(document.getElementById("expireNum").value);if(v)expireAt=Date.now()+v*3600000}
else if(type==="date"){const v=document.getElementById("expireDate").value;if(v)expireAt=new Date(v).getTime()}
if(expireAt)payload.expireAt=expireAt;
}
if(!document.getElementById("trafficArea").classList.contains("hidden")){
const expDateStr=document.getElementById("tExpireDate").value;
payload.subInfo={up:parseBytes(document.getElementById("tUp").value),down:parseBytes(document.getElementById("tDown").value),total:parseBytes(document.getElementById("tTotal").value),expire:expDateStr?Math.floor(new Date(expDateStr).getTime()/1000):0};
}
const res=await fetch("/api/shorten",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
if(!res.ok)throw new Error(await res.text());
const txt=await res.text();
document.getElementById("subUrl").value=domain+"/"+txt;document.getElementById("resultArea").classList.remove("hidden");copyUrl(true);showToast("🎉 生成成功并已自动复制！","✅");
}catch(e){showToast(e.message,"❌")}finally{btn.innerText=old}
}

async function generateLong(){
const btn=document.getElementById("generateLongBtn"),old=btn.innerText;btn.innerText="⏳ 打包中...";
try{
const{text:links,defaultName}=await getFinalInputText();if(!links)throw new Error("内容为空");
let finalUrl=domain+"?data="+btoa(unescape(encodeURIComponent(links)));
if(document.getElementById("universal").checked)finalUrl+="&uni=1";else if(currentSelectedUrl)finalUrl+="&tmpl="+btoa(currentSelectedUrl);
const finalFilename=document.getElementById("filename").value.trim()||defaultName||"";if(finalFilename)finalUrl+="&name="+encodeURIComponent(finalFilename);
const repFind=document.getElementById("repFind").value.trim(),repTo=document.getElementById("repTo").value;if(repFind)finalUrl+="&rf="+btoa(unescape(encodeURIComponent(repFind)))+"&rt="+btoa(unescape(encodeURIComponent(repTo)));
document.getElementById("subUrl").value=finalUrl;document.getElementById("resultArea").classList.remove("hidden");copyUrl(true);showToast("🎈 免存长链生成并自动复制！","✅");
}catch(e){showToast(e.message,"❌")}finally{btn.innerText=old}
}

async function copyUrl(isAuto=false){document.getElementById("subUrl").select();try{await navigator.clipboard.writeText(document.getElementById("subUrl").value);if(!isAuto)showToast("已复制到剪贴板！","✅")}catch(e){if(!isAuto)showToast("复制失败，请手动复制","❌")}}
window.onload=fetchCloudTmpls;
</script></body></html>`;

return new Response(html,{headers:{"Content-Type":"text/html;charset=UTF-8"}});
}};
