import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  Client,
} from 'discord.js';
import * as embedPost from '../commands/embedPost.js';
import { getOrCreateHook } from '../services/webhookmanager.js';
import { startSession, getAllSessions } from '../services/sessionManager.js';
import { messagelog } from '../utils/logger/index.js';
import { nowJST } from '../utils/helpers.js';
import type { RoleConfigEntry } from '../config/roleConfig.js';

const TICKET_CAT = process.env.TICKET_CAT;
const ADMIN_KEYWORD = process.env.ADMIN_KEYWORD || '!status';

export async function handleMessage(message: Message, client: Client): Promise<unknown> {
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
    if ('send' in message.channel) {
      return message.channel.send({ embeds: [reportEmbed] });
    }
    return;
  }

  const parentId = 'parentId' in message.channel ? message.channel.parentId : null;
  if (
    client.user &&
    message.mentions.has(client.user) &&
    String(parentId) === String(TICKET_CAT) &&
    /ID:CASTEST/.test(message.content)
  ) {
    await startImmigrationSession(message, client);
  }
}

/** 役職発言モードの mode → RoleConfigEntry マップ用のキー */
type RolepostMode = 'minister' | 'diplomat' | 'examiner';

async function handleRolepostMessage(message: Message, _client: Client): Promise<void> {
  const stored = embedPost.getRoleId(message.channel.id, message.author.id);
  if (!stored) return;

  const colonIdx = stored.indexOf(':');
  if (colonIdx === -1) return;
  const mode = stored.slice(0, colonIdx) as RolepostMode;
  const roleId = stored.slice(colonIdx + 1);

  // modeからcfgを決定
  const modeToCfgKey: Record<RolepostMode, string> = {
    minister: 'ROLLID_MINISTER',
    diplomat: 'ROLLID_DIPLOMAT',
    examiner: 'EXAMINER_ROLE_IDS',
  };
  const envKey = modeToCfgKey[mode];
  if (!envKey) return;

  const DIPLOMAT_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/5dwbifgYfsdWpZx/preview';
  const MINISTER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/qGWt4rftd9ygKdi/preview';
  const EXAMINER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/NEsrzngYJEHZwTn/preview';
  const COMZER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/2DfeR3dTWdtCrgq/preview';

  const modeCfgMap: Record<RolepostMode, RoleConfigEntry> = {
    minister: {
      embedName: '閣僚会議議員',
      embedIcon: MINISTER_ICON_URL,
      webhookName: 'コムザール連邦共和国 大統領府',
      webhookIcon: COMZER_ICON_URL,
      canDelete: [],
    },
    diplomat: {
      embedName: '外交官(外務省 総合外務部職員)',
      embedIcon: DIPLOMAT_ICON_URL,
      webhookName: 'コムザール連邦共和国 外務省',
      webhookIcon: DIPLOMAT_ICON_URL,
      canDelete: [],
    },
    examiner: {
      embedName: '入国審査担当官',
      embedIcon: EXAMINER_ICON_URL,
      webhookName: 'コムザール連邦共和国 大統領府',
      webhookIcon: COMZER_ICON_URL,
      canDelete: [],
    },
  };

  const cfg = modeCfgMap[mode];
  if (!cfg) return;

  try {
    const channel = message.channel;
    if (!('fetchWebhooks' in channel)) return;

    const hook = await getOrCreateHook(channel, roleId, cfg);
    const files = [...message.attachments.values()].map((att) => ({ attachment: att.url }));
    const firstImg = files.find((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.attachment));

    await hook.send({
      username: cfg.webhookName,
      avatarURL: cfg.webhookIcon,
      embeds: [
        embedPost.makeEmbed(message.content || '(無言)', roleId, { [roleId]: cfg }, firstImg?.attachment),
      ],
      files,
      allowedMentions: { users: [], roles: [roleId] },
    });

    await message.delete().catch(() => {});
  } catch (err) {
    console.error('[rolepost] resend error:', err instanceof Error ? err.message : err);
  }
}

async function startImmigrationSession(message: Message, _client: Client): Promise<unknown> {
  const session = startSession(message.channel.id, message.author.id);
  session.logs.push(`[${nowJST()}] セッション開始`);

  const introEmbed = new EmbedBuilder()
    .setTitle('自動入国審査システムです。')
    .setDescription(
      'こちらのチケットでは、旅行、取引、労働等を行うために一時的に入国を希望される方に対し、許可証を自動で発行しております。\n' +
        '審査は24時間365日いつでも受けられ、最短数分で許可証が発行されます。\n' +
        '以下の留意事項をよくお読みの上、次に進む場合は「進む」、申請を希望しない場合は「終了」をクリックしてください。'
    )
    .addFields({
      name: '【留意事項】',
      value:
        '・入国が承認されている期間中、申告内容に誤りがあることが判明したり、[コムザール連邦共和国の明示する法令](https://comzer-gov.net/laws/) に違反した場合は承認が取り消されることがあります。\n' +
        '・法令の不知は理由に抗弁できません。\n' +
        '・損害を与えた場合、行政省庁は相当の対応を行う可能性があります。\n' +
        '・入国情報は適切な範囲で国民に共有されます。',
    });

  const introRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`start-${session.id}`).setLabel('進む').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cancel-${session.id}`).setLabel('終了').setStyle(ButtonStyle.Danger)
  );

  return message.reply({ embeds: [introEmbed], components: [introRow] });
}
