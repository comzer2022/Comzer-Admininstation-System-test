import { SlashCommandBuilder, MessageFlags, REST, Routes, ChatInputCommandInteraction } from 'discord.js';
import { data as rolepostData } from './embedPost.js';
import { data as statusData } from './status.js';
import { data as shutdownData } from './shutdown.js';
import { data as startData } from './start.js';
import { data as infoData } from './info.js';
import { data as debugData } from './debug.js';
import { data as deleteRolepostData } from './deleteRolepost.js';
import { commands as blacklistCommands } from './blacklist/index.js';

export const data = new SlashCommandBuilder()
  .setName('deploy')
  .setDescription('スラッシュコマンドを再登録します');

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const allowedRoleId = process.env.DEPLOY_ROLE_ID;
  const member = interaction.member;
  const hasRole = member && 'cache' in member.roles ? member.roles.cache.has(allowedRoleId ?? '') : false;
  if (allowedRoleId && !hasRole) {
    return interaction.reply({ content: '権限がありません。', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN as string);

    const globalBody = [
      rolepostData.toJSON(),
      statusData.toJSON(),
      shutdownData.toJSON(),
      startData.toJSON(),
      infoData.toJSON(),
      debugData.toJSON(),
      deleteRolepostData.toJSON(),
      data.toJSON(),
      ...blacklistCommands.map((c) => c.toJSON()),
    ];

    const clientId = interaction.client.user?.id;
    if (!clientId) {
      return interaction.editReply('❌ クライアント情報が取得できませんでした。');
    }

    await rest.put(Routes.applicationCommands(clientId), { body: globalBody });

    return interaction.editReply(`✅ コマンド登録完了: ${globalBody.length} 件`);
  } catch (err) {
    console.error('[deploy] error:', err);
    return interaction.editReply(`❌ 登録失敗: ${err instanceof Error ? err.message : String(err)}`);
  }
}
