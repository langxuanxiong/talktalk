import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3333;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(res, filePath) {
  const safe = path.normalize(filePath).replace(/^\.\./, '');
  const full = path.join(__dirname, 'public', safe);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  const ext = path.extname(full);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}

async function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

async function deepseekCall(messages, temperature = 0.8, maxTokens = 600) {
  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DeepSeek API error ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

const SYSTEM_PROMPT = `你是「小话」，一个温柔随和的倾听伙伴。

核心原则：
- 永远不反驳、不说教、不给建议
- 认真听她说的每一句话，顺着聊下去
- 像老朋友一样自然，不是客服、不是顾问
- 她分享开心事就一起开心，她抱怨就陪着理解
- 她说回忆就好奇地问细节，她说计划就期待地回应

回复风格：
- 2-4句话，不啰嗦
- 自然口语，「真的呀」「嗯」「哎呀」可以自然出现
- 不刻意夸赞，不虚假热情
- 可以适当追问，但不要像采访

你绝对不说的：
- 「你应该…」「你可以试试…」「我建议…」
- 「这个问题很常见」「根据研究…」
- 「首先…其次…最后…」
- 「很高兴为你服务」「有什么我可以帮你的」

你就是个愿意听她说话的朋友，仅此而已。`;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API: chat ---
  if (req.url === '/api/chat' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { messages } = JSON.parse(body);

      const fullMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ];

      const reply = await deepseekCall(fullMessages, 0.85, 400);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reply }));
    } catch (e) {
      console.error('Chat error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- API: extract card ---
  if (req.url === '/api/card' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { userMessage, aiReply } = JSON.parse(body);

      // Skip trivial messages
      if (userMessage.trim().length < 8) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ card: null, skipped: true }));
        return;
      }

      const prompt = `从以下对话中判断是否值得做成一张想法卡片。

用户说：「${userMessage}」
你回复：「${aiReply}」

如果值得，严格返回如下JSON（不要任何其他内容）：
{"title":"简短标题","category":"回忆|感悟|计划|心情|趣事","emoji":"合适emoji","summary":"一句话总结"}

标题不超过10字，总结不超过30字。

如果不值得（只是简单问候、敷衍回应、没有实质内容），返回：
null`;

      const cardJson = await deepseekCall(
        [{ role: 'user', content: prompt }],
        0.3,
        200
      );

      // Parse the response
      let card = null;
      const trimmed = cardJson.trim();
      if (trimmed && trimmed !== 'null') {
        try {
          // Try direct JSON parse
          card = JSON.parse(trimmed);
        } catch {
          // Try to extract JSON from the response
          const match = trimmed.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              card = JSON.parse(match[0]);
            } catch {
              card = null;
            }
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ card, skipped: false }));
    } catch (e) {
      console.error('Card extraction error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- Static files ---
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  serveStatic(res, urlPath);
});

server.listen(PORT, () => {
  console.log(`🍵 TalkTalk 已启动 → http://localhost:${PORT}`);
  if (!DEEPSEEK_KEY) {
    console.warn('⚠️  未设置 DEEPSEEK_API_KEY 环境变量，API 调用将失败');
    console.warn('   请运行: export DEEPSEEK_API_KEY="sk-xxx"');
  }
});
