import crypto from 'node:crypto';
import fetch, { Response, RequestInit } from 'node-fetch';
import axios from 'axios';
import type { BotConfig } from '../config/BotConfig.js';
interface SignResult {
    ts: number;
    sig: string;
    raw: string;
}
interface FetchWithRetryOptions {
    attempts?: number;
    baseDelay?: number;
}
export interface MemberUpsertPayload {
    guild_id: string;
    discord_id: string;
    discord_name: string;
    display_name: string;
    group: string;
    roles: string[];
}
export interface UpsertMemberResponse {
    status?: string;
    [key: string]: unknown;
}
export interface DeleteAbsentMembersPayload {
    guild_id: string;
    discord_ids: string[];
}
export interface DeleteAbsentMembersResponse {
    deleted_count?: number;
    deleted_ids?: string[];
    [key: string]: unknown;
}
export class CzrBridgeClient {
    constructor(private readonly config: BotConfig) { }
    private sign(body: string | object): SignResult {
        const ts = Math.floor(Date.now() / 1000);
        const raw = typeof body === 'string' ? body : JSON.stringify(body);
        const h = crypto.createHmac('sha256', this.config.czrSecret);
        h.update(`${ts}\n${raw}`);
        const sig = h.digest('base64');
        return { ts, sig, raw };
    }
    private async fetchWithRetry(url: string, init: RequestInit, { attempts = 5, baseDelay = 500 }: FetchWithRetryOptions = {}): Promise<Response> {
        let lastErr: unknown;
        for (let i = 0; i < attempts; i++) {
            try {
                const res = await fetch(url, init);
                if (res.ok)
                    return res;
                const status = res.status;
                const text = await res.text().catch(() => '');
                if ([408, 425, 429, 500, 502, 503, 504].includes(status)) {
                    lastErr = new Error(`HTTP ${status}: ${text}`);
                }
                else {
                    throw new Error(`HTTP ${status}: ${text}`);
                }
            }
            catch (e) {
                lastErr = e;
            }
            const jitter = Math.floor(Math.random() * 300);
            const wait = baseDelay * Math.pow(2, i) + jitter;
            await new Promise((r) => setTimeout(r, wait));
        }
        throw lastErr;
    }
    private baseHeaders(ts: number, sig: string): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'CASBOT/1.0 (+Koyeb)',
            'X-CZR-Key': this.config.czrKey,
            'X-CZR-Ts': String(ts),
            'X-CZR-Sign': sig,
        };
    }
    async upsertMember(payload: MemberUpsertPayload): Promise<UpsertMemberResponse> {
        const body = JSON.stringify(payload);
        const { ts, sig } = this.sign(body);
        const res = await this.fetchWithRetry(`${this.config.czrBase}/wp-json/czr-bridge/v1/ledger/member`, {
            method: 'POST',
            headers: this.baseHeaders(ts, sig),
            body,
        });
        return res.json() as Promise<UpsertMemberResponse>;
    }
    async deleteAbsentMembers(payload: DeleteAbsentMembersPayload): Promise<DeleteAbsentMembersResponse> {
        const body = JSON.stringify(payload);
        const { ts, sig } = this.sign(body);
        const res = await this.fetchWithRetry(`${this.config.czrBase}/wp-json/czr-bridge/v1/ledger/absent-members`, {
            method: 'DELETE',
            headers: this.baseHeaders(ts, sig),
            body,
        });
        return res.json() as Promise<DeleteAbsentMembersResponse>;
    }
    async healthCheck(): Promise<boolean> {
        const resp = await axios.get('https://comzer-gov.net/wp-json/czr/v1/healthz', { timeout: 3000 });
        return resp.status === 200;
    }
}
