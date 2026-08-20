import type { Client } from 'discord.js';
import { describeDmSendError } from '../../domain/service/DiscordErrorMessages.js';
export interface QueueItem {
    discord_id: string;
    message: string;
    requestId: string | number;
}
interface StatusReport {
    requestId: string | number;
    discordId: string;
    success: boolean;
    detail: string;
    errorCode: string | number | null;
}
const SEND_INTERVAL_MS = 1500;
export class NotificationQueueService {
    private readonly queue: QueueItem[] = [];
    private processing = false;
    enqueue(item: QueueItem): void {
        this.queue.push(item);
    }
    async processQueue(client: Client): Promise<void> {
        if (this.processing || this.queue.length === 0)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (!item)
                break;
            const statusReport: StatusReport = {
                requestId: item.requestId,
                discordId: item.discord_id,
                success: false,
                detail: '不明なエラー',
                errorCode: null,
            };
            try {
                const user = await client.users.fetch(item.discord_id);
                await user.send(item.message);
                statusReport.success = true;
                statusReport.detail = '送信成功';
                console.log(`[SUCCESS] Request:${item.requestId} -> ${user.tag}`);
            }
            catch (err: unknown) {
                const hasCommonGuild = client.guilds.cache.some((g) => g.members.cache.has(item.discord_id));
                const { detail, errorCode } = describeDmSendError(err, hasCommonGuild);
                statusReport.detail = detail;
                statusReport.errorCode = errorCode;
                console.error(`[FAILURE REPORT] RequestID: ${statusReport.requestId} | TargetID: ${statusReport.discordId} | Reason: ${statusReport.detail}`, err);
            }
            await new Promise((res) => setTimeout(res, SEND_INTERVAL_MS));
        }
        this.processing = false;
    }
}
