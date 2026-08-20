import type { Client } from 'discord.js';
import { KoyebClient } from '../../infrastructure/koyeb/KoyebClient.js';
export class BotLifecycleService {
    constructor(private readonly koyeb: KoyebClient) { }
    async shutdown(client: Client): Promise<void> {
        try {
            client.destroy();
            await this.koyeb.pause();
        }
        catch (error) {
            console.error('エラーが発生しました:', error);
        }
        finally {
            process.exit(0);
        }
    }
    async start(): Promise<{
        ok: boolean;
        message: string;
    }> {
        if (!this.koyeb.isConfigured()) {
            console.warn('KOYEB_API_TOKEN または KOYEB_APP_ID が設定されていません。');
            return { ok: false, message: '環境変数が正しく設定されていません。' };
        }
        try {
            await this.koyeb.resume();
            return {
                ok: true,
                message: 'アプリの再起動リクエストを送信しました。数分以内に稼働を再開します。',
            };
        }
        catch (error) {
            console.error('再起動時にエラーが発生しました:', error);
            return { ok: false, message: '再起動中にエラーが発生しました。' };
        }
    }
}
