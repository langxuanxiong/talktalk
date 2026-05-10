# TalkTalk 🍵

给妈妈的母亲节礼物 — 一个随时听她说话、帮她整理想法的 AI 伙伴。

## 功能

- 🎤 **按住说话** — 像微信语音一样简单
- 🤖 **小话 AI** — DeepSeek 驱动的温柔倾听伙伴，随和、不反驳、不说教
- 🃏 **想法卡片** — 每次聊天自动提炼一张卡片（回忆/感悟/计划/心情/趣事）
- 📱 **移动优先** — 大字体、大按钮，适配手机

## 快速启动

```bash
# 1. 设置 DeepSeek API Key
export DEEPSEEK_API_KEY="sk-xxx"

# 2. 启动（零依赖，纯 Node.js）
node server.mjs

# 3. 打开浏览器
open http://localhost:3333
```

同一 WiFi 下妈妈手机也能直接访问 `http://<你的IP>:3333`

## 技术栈

- 前端：单文件 HTML/CSS/JS，Web Speech API 语音识别
- 后端：Node.js 内置 http 模块（零 npm 依赖）
- AI：DeepSeek Chat API
- 存储：localStorage

## 文件结构

```
talktalk/
├── server.mjs       # 后端 + API 代理
├── public/
│   └── index.html   # 完整前端
└── README.md
```
