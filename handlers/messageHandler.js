import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as embedPost from '../commands/embedPost.js';
import { getOrCreateHook } from '../services/webhookmanager.js';  // ← 小文字に修正
import { startSession, getAllSessions } from '../services/sessionManager.js';
import { messagelog } from '../utils/logger/index.js';
import { nowJST } from '../utils/helpers.js';

const TICKET_CAT = process.env.TICKET_CAT;
const ADMIN_KEYWORD = process.env.ADMIN_KEYWORD || "!status";

export async function handleMessage(message, client) {
  if (message.author.bot) return;

  messagelog(message, TICKET_CAT, client);

  if (embedPost.isActive(message.channel.id, message.author.id)) {
    await handleRolepostMessage(message, client);
    return;
  }

  if (message.content.trim() === ADMIN_KEYWORD) {
    const sessions = getAllSessions();
    const reportEmbed = new EmbedBuilder()
      .setTitle('管理レポート')
      .addFields({ name: '未完了セッション数', value: `${sessions.size}` });
    return message.channel.send({ embeds: [reportEmbed] });
  }

  if (
    message.mentions.has(client.user) &&
    String(message.channel.parentId) === String(TICKET_CAT) &&
    /ID:CASTEST/.test(message.content)
  ) {
    await startImmigrationSession(message, client);
  }
}

async function handleRolepostMessage(message, client) {
  const stored = embedPost.getRoleId(message.channel.id, message.author.id);
  if (!stored) return;

  const colonIdx = stored.indexOf(':');
  if (colonIdx === -1) return;
  const mode = stored.slice(0, colonIdx);
  const roleId = stored.slice(colonIdx + 1);

  console.log('[rolepost] stored:', stored);
  console.log('[rolepost] mode:', mode, '/ roleId:', roleId);
  console.log('[rolepost] ROLE_CONFIG keys:', Object.keys(client.ROLE_CONFIG));
  console.log('[rolepost] ROLLID_MINISTER env:', process.env.ROLLID_MINISTER);

  // mode から embedName を解決（ROLE_CONFIG のキー問題を回避）
  const modeToEmbedName = {
    minister: '閣僚会議議員',
    diplomat: '外交官(外務省 総合外務部職員)',
    examiner: '入国審査担当官',
  };
  const embedName = modeToEmbedName[mode];
  if (!embedName) return;

  // embedName で ROLE_CONFIG を逆引きして正しい cfg を取得
  const cfg = Object.values(client.ROLE_CONFIG).find(c => c.embedName === embedName);
  if (!cfg) return;

  console.log('[rolepost] cfg found:', cfg?.embedName, cfg?.webhookName);

  try {
    console.log('[rolepost] getOrCreateHook 開始');
    const hook = await getOrCreateHook(message.channel, roleId, cfg);
    console.log('[rolepost] hook取得成功:', hook?.id);

    const files = [...message.attachments.values()].map(att => ({ attachment: att.url }));
    const firstImg = files.find(f => /\.(png|jpe?g|gif|webp)$/i.test(f.attachment));

    console.log('[rolepost] hook.send 開始');
    await hook.send({
      username: cfg.webhookName,
      avatarURL: cfg.webhookIcon,
      embeds: [
        embedPost.makeEmbed(
          message.content || '(無言)',
          roleId,
          { [roleId]: cfg },
          firstImg?.attachment
        )
      ],
      files,
      allowedMentions: { users: [], roles: [roleId] },
    });
    console.log('[rolepost] hook.send 完了');

    await message.delete().catch(() => {});
  } catch (err) {
    console.error('[rolepost] resend error code:', err?.code);
    console.error('[rolepost] resend error message:', err?.message);
    console.error('[rolepost] resend error stack:', err?.stack);
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
