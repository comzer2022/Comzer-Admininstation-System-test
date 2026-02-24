import https from 'https';
import { URL } from 'url';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const ENABLE_WEBHOOK = !!WEBHOOK_URL;

// hooks.js が console.error を上書きする前に元の関数を保持
// sendToWebhook 内でエラーが起きた際に console.error を呼ぶと
// フックされた console.error → sendToWebhook → エラー → 無限ループになるため
// ここで保存した originalError を直接使用する
const _nativeError = console.error;

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
      // フックされた console.error ではなく native を直接使う（無限ループ防止）
      _nativeError(`[WebhookError] Failed to send log: ${res.statusCode}`);
    }
  });

  req.on('error', (err) => {
    // 同上
    _nativeError('[WebhookError]', err.message);
  });

  req.write(payload);
  req.end();
}

export function isWebhookEnabled() {
  return ENABLE_WEBHOOK;
}
