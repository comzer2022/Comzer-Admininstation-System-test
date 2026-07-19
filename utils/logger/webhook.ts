import https from 'https';
import { URL } from 'url';

const WEBHOOK_URL: string | undefined = process.env.DISCORD_WEBHOOK_URL;
const ENABLE_WEBHOOK: boolean = !!WEBHOOK_URL;
const _nativeError = console.error;

export function sendToWebhook(message: string): void {
  if (!WEBHOOK_URL) return;

  const payload = JSON.stringify({
    content: `\`\`\`\n${message}\n\`\`\``,
  });

  const url = new URL(WEBHOOK_URL);
  const options: https.RequestOptions = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const req = https.request(options, (res) => {
    if ((res.statusCode ?? 0) >= 400) {
      _nativeError(`[WebhookError] Failed to send log: ${res.statusCode}`);
    }
  });

  req.on('error', (err: Error) => {
    _nativeError('[WebhookError]', err.message);
  });

  req.write(payload);
  req.end();
}

export function isWebhookEnabled(): boolean {
  return ENABLE_WEBHOOK;
}
