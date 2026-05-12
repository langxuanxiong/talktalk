// Vercel Serverless: POST /api/chat
// 搜索模块内联（Vercel serverless 不支持跨 api/ 目录 import）
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const DDG_API = 'https://api.duckduckgo.com/';
const DDG_LITE = 'https://lite.duckduckgo.com/lite/';

// ─── 搜索意图检测 ───
function shouldSearch(message) {
  if (!message || typeof message !== 'string') return false;
  const msg = message.trim();
  if (msg.length < 4) return false;

  const explicit = /^(搜索|查一下|查查|帮我查|搜一下|帮我搜|帮我查一下)/;
  if (explicit.test(msg)) return true;

  const realtime = /(今天.*(天气|新闻|几号|星期|日期|发生|怎么))|((最新|最近|这周|本周|这个月|今年).*(新闻|消息|情况|动态|进展))|(天气|新闻|几点了|几号|星期几)/;
  if (realtime.test(msg)) return true;

  const knowledge = /(什么是|是谁|在哪里|怎么回事|怎么回|为什么|多少[钱人岁]|什么时候|哪些|哪种|介绍一下|讲讲|说说.*是)/;
  if (knowledge.test(msg)) return true;

  return false;
}

// ─── DuckDuckGo 搜索（Instant Answer + Lite HTML 回退） ───
async function searchInstantAnswer(query) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(
      `${DDG_API}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!resp.ok) return [];
    const data = await resp.json();
    const results = [];

    if (data.Answer) results.push({ title: '答案', snippet: data.Answer });
    if (data.AbstractText && data.AbstractText.trim()) {
      results.push({ title: data.Heading || query, snippet: data.AbstractText, source: data.AbstractSource || '' });
    }
    if (data.Definition) {
      results.push({ title: '定义', snippet: data.Definition, source: data.DefinitionSource || '' });
    }
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const t of data.RelatedTopics.slice(0, 3)) {
        if (t.Text) results.push({ title: '', snippet: t.Text });
      }
    }
    return results;
  } catch { return []; }
}

async function searchLiteHTML(query) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(`${DDG_LITE}?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TalkTalk/1.0' },
    });
    clearTimeout(timeout);
    if (!resp.ok) return [];
    const html = await resp.text();

    const links = [], snippets = [];
    const linkRe = /<a[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(html)) !== null) links.push(cleanHtml(match[1]));

    const snipRe = /<td[^>]*class='result-snippet'[^>]*>([\s\S]*?)<\/td>/gi;
    while ((match = snipRe.exec(html)) !== null) snippets.push(cleanHtml(match[1]));

    const results = [];
    const count = Math.min(links.length, snippets.length, 5);
    for (let i = 0; i < count; i++) results.push({ title: links[i], snippet: snippets[i] });
    return results;
  } catch { return []; }
}

function cleanHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n))).trim();
}

async function searchDuckDuckGo(query) {
  const ia = await searchInstantAnswer(query);
  if (ia.length > 0) return ia;
  return await searchLiteHTML(query);
}

function formatSearchContext(results, query) {
  if (!results || results.length === 0) return '';
  const lines = [`[参考信息 — 这是刚查到关于「${query}」的资料]`];
  for (const r of results) {
    lines.push(`- ${r.title ? `**${r.title}**：` : ''}${r.snippet}`);
  }
  return lines.join('\n');
}

// ─── 系统提示词 ───
const SYSTEM_PROMPT = `你是「小话」，一个温柔随和的倾听伙伴。

核心原则：
- 永远不反驳、不说教、不给建议
- 认真听她说的每一句话，顺着聊下去
- 像老朋友一样自然，不是客服、不是顾问
- 她分享开心事就一起开心，她抱怨就陪着理解
- 她说回忆就好奇地问细节，她说计划就期待地回应

回复风格：
- 2-4句话，自然口语，「真的呀」「嗯」「哎呀」可以自然出现
- 不刻意夸赞，不虚假热情
- 可以适当追问，但不要像采访

你绝对不说的：
- 「你应该…」「你可以试试…」「我建议…」
- 「这个问题很常见」「根据研究…」
- 「首先…其次…最后…」
- 「很高兴为你服务」「有什么我可以帮你的」

参考信息的使用：
- 如果对话包含「[参考信息]」段落，那是我临时查到的实时资料
- 用「我刚看到…」「听说…」「好像说…」这样自然的语气融入回复
- 别像念百科一样复述，挑一两个有意思的点随口聊出来
- 如果参考资料没什么用或者和她说的不一样，以她说的为准，忽略资料即可

你就是个愿意听她说话的朋友，仅此而已。`;

// ─── Handler ───
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    let systemPrompt = SYSTEM_PROMPT;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg && shouldSearch(lastUserMsg.content)) {
      const q = lastUserMsg.content.replace(/^(搜索|查一下|查查|帮我查|搜一下|帮我搜|帮我查一下)\s*/g, '');
      const results = await searchDuckDuckGo(q);
      const ctx = formatSearchContext(results, q);
      if (ctx) systemPrompt = SYSTEM_PROMPT + '\n\n' + ctx;
    }

    const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'deepseek-chat', messages: fullMessages, temperature: 0.85, max_tokens: 400 }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('DeepSeek error:', resp.status, err);
      return res.status(502).json({ error: 'AI 暂时走神了，请稍后再试' });
    }

    const data = await resp.json();
    return res.status(200).json({ reply: data.choices[0].message.content });
  } catch (e) {
    console.error('Chat error:', e.message);
    return res.status(500).json({ error: '服务器出错了，请稍后再试' });
  }
}
