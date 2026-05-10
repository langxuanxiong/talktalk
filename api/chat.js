// Vercel Serverless: POST /api/chat
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

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

你就是个愿意听她说话的朋友，仅此而已。`;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: fullMessages,
        temperature: 0.85,
        max_tokens: 400,
      }),
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
