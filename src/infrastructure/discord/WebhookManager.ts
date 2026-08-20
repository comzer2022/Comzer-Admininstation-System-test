import { WebhookClient } from 'discord.js';
import type { TextChannel, NewsChannel, ForumChannel, MediaChannel, StageChannel, VoiceChannel, Webhook, } from 'discord.js';
import type { RoleConfigEntry } from '../config/RoleConfig.js';
type WebhookCapableChannel = TextChannel | NewsChannel | ForumChannel | MediaChannel | StageChannel | VoiceChannel;
type CachedHook = WebhookClient | Webhook;
export class WebhookManager {
    private readonly webhooks = new Map<string, CachedHook>();
    async getOrCreateHook(channel: WebhookCapableChannel, roleId: string, cfg: RoleConfigEntry): Promise<CachedHook> {
        const key = `${channel.id}:${roleId}`;
        const cached = this.webhooks.get(key);
        if (cached)
            return cached;
        const whs = await channel.fetchWebhooks();
        const webhookName = cfg.webhookName;
        const webhookIcon = cfg.webhookIcon;
        const existing = whs.find((w) => w.name === webhookName);
        let hook: CachedHook;
        if (existing && existing.token) {
            hook = new WebhookClient({ id: existing.id, token: existing.token });
        }
        else {
            hook = await channel.createWebhook({ name: webhookName, avatar: webhookIcon });
        }
        this.webhooks.set(key, hook);
        return hook;
    }
}
