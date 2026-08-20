import type { Express, Request, Response } from 'express';
import type { Client } from 'discord.js';
import type { NotificationQueueService } from '../../application/notification/NotificationQueueService.js';
import { composeNotifyMessage, extractIdentifiers, type NotifyRequestBody } from '../../domain/service/NotifyMessageComposer.js';
import type { BotConfig } from '../../infrastructure/config/BotConfig.js';
export class NotifyApiRoute {
    constructor(private readonly queue: NotificationQueueService, private readonly config: BotConfig) { }
    register(app: Express, client: Client): void {
        app.post('/api/notify', (req: Request<unknown, unknown, NotifyRequestBody>, res: Response) => {
            console.log('--- APIリクエスト受信 ---');
            const apiKey = req.headers['x-api-key'];
            if (apiKey !== this.config.casbotApiSecret) {
                console.error('APIキー認証失敗:', apiKey);
                return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
            }
            const data: NotifyRequestBody = req.body || {};
            try {
                console.log('通知受信:', JSON.stringify(data).slice(0, 1000));
            }
            catch {
                console.log('通知受信: (non-serializable)');
            }
            const { discordId, requestId } = extractIdentifiers(data);
            if (!discordId) {
                console.error('notify: missing discord_id', data);
                return res.status(400).json({ error: 'discord_id missing' });
            }
            const message = composeNotifyMessage(data, requestId);
            this.queue.enqueue({ discord_id: discordId, message, requestId });
            console.log(`notify: queued message for ${discordId} (request ${requestId})`);
            this.queue.processQueue(client);
            return res.json({ status: 'queued', requestId });
        });
    }
}
