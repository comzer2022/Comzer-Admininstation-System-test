import axios from 'axios';
import type { BotConfig } from '../config/BotConfig.js';
export interface CitizenInfo {
    message?: string;
    discord_id?: string;
    discord_name?: string;
    sub_discord_id?: string;
    mcid?: string;
    sub_mcid?: string;
    residence?: string;
    company?: string;
    party?: string;
    [key: string]: unknown;
}
const WP_API_URL = 'https://comzer-gov.net/wp-json/custom/v1/citizen-info/';
export class CitizenInfoClient {
    constructor(private readonly config: BotConfig) { }
    async getByDiscordId(discordId: string): Promise<CitizenInfo> {
        const response = await axios.get<CitizenInfo>(WP_API_URL, {
            params: { discord_id: discordId },
            headers: {
                'X-API-KEY': this.config.casbotApiSecret,
            },
        });
        return response.data;
    }
}
