import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('shutdown')
  .setDescription('ボットを停止します');

export async function execute(interaction) {
  const allowedRoleIds = (process.env.STOP_ROLE_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  // ── 実行者のロールID取得（ギルド or DM） ──
  let executorRoleIds = [];
  if (interaction.guildId) {
    executorRoleIds = interaction.member.roles.cache.map(r => r.id);
  } else {
    const refGuildId = "1188411576483590194";
    if (!refGuildId) {
      throw new Error("REFERENCE_GUILD_IDが設定されていません");
    }
    const guild = await interaction.client.guilds.fetch(refGuildId);
    const member = await guild.members.fetch(interaction.user.id);
    executorRoleIds = member.roles.cache.map(r => r.id);
  }

  // ── 権限チェック ──
  const isAllowed = allowedRoleIds.some(rid => executorRoleIds.includes(rid));
  if (!isAllowed) {
    return interaction.reply({
      content: '⚠️ このコマンドを実行する権限がありません。',
      ephemeral: !!interaction.guildId,
    });
  }

  // ── ACK／応答 ──
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply({ content: 'ボットをシャットダウンします' });

  //Pause処理
  setTimeout(async () => {
    try {
      interaction.client.destroy();
      const apiToken = process.env.KOYEB_API_TOKEN;
      const appId    = process.env.KOYEB_APP_ID;
      if (apiToken && appId) {
        await axios.post(
          `https://api.koyeb.com/v1/apps/${appId}/actions/pause`,
          {},
          { headers: { Authorization: `Bearer ${apiToken}` } }
        );
        console.log('[shutdown] Koyeb Pause API 呼び出し完了');
      } else {
        console.warn('[shutdown] KOYEB_API_TOKEN または KOYEB_APP_ID が未設定です。');
      }
    } catch (error) {
      console.error('エラーが発生しました:', error);
    } finally {
      process.exit(0);
    }
  }, 1000);
}
