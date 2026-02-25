import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('ボットを再起動します');

export async function execute(interaction) {
  // ── 権限チェック ──
  const allowedUserIds = (process.env.STOP_USER_IDS || '')
    .split(',').map(id => id.trim()).filter(Boolean);
  const allowedRoleIds = (process.env.STOP_ROLE_IDS || '')
    .split(',').map(id => id.trim()).filter(Boolean);

  let isAllowed = false;
  if (!interaction.guildId) {
    isAllowed = allowedUserIds.includes(interaction.user.id);
  } else {
    const memberRoles = interaction.member.roles.cache;
    isAllowed = allowedUserIds.includes(interaction.user.id)
             || allowedRoleIds.some(rid => memberRoles.has(rid));
  }

  if (!isAllowed) {
    return interaction.reply({
      content: 'このコマンドを実行する権限がありません。',
      flags: 1 << 6
    });
  }

  // ── ACK ──
  await interaction.deferReply({ flags: 1 << 6 });
  await interaction.editReply({ content: 'ボットを再起動しています…' });

  try {
    const apiToken = process.env.KOYEB_API_TOKEN;
    const appId    = process.env.KOYEB_APP_ID;

    if (apiToken && appId) {
      await axios.post(
        `https://api.koyeb.com/v1/apps/${appId}/actions/resume`,
        {},
        { headers: { Authorization: `Bearer ${apiToken}` } }
      );
      await interaction.editReply({
        content: 'アプリの再起動リクエストを送信しました。数分以内に稼働を再開します。'
      });
    } else {
      console.warn('KOYEB_API_TOKEN または KOYEB_APP_ID が設定されていません。');
      await interaction.editReply({
        content: '環境変数が正しく設定されていません。管理者に問い合わせてください。'
      });
    }
  } catch (error) {
    console.error('再起動時にエラーが発生しました:', error);
    await interaction.editReply({
      content: '再起動中にエラーが発生しました。ログを確認してください。'
    });
  }
}
