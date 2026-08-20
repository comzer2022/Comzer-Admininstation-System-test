import https from 'https';
import { URL } from 'url';
import type { BotConfig } from '../config/BotConfig.js';
export class DiscordWebhookLogSink {
    private readonly webhookUrl: string | undefined;
    private readonly nativeError = console.error;
    constructor(config: BotConfig) {
        this.webhookUrl = config.discordWebhookUrl;
    }
    isEnabled(): boolean {
        return !!this.webhookUrl;
    }
    send(message: string): void {
        if (!this.webhookUrl)
            return;
        const payload = JSON.stringify({
            content: `\`\`\`\n${message}\n\`\`\``,
        });
        const url = new URL(this.webhookUrl);
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
                this.nativeError(`[WebhookError] Failed to send log: ${res.statusCode}`);
            }
        });
        req.on('error', (err: Error) => {
            this.nativeError('[WebhookError]', err.message);
        });
        req.write(payload);
        req.end();
    }
}
