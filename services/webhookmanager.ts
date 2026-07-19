import { WebhookClient } from 'discord.js';
import type { TextChannel, NewsChannel, ForumChannel, MediaChannel, StageChannel, VoiceChannel, Webhook } from 'discord.js';
import type { RoleConfigEntry } from '../config/roleConfig.js';

/** Webhookを作成可能なチャンネル種別 */
type WebhookCapableChannel =
  | TextChannel
  | NewsChannel
  | ForumChannel
  | MediaChannel
  | StageChannel
  | VoiceChannel;

/** キャッシュされるフック（既存の場合はWebhookClient、新規作成の場合はWebhook） */
type CachedHook = WebhookClient | Webhook;

const webhooks = new Map<string, CachedHook>();

export async function getOrCreateHook(
  channel: WebhookCapableChannel,
  roleId: string,
  cfg: RoleConfigEntry
): Promise<CachedHook> {
  const key = `${channel.id}:${roleId}`;
  const cached = webhooks.get(key);
  if (cached) return cached;

  const whs = await channel.fetchWebhooks();
  const webhookName = cfg.webhookName;
  const webhookIcon = cfg.webhookIcon;

  const existing = whs.find((w) => w.name === webhookName);

  let hook: CachedHook;
  if (existing && existing.token) {
    hook = new WebhookClient({ id: existing.id, token: existing.token });
  } else {
    hook = await channel.createWebhook({ name: webhookName, avatar: webhookIcon });
  }

  webhooks.set(key, hook);
  return hook;
}
