import { WebhookClient } from 'discord.js';

const webhooks = new Map();

export async function getOrCreateHook(channel, roleId, cfg) {  // ← cfg を引数追加
  const key = `${channel.id}:${roleId}`;
  if (webhooks.has(key)) return webhooks.get(key);

  const whs = await channel.fetchWebhooks();
  const webhookName = cfg.webhookName;  // ← ROLE_CONFIG[roleId] をやめる
  const webhookIcon = cfg.webhookIcon;

  const existing = whs.find(w => w.name === webhookName);

  let hook;
  if (existing && existing.token) {
    hook = new WebhookClient({ id: existing.id, token: existing.token });
  } else {
    hook = await channel.createWebhook({ name: webhookName, avatar: webhookIcon });
  }

  webhooks.set(key, hook);
  return hook;
}
