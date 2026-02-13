// utils/logger/webhook.js
import https from 'https';
import { URL } from 'url';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const ENABLE_WEBHOOK = !!WEBHOOK_URL;

/**
 * Discord Webhook にメッセージを送信
 * @param {string} message - 送信するメッセージ
 */
export function sendToWebhook(message) {
  if (!ENABLE_WEBHOOK) return;

  const payload = JSON.stringify({
    content: `\`\`\`\n${message}\n\`\`\``,
  });

  const url = new URL(WEBHOOK_URL);
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

export function isWebhookEnabled() {
  return ENABLE_WEBHOOK;
}
