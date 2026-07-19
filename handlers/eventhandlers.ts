import { ActivityType, Client, GuildMember, PartialGuildMember } from 'discord.js';
import { handleInteraction } from './interactionHandler.js';
import { handleMessage } from './messageHandler.js';
import { syncMember, fullSync } from '../citizen_data/syncMembers.js';
import { setBotClient } from '../services/sessionManager.js';
import * as statusCommand from '../commands/status.js';

export function registerEventHandlers(client: Client): void {
  client.once('ready', async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    setBotClient(readyClient);

    // 初回完全同期
    try {
      await fullSync(readyClient, Number(process.env.CZR_THROTTLE_MS || 700));
    } catch (e) {
      console.error('[fullSync] 初回同期失敗:', e);
    }

    // 定期同期
    const interval = Number(process.env.CZR_SYNC_INTERVAL_MS || 10800000);
    setInterval(() => {
      fullSync(readyClient).catch((err) => console.error('[fullSync] 定期同期失敗:', err));
    }, interval);

    updateBotStatus(readyClient);

    setInterval(() => {
      updateBotStatus(readyClient);
      statusCommand.updateLastSelfCheck();
    }, 30 * 60 * 1000);
  });

  client.on('interactionCreate', async (interaction) => {
    await handleInteraction(interaction);
  });

  client.on('messageCreate', async (message) => {
    await handleMessage(message, client);
  });

  client.on('guildMemberAdd', (member: GuildMember) => {
    syncMember(member).catch((e: Error) => console.error('[guildMemberAdd]', e.message));
  });

  client.on(
    'guildMemberUpdate',
    (_oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
      syncMember(newMember).catch((e: Error) => console.error('[guildMemberUpdate]', e.message));
    }
  );
}

function updateBotStatus(client: Client<true>): void {
  const jstTime = new Date().toLocaleString('ja-JP', { hour12: false });
  client.user.setActivity(`コムザール行政システム稼働中 | 最新自己診断時刻:${jstTime}`, {
    type: ActivityType.Watching,
  });
}
