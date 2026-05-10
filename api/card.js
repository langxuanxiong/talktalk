// Vercel Serverless: POST /api/card
export default async function handler(req, res) {
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
    const { userMessage, aiReply } = req.body;

    // Skip trivial messages (avoid wasting API call)
    if (!userMessage || userMessage.trim().length < 8) {
      return res.status(200).json({ card: null, skipped: true });
    }

    const prompt = `从以下对话中判断是否值得做成一张想法卡片。

用户说：「${userMessage}」
你回复：「${aiReply}」

如果值得，严格返回如下JSON（不要任何其他内容）：
{"title":"简短标题","category":"回忆|感悟|计划|心情|趣事","emoji":"合适emoji","summary":"一句话总结"}

标题不超过10字，总结不超过30字。

如果不值得（只是简单问候、敷衍回应、没有实质内容），返回：
null`;

    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!resp.ok) {
      return res.status(200).json({ card: null, skipped: true });
    }

    const data = await resp.json();
    const cardJson = data.choices[0].message.content.trim();

    let card = null;
    if (cardJson && cardJson !== 'null') {
      try {
        card = JSON.parse(cardJson);
      } catch {
        const match = cardJson.match(/\{[\s\S]*\}/);
        if (match) {
          try { card = JSON.parse(match[0]); } catch { card = null; }
        }
      }
    }

    return res.status(200).json({ card, skipped: false });

  } catch (e) {
    console.error('Card error:', e.message);
    return res.status(200).json({ card: null, skipped: true });
  }
}
