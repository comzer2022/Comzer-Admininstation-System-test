import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as embedPost from '../commands/embedPost.js';
import { getOrCreateHook } from '../services/webhookManager.js';
import { startSession, getAllSessions } from '../services/sessionManager.js';
import { messagelog } from '../utils/logger/index.js';
import { nowJST } from '../utils/helpers.js';

const TICKET_CAT = process.env.TICKET_CAT;
const ADMIN_KEYWORD = process.env.ADMIN_KEYWORD || "!status";

export async function handleMessage(message, client) {
  if (message.author.bot) return;

  messagelog(message, TICKET_CAT, client);

  // 役職発言モード処理
  if (embedPost.isActive(message.channel.id, message.author.id)) {
    await handleRolepostMessage(message, client);
    return;
  }

  // 管理レポート
  if (message.content.trim() === ADMIN_KEYWORD) {
    const sessions = getAllSessions();
    const reportEmbed = new EmbedBuilder()
      .setTitle('管理レポート')
      .addFields({ name: '未完了セッション数', value: `${sessions.size}` });
    return message.channel.send({ embeds: [reportEmbed] });
  }

  // 入国審査開始トリガー
  if (
    message.mentions.has(client.user) &&
    String(message.channel.parentId) === String(TICKET_CAT) &&
    /ID:CAS/.test(message.content)
  ) {
    await startImmigrationSession(message, client);
  }
}

async function handleRolepostMessage(message, client) {
  const member = message.member;
  let roleId = embedPost.getRoleId(message.channel.id, message.author.id);

  if (!roleId) {
    roleId = Object.keys(client.ROLE_CONFIG).find(r => member.roles.cache.has(r));
  }

  if (roleId) {
    try {
      const hook = await getOrCreateHook(message.channel, roleId);
      const files = [...message.attachments.values()].map(att => ({ attachment: att.url }));
      const firstImg = files.find(f => /\.(png|jpe?g|gif|webp)$/i.test(f.attachment));

      await hook.send({
        embeds: [
          embedPost.makeEmbed(
            message.content || '(無言)',
            roleId,
            client.ROLE_CONFIG,
            firstImg?.attachment
          )
        ],
        files,
        allowedMentions: { users: [], roles: [roleId] },
      });

      await message.delete().catch(() => {});
    } catch (err) {
      console.error('[rolepost] resend error:', err);
    }
  }
}

async function startImmigrationSession(message, client) {
  const session = startSession(message.channel.id, message.author.id);
  session.logs.push(`[${nowJST()}] セッション開始`);

  const introEmbed = new EmbedBuilder()
    .setTitle("自動入国審査システムです。")
    .setDescription(
      "こちらのチケットでは、旅行、取引、労働等を行うために一時的に入国を希望される方に対し、許可証を自動で発行しております。\n" +
      "審査は24時間365日いつでも受けられ、最短数分で許可証が発行されます。\n" +
      "以下の留意事項をよくお読みの上、次に進む場合は「進む」、申請を希望しない場合は「終了」をクリックしてください。"
    )
    .addFields({
      name: '【留意事項】', value:
        "・入国が承認されている期間中、申告内容に誤りがあることが判明したり、[コムザール連邦共和国の明示する法令](https://comzer-gov.net/laws/) に違反した場合は承認が取り消されることがあります。\n" +
        "・法令の不知は理由に抗弁できません。\n" +
        "・損害を与えた場合、行政省庁は相当の対応を行う可能性があります。\n" +
        "・入国情報は適切な範囲で国民に共有されます。"
    });

  const introRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`start-${session.id}`).setLabel('進む').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cancel-${session.id}`).setLabel('終了').setStyle(ButtonStyle.Danger)
  );

  return message.reply({ embeds: [introEmbed], components: [introRow] });
}
