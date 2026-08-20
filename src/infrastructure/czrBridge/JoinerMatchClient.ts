import type { BotConfig } from '../config/BotConfig.js';
export interface JoinerMatchResponse {
    discord_ids?: Record<string, string>;
    message?: string;
    [key: string]: unknown;
}
export interface JoinerMatchOutcome {
    ok: boolean;
    status: number;
    data: JoinerMatchResponse;
}
export class JoinerMatchClient {
    constructor(private readonly config: BotConfig) { }
    async matchJoinersStrict(joiners: string[]): Promise<JoinerMatchOutcome> {
        const res = await fetch(this.config.joinerMatchApiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.joinerMatchApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'match_joiners_strict',
                joiners,
            }),
        });
        const data = (await res.json().catch(() => ({}))) as JoinerMatchResponse;
        return { ok: res.ok, status: res.status, data };
    }
}
