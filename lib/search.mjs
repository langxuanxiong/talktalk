/**
 * DuckDuckGo 搜索模块 —— TalkTalk
 * 零依赖，纯 fetch，免费无 key
 * 策略：Instant Answer API（英文百科）→ 失败回退 Lite HTML 搜索（中文/通用）
 */

const DDG_API = 'https://api.duckduckgo.com/';
const DDG_LITE = 'https://lite.duckduckgo.com/lite/';

/**
 * 检测用户消息是否需要搜索
 * @param {string} message - 用户消息
 * @returns {boolean}
 */
export function shouldSearch(message) {
  if (!message || typeof message !== 'string') return false;
  const msg = message.trim();

  // 太短的不搜
  if (msg.length < 4) return false;

  // 1. 显式搜索指令
  const explicit = /^(搜索|查一下|查查|帮我查|搜一下|帮我搜|帮我查一下)/;
  if (explicit.test(msg)) return true;

  // 2. 实时/时效性组合（避免单独的「今天」误触）
  const realtime = /(今天.*(天气|新闻|几号|星期|日期|发生|怎么))|((最新|最近|这周|本周|这个月|今年).*(新闻|消息|情况|动态|进展))|(天气|新闻|几点了|几号|星期几)/;
  if (realtime.test(msg)) return true;

  // 3. 知识问答模式
  const knowledge = /(什么是|是谁|在哪里|怎么回事|怎么回|为什么|多少[钱人岁]|什么时候|哪些|哪种|介绍一下|讲讲|说说.*是)/;
  if (knowledge.test(msg)) return true;

  return false;
}

/**
 * 清洗搜索查询词（去掉显式搜索指令前缀）
 */
function cleanQuery(message) {
  return message
    .replace(/^(搜索|查一下|查查|帮我查|搜一下|帮我搜|帮我查一下)\s*/g, '')
    .trim();
}

// ─── 方案 A: Instant Answer API（英文百科类查询） ───

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

    if (data.Answer) {
      results.push({ title: '答案', snippet: data.Answer });
    }

    if (data.AbstractText && data.AbstractText.trim()) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        source: data.AbstractSource || '',
      });
    }

    if (data.Definition) {
      results.push({ title: '定义', snippet: data.Definition, source: data.DefinitionSource || '' });
    }

    // RelatedTopics 取前 3 个
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.Text) {
          results.push({ title: '', snippet: topic.Text });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── 方案 B: Lite HTML 搜索（中文支持好，零依赖 HTML 解析） ───

async function searchLiteHTML(query) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch(
      `${DDG_LITE}?q=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'TalkTalk/1.0' },
      }
    );
    clearTimeout(timeout);

    if (!resp.ok) return [];

    const html = await resp.text();

    // 提取搜索结果链接和摘要
    const links = [];
    const linkRe = /<a[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(html)) !== null) {
      links.push(cleanHtml(match[1]));
    }

    const snippets = [];
    const snipRe = /<td[^>]*class='result-snippet'[^>]*>([\s\S]*?)<\/td>/gi;
    while ((match = snipRe.exec(html)) !== null) {
      snippets.push(cleanHtml(match[1]));
    }

    // 配对：link[i] + snippet[i]
    const results = [];
    const count = Math.min(links.length, snippets.length, 5);
    for (let i = 0; i < count; i++) {
      results.push({ title: links[i], snippet: snippets[i] });
    }

    return results;
  } catch {
    return [];
  }
}

function cleanHtml(str) {
  return str
    .replace(/<[^>]*>/g, '')       // 去掉 HTML 标签
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .trim();
}

// ─── 主搜索函数 ───

/**
 * DuckDuckGo 搜索（双层回退）
 * @param {string} query - 搜索关键词
 * @returns {Promise<Array<{title:string, snippet:string, source?:string}>>}
 */
export async function searchDuckDuckGo(query) {
  // 先试 Instant Answer（快，英文百科好）
  const iaResults = await searchInstantAnswer(query);
  if (iaResults.length > 0) return iaResults;

  // 回退 Lite HTML 搜索（中文好，覆盖面广）
  return await searchLiteHTML(query);
}

/**
 * 将搜索结果格式化为可注入提示词的文字
 */
export function formatSearchContext(results, query) {
  if (!results || results.length === 0) return '';

  const lines = [`[参考信息 — 这是刚查到关于「${query}」的资料]`];
  for (const r of results) {
    const title = r.title ? `**${r.title}**：` : '';
    lines.push(`- ${title}${r.snippet}`);
  }
  return lines.join('\n');
}
