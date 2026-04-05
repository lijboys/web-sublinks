# ✈️ Pro 订阅控制台 (Serverless Sub-Console)

![Version](https://img.shields.io/badge/Version-9.0.0-blue.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![Platform](https://img.shields.io/badge/Platform-Cloudflare_Workers-orange.svg)

**Pro 订阅控制台** 是一款基于 Cloudflare Workers 构建的 Serverless 商业级节点转换与订阅分发中枢。
彻底告别繁重的后端框架（如 subconverter、Sub-Store），只需一个单文件脚本，即可拥有**极品毛玻璃 UI**、**多源节点解析**、**远端模板注入**以及**防白嫖级的高级安全管控**功能。

---

## ✨ 核心亮点

### 🎨 极致的现代化 UI
- **全动态毛玻璃 (Glassmorphism)**：支持通过环境变量注入自定义背景图，卡片及控件自动呈现高斯模糊的磨砂玻璃质感。
- **日/夜间模式无缝切换**：自适应系统主题，支持手动切换并本地记忆。
- **响应式多端适配**：无论是 PC 端的高效管理，还是手机端的便捷操作，排版完美贴合。

### 🔌 强大的多源解析能力
支持从三大输入源自动提取并解析节点：
1. **📄 剪贴板智能解析**：无论是单条节点 (`vless://`, `hy2://`, `tuic://`, `vmess://` 等)、Base64 订阅密文，还是完整的 Clash YAML 配置文件，皆可自动解密、提取、重命名去重。
2. **⬆️ 本地文件上传**：支持拖拽或选择 `.txt`, `.yaml`, `.json` 等本地配置。
3. **🔗 远端订阅拉取**：直接输入机场订阅链接，Worker 将代为拉取并处理（有效绕过跨域限制与本地 GFW 拦截）。

### 🛠️ 灵活的格式转换与模板引擎
- **Clash Meta 完美适配**：一键将节点无缝注入到指定的远端 GitHub YAML 模板（如 ACL4SSR 或自定义规则）中。
- **本地 / 云端模板双轨库**：支持保存常用的远端模板链接。可选择存入本地设备（免密）或同步至云端 KV（需鉴权），跨设备多端同频。
- **通用 Base64 输出**：一键开启“通用订阅格式”，兼容 v2rayN、Shadowrocket 等全平台客户端。

### 🛡️ 商业级防泄露与安全控制
依托 Cloudflare KV，提供极客级别的订阅分发控制：
- **精确自动过期**：支持按 **天数**、**小时** 或 **指定精准日期时间** 自动销毁订阅。
- **独立 IP 防泄露**：限制允许拉取订阅的不同网络 IP 数量，同 IP 刷新不扣次，彻底杜绝合租/分享滥用。
- **阅后即焚**：客户端成功拉取一次后，云端配置立即自毁。
- **伪装流量面板**：可自定义上传、下载、总流量及到期时间，在 Clash 客户端内完美呈现流量统计图表。

---

## 🚀 部署指南

本项目完全依赖 Cloudflare Workers 和 KV 数据库，**永久免费且无需购买服务器**。

### 第一步：创建 KV 数据库
1. 登录 Cloudflare 控制台，进入 **Workers & Pages** -> **KV**。
2. 点击 **创建命名空间**，命名为 `SUB_STORE` (或你喜欢的任何名字)。

### 第二步：创建 Worker 并绑定 KV
1. 在 **Workers & Pages** 中创建一个新的 Worker。
2. 进入 Worker 的 **设置 (Settings)** -> **变量和机密 (Variables and Secrets)**。
3. 在 **KV 命名空间绑定** 中：
   - 变量名称 **必须** 填入：`MY_KV`
   - 命名空间选择你刚刚创建的 `SUB_STORE`。

### 第三步：配置环境变量 (Variables)
在同样的 **变量和机密** 页面下，添加以下环境变量（明文）：
| 变量名 | 必填 | 示例值 | 说明 |
| :--- | :---: | :--- | :--- |
| `ADMIN_PWD` | ✅ | `your_password` | **核心安全密码**。用于在前端保存/删除云端模板时的权限校验。保护你的 KV 数据不被陌生人篡改。 |
| `IMG` | ❌ | `https://api.dujin.org/bing/1920.php` | 自定义背景图的直链 URL。配置后网页会自动开启沉浸式毛玻璃特效。 |

### 第四步：部署代码
1. 点击 Worker 的 **编辑代码 (Edit code)**。
2. 将本项目中的 `worker.js` 代码全部复制并粘贴进去。
3. 点击右上角的 **部署 (Deploy)**。
4. 访问你的 Worker 分配的域名，即可看到精美的控制台界面！

---

## 📸 界面预览

<img src="https://raw.githubusercontent.com/lijboys/web-sublinks/refs/heads/main/img/1.png" width="600">
<img src="https://raw.githubusercontent.com/lijboys/web-sublinks/refs/heads/main/img/2.png" width="600">
<img src="https://raw.githubusercontent.com/lijboys/web-sublinks/refs/heads/main/img/3.png" width="600">

---

## 📝 使用必读

- **隐私声明**：本项目采用“无状态长链”与“KV 短链”双轨模式。如果不开启高级防泄露功能并生成长链，您的节点信息仅存在于 URL 编码中，不会储存在任何服务器上。
- **TUIC / Hysteria2 / Reality 兼容性**：生成的 Clash 配置默认包含 `skip-cert-verify: true` 并在必要字段加入了严谨的引号包裹，完美解决各类小众协议在 Clash Meta 中的解析报错问题。
- **关于同名节点**：脚本内置了智能去重重命名机制，避免 Clash 导入时因节点同名导致的奔溃。

---

## 📄 License
MIT License
