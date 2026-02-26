import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName("delete_rolepost")
  .setDescription("役職発言（Bot発言）の削除")
  .addStringOption(o =>
    o.setName("message_id").setDescription("削除するメッセージのID").setRequired(true)
  );

const ROLE_GROUPS = [
  { envKey: 'ROLLID_MINISTER',   mode: 'minister', label: '閣僚会議議員' },
  { envKey: 'ROLLID_DIPLOMAT',   mode: 'diplomat', label: '外交官(外務省 総合外務部職員)' },
  { envKey: 'EXAMINER_ROLE_IDS', mode: 'examiner', label: '入国審査担当官' },
];

function getRoleIdsByMode(mode) {
  const group = ROLE_GROUPS.find(g => g.mode === mode);
  if (!group) return [];
  return (process.env[group.envKey] || '').split(',').map(s => s.trim()).filter(Boolean);
}

function getModeFromRoleId(roleId) {
  for (const { envKey, mode } of ROLE_GROUPS) {
    const ids = (process.env[envKey] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.includes(roleId)) return mode;
  }
  return null;
}

export async function execute(interaction) {
  // ロールID取得
  let userRoleIds = [];

  if (interaction.guildId) {
    userRoleIds = interaction.member.roles.cache.map(r => String(r.id));
  } else {
    const refGuildId = "1188411576483590194";
    const guild = await interaction.client.guilds.fetch(refGuildId);
    const member = await guild.members.fetch(interaction.user.id);
    userRoleIds = member.roles.cache.map(r => String(r.id));
  }

  // いずれかのモードのロールを持っているか
  const allAllowedIds = ROLE_GROUPS.flatMap(({ envKey }) =>
    (process.env[envKey] || '').split(',').map(s => s.trim()).filter(Boolean)
  );
  const hasPermission = allAllowedIds.some(id => userRoleIds.includes(id));

  if (!hasPermission) {
    console.trace("権限エラー: delete_rolepost");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "君はステージが低い。君のコマンドを受け付けると君のカルマが私の中に入って来て私が苦しくなる。(権限エラー)",
        ephemeral: true,
      });
    }
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const messageId = interaction.options.getString('message_id', true);
  const channel = interaction.channel;
  const ROLE_CONFIG = interaction.client.ROLE_CONFIG || {};

  try {
    const msg = await channel.messages.fetch(messageId);

    // Webhook 経由でないメッセージは削除不可
    if (!msg.webhookId) {
      return await interaction.editReply({
        content: "コムザール行政システムが送信した役職発言のみ削除できます。",
      });
    }

    // Embed の author.name から roleId を逆引き
    const authorName = msg.embeds[0]?.author?.name;
    if (!authorName) {
      return await interaction.editReply({
        content: "このメッセージは役職発言ではないようです。",
      });
    }

    const roleIdOfEmbed = Object.entries(ROLE_CONFIG)
      .find(([, cfg]) => cfg.embedName === authorName)
      ?.[0];

    if (!roleIdOfEmbed) {
      return await interaction.editReply({
        content: "このメッセージは役職発言ではないようです。",
      });
    }

    // Embed の roleId からモード判定
    const mode = getModeFromRoleId(roleIdOfEmbed);
    if (!mode) {
      return await interaction.editReply({
        content: "この発言のモードが特定できません。",
      });
    }

    // 同じモードのロールを持っているか確認
    const allowedIds = getRoleIdsByMode(mode);
    const hasDeletePermission = allowedIds.some(id => userRoleIds.includes(id));

    if (!hasDeletePermission) {
      const label = ROLE_GROUPS.find(g => g.mode === mode)?.label ?? mode;
      return await interaction.editReply({
        content: `この${label}の発言を削除する権限がありません。`,
      });
    }

    // 削除実行
    await msg.delete();
    return await interaction.editReply({
      content: "役職発言を削除しました。",
    });

  } catch (e) {
    console.error("delete_rolepost error:", e);
    return await interaction.editReply({
      content: "指定のメッセージが見つからないか、削除できませんでした。",
    });
  }
}
