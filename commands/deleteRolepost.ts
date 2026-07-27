import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('delete_rolepost')
  .setDescription('役職発言（Bot発言）の削除')
  .addStringOption((o) =>
    o.setName('message_id').setDescription('削除するメッセージのID').setRequired(true)
  );

type Mode = 'minister' | 'diplomat' | 'examiner';

interface RoleGroup {
  envKey: string;
  mode: Mode;
  label: string;
}

const ROLE_GROUPS: RoleGroup[] = [
  { envKey: 'ROLLID_MINISTER', mode: 'minister', label: '閣僚会議議員' },
  { envKey: 'ROLLID_DIPLOMAT', mode: 'diplomat', label: '外交官(外務省 総合外務部職員)' },
  { envKey: 'EXAMINER_ROLE_IDS', mode: 'examiner', label: '入国審査担当官' },
];

function getRoleIdsByMode(mode: Mode): string[] {
  const group = ROLE_GROUPS.find((g) => g.mode === mode);
  if (!group) return [];
  return (process.env[group.envKey] || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Embed の author.name（= ROLE_GROUPS.label と同一の固定文字列）から直接 mode を判定する。
 * ROLE_CONFIG は roleId をキーに DIPLOMAT → MINISTER → EXAMINER の順で上書きされるため、
 * 同一ロールIDが複数カテゴリに重複設定されていると embedName が失われることがある
 * （＝ 役職発言なのに「役職発言ではない」と誤判定される不具合の原因）。
 * ROLE_CONFIG を経由せず label と直接突き合わせることでこの上書き問題を回避する。
 */
function getModeFromEmbedName(authorName: string): Mode | null {
  const group = ROLE_GROUPS.find((g) => g.label === authorName);
  return group ? group.mode : null;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  // ロールID取得
  let userRoleIds: string[] = [];

  if (interaction.guildId) {
    const member = interaction.member;
    userRoleIds =
      member && 'cache' in member.roles ? member.roles.cache.map((r) => String(r.id)) : [];
  } else {
    const refGuildId = '1188411576483590194';
    const guild = await interaction.client.guilds.fetch(refGuildId);
    const member = await guild.members.fetch(interaction.user.id);
    userRoleIds = member.roles.cache.map((r) => String(r.id));
  }

  // いずれかのモードのロールを持っているか
  const allAllowedIds = ROLE_GROUPS.flatMap(({ envKey }) =>
    (process.env[envKey] || '').split(',').map((s) => s.trim()).filter(Boolean)
  );
  const hasPermission = allAllowedIds.some((id) => userRoleIds.includes(id));

  if (!hasPermission) {
    console.trace('権限エラー: delete_rolepost');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '君はステージが低い。君のコマンドを受け付けると君のカルマが私の中に入って来て私が苦しくなる。(権限エラー)',
        ephemeral: true,
      });
    }
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const messageId = interaction.options.getString('message_id', true);
  const channel = interaction.channel;

  if (!channel || !('messages' in channel)) {
    return interaction.editReply({ content: 'このチャンネルではメッセージを取得できません。' });
  }

  try {
    const msg = await channel.messages.fetch(messageId);

    // Webhook 経由でないメッセージは削除不可
    if (!msg.webhookId) {
      return await interaction.editReply({
        content: 'コムザール行政システムが送信した役職発言のみ削除できます。',
      });
    }

    // Embed の author.name から roleId を逆引き
    const authorName = msg.embeds[0]?.author?.name;
    if (!authorName) {
      return await interaction.editReply({
        content: 'このメッセージは役職発言ではないようです。',
      });
    }

    // Embed の author.name から直接モード判定（ROLE_CONFIG のキー上書き問題を回避）
    const mode = getModeFromEmbedName(authorName);
    if (!mode) {
      return await interaction.editReply({
        content: 'このメッセージは役職発言ではないようです。',
      });
    }

    // 同じモードのロールを持っているか確認
    const allowedIds = getRoleIdsByMode(mode);
    const hasDeletePermission = allowedIds.some((id) => userRoleIds.includes(id));

    if (!hasDeletePermission) {
      const label = ROLE_GROUPS.find((g) => g.mode === mode)?.label ?? mode;
      return await interaction.editReply({
        content: `この${label}の発言を削除する権限がありません。`,
      });
    }

    // 削除実行
    await msg.delete();
    return await interaction.editReply({
      content: '役職発言を削除しました。',
    });
  } catch (e) {
    console.error('delete_rolepost error:', e);
    return await interaction.editReply({
      content: '指定のメッセージが見つからないか、削除できませんでした。',
    });
  }
}
