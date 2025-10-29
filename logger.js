// logger.js
import https from 'https';
import { URL } from 'url';

const { DISCORD_WEBHOOK_URL } = process.env;

// Discord Webhook に送信する関数
function sendToWebhook(message) {
  if (!DISCORD_WEBHOOK_URL) return;
  
  const payload = JSON.stringify({
    content: `\`\`\`\n${message}\n\`\`\``,
  });
  
  const url = new URL(DISCORD_WEBHOOK_URL);
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };
  
  const req = https.request(options, (res) => {
    if (res.statusCode >= 400) {
      console.error(`[WebhookError] Failed to send log: ${res.statusCode}`);
    }
  });
  
  req.on('error', (err) => {
    console.error('[WebhookError]', err);
  });
  
  req.write(payload);
  req.end();
}

// 除外キーワード：ログ全体を破棄するトリガー
const excludeKeywords = [
  'parentId:',
  'TICKET_CAT:',
  'mentions.has(',
  'content:',
  'authorId:',
  'channelId:',
  '（型：',
  'channelName:',
];

// ログをフィルタして Discord に送る共通処理
function filterAndSend(rawText) {
  if (excludeKeywords.some(kw => rawText.includes(kw))) {
    return;
  }
  
  const cleaned = rawText.trim();
  if (cleaned) sendToWebhook(cleaned);
}

// 元の console.log を保存
const originalLog = console.log;
const originalError = console.error;

// console.log フック
console.log = (...args) => {
  originalLog(...args);
  filterAndSend(args.map(String).join(' '));
};

// console.error フック
console.error = (...args) => {
  originalError(...args);
  
  const raw = args
    .map(arg => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg, null, 2); }
        catch { return String(arg); }
      }
      return String(arg);
    })
    .join('\n');
  
  filterAndSend(raw);
};

// メッセージデバッグログ関数
export function messagelog(m, TICKET_CAT, bot) {
  originalLog('parentId:', m.channel.parentId, '（型：', typeof m.channel.parentId, '）');
  originalLog('TICKET_CAT:', TICKET_CAT, '（型：', typeof TICKET_CAT, '）');
  originalLog('mentions.has(bot.user):', m.mentions.has(bot.user));
  originalLog('authorId:', m.author?.id);
  originalLog('channelId:', m.channel?.id, 'channelName:', m.channel?.name);
  originalLog('content:', m.content);
}

// logger オブジェクト
export const logger = {
  messagelog
};

export default logger;
