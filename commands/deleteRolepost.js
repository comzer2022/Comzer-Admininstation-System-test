import { SlashCommandBuilder } from '@discordjs/builders';

export const data = new SlashCommandBuilder()
  .setName("delete_rolepost")
  .setDescription("役職発言（Bot発言）の削除")
  .addStringOption(o =>
    o.setName("message_id").setDescription("削除するメッセージのID").setRequired(true)
  );

export async function execute(interaction) {
  // 権限チェック
  let userRoleIds = [];

  if (interaction.guild) {
    userRoleIds = interaction.member.roles.cache.map(r => String(r.id));
  } else {
    const refGuildId = "1188411576483590194";
    if (!refGuildId) {
      throw new Error("環境変数 REFERENCE_GUILD_ID が設定されていません");
    }
    const guild = await interaction.client.guilds.fetch(refGuildId);
    const member = await guild.members.fetch(interaction.user.id);
    userRoleIds = member.roles.cache.map(r => String(r.id));
  }

  const ALLOWED_ROLE_IDS = [
    ...(process.env.ROLLID_MINISTER ? process.env.ROLLID_MINISTER.split(',') : []),
    ...(process.env.ROLLID_DIPLOMAT ? process.env.ROLLID_DIPLOMAT.split(',') : []),
  ].map(x => x.trim()).filter(Boolean);

  const hasPermission = ALLOWED_ROLE_IDS.some(roleId => userRoleIds.includes(roleId));

  if (!hasPermission) {
    console.trace("権限エラー: delete_rolepost");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "君はステージが低い。君のコマンドを受け付けると君のカルマが私の中に入って来て私が苦しくなる。(権限エラー)",
        ephemeral: true
      });
    }
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const messageId = interaction.options.getString('message_id', true);
  const channel = interaction.channel;
  const member = interaction.member;
  const ROLE_CONFIG = interaction.client.ROLE_CONFIG || {};

  const diplomatRoles = (process.env.ROLLID_DIPLOMAT || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const ministerRoles = (process.env.ROLLID_MINISTER || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const examinerRoles = (process.env.EXAMINER_ROLE_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const executorRoleIds = member.roles.cache.map(r => r.id);

  try {
    const msg = await channel.messages.fetch(messageId);

    // 1) Webhook 経由でないメッセージは削除不可
    if (!msg.webhookId) {
      return await interaction.editReply({
        content: "コムザール行政システムが送信した役職発言のみ削除できます。",
      });
    }

    // 2) Embed の author.name から roleId を逆引き
    const embed = msg.embeds[0];
    const authorName = embed?.author?.name;
    if (!authorName) {
      return await interaction.editReply({
        content: "このメッセージは役職発言ではないようです。",
      });
    }

    const roleIdOfEmbed = Object.entries(ROLE_CONFIG)
      .find(([rid, cfg]) => cfg.embedName === authorName)
      ?.[0];

    if (!roleIdOfEmbed) {
      return await interaction.editReply({
        content: "このメッセージは役職発言ではないようです。",
      });
    }

    // 3) モード別の権限チェック
    let mode = null;
    if (ministerRoles.includes(roleIdOfEmbed)) {
      mode = 'minister';
    } else if (diplomatRoles.includes(roleIdOfEmbed)) {
      mode = 'diplomat';
    } else if (examinerRoles.includes(roleIdOfEmbed)) {
      mode = 'examiner';
    }

    if (!mode) {
      return await interaction.editReply({
        content: "この発言のモードが特定できません。",
      });
    }

    const hasDeletePermission = (
      mode === 'minister'
        ? ministerRoles.some(r => executorRoleIds.includes(r))
        : mode === 'diplomat'
          ? diplomatRoles.some(r => executorRoleIds.includes(r))
          : mode === 'examiner'
            ? examinerRoles.some(r => executorRoleIds.includes(r))
            : false
    );

    if (!hasDeletePermission) {
      const modeName = mode === 'minister'
        ? '閣僚会議議員'
        : mode === 'diplomat'
          ? '外交官(外務省 総合外務部職員)'
          : '入国審査担当官';

      return await interaction.editReply({
        content: `この${modeName}の発言を削除する権限がありません。`,
      });
    }

    // 4) 削除実行
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
