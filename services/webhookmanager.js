import { WebhookClient } from 'discord.js';
import { ROLE_CONFIG } from '../config/roleConfig.js';

const webhooks = new Map();

export async function getOrCreateHook(channel, roleId) {
  const key = `${channel.id}:${roleId}`;
  if (webhooks.has(key)) return webhooks.get(key);

  const whs = await channel.fetchWebhooks();
  const webhookName = ROLE_CONFIG[roleId].webhookName;
  const webhookIcon = ROLE_CONFIG[roleId].webhookIcon;

  const existing = whs.find(w => w.name === webhookName);

  let hook;
  if (existing && existing.token) {
    hook = new WebhookClient({ id: existing.id, token: existing.token });
  } else if (existing) {
    hook = await channel.createWebhook({ name: webhookName, avatar: webhookIcon });
  } else {
    hook = await channel.createWebhook({ name: webhookName, avatar: webhookIcon });
  }

  webhooks.set(key, hook);
  return hook;
}
