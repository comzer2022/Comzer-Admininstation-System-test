import axios from 'axios';
import type { BotConfig } from '../config/BotConfig.js';
export class KoyebClient {
    constructor(private readonly config: BotConfig) { }
    isConfigured(): boolean {
        return !!(this.config.koyebApiToken && this.config.koyebAppId);
    }
    async pause(): Promise<void> {
        const { koyebApiToken, koyebAppId } = this.config;
        if (!koyebApiToken || !koyebAppId) {
            console.warn('KOYEB_API_TOKEN または KOYEB_APP_ID が未設定です。');
            return;
        }
        await axios.post(`https://api.koyeb.com/v1/apps/${koyebAppId}/actions/pause`, {}, { headers: { Authorization: `Bearer ${koyebApiToken}` } });
        console.log('Koyeb Pause API 呼び出し完了');
    }
    async resume(): Promise<void> {
        const { koyebApiToken, koyebAppId } = this.config;
        if (!koyebApiToken || !koyebAppId) {
            throw new Error('KOYEB_API_TOKEN または KOYEB_APP_ID が設定されていません。');
        }
        await axios.post(`https://api.koyeb.com/v1/apps/${koyebAppId}/actions/resume`, {}, { headers: { Authorization: `Bearer ${koyebApiToken}` } });
    }
}
