import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';

// rolepost スラッシュコマンド定義
export const data = new SlashCommandBuilder()
  .setName('rolepost')
  .setDescription('役職発言モードの ON / OFF を切り替えます（トグル式）');

// 発言モード管理
const activeChannels = new Map();

function ensureChannelMap(channelId) {
  if (!activeChannels.has(channelId)) {
    activeChannels.set(channelId, new Map());
  }
  return activeChannels.get(channelId);
}

export function isActive(channelId, userId) {
  const chMap = activeChannels.get(channelId);
  return chMap ? chMap.has(userId) : false;
}

export function getRoleId(channelId, userId) {
  const chMap = activeChannels.get(channelId);
  return chMap ? chMap.get(userId) : null;
}

export function setActive(channelId, userId, roleId) {
  ensureChannelMap(channelId).set(userId, roleId);
}

export function setInactive(channelId, userId) {
  const chMap = activeChannels.get(channelId);
  if (chMap) chMap.delete(userId);
}

// rolepost コマンド本体
export async function execute(interaction) {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const { member, client, channelId, user } = interaction;
    const clientConfig = client.ROLE_CONFIG || {};
    const userId = user.id;

    if (isActive(channelId, userId)) {
      setInactive(channelId, userId);
      return interaction.editReply('役職発言モードを **OFF** にしました。');
    }

    const roleGroups = [
      { idList: (process.env.ROLLID_MINISTER || '').split(','), mode: 'minister', label: '閣僚会議議員' },
      { idList: (process.env.ROLLID_DIPLOMAT || '').split(','), mode: 'diplomat', label: '外交官(外務省 総合外務部職員)' },
      { idList: (process.env.EXAMINER_ROLE_IDS || '').split(','), mode: 'examiner', label: '入国審査担当官' }
    ];

    const userRoles = member.roles.cache;
    const matched = [];

    for (const group of roleGroups) {
      for (const rid of group.idList) {
        const trimmedRid = rid.trim();
        if (trimmedRid && userRoles.has(trimmedRid)) {
          matched.push({ mode: group.mode, rid: trimmedRid, modeLabel: group.label });
        }
      }
    }

    const uniqueMap = new Map();
    for (const item of matched) {
      const uniqueKey = `${item.mode}:${item.rid}`;
      if (!uniqueMap.has(uniqueKey)) {
        uniqueMap.set(uniqueKey, item);
      }
    }
    const uniqueMatched = Array.from(uniqueMap.values());

    if (uniqueMatched.length === 0) {
      return interaction.editReply('対象の役職ロールを保有していません。');
    }

    if (uniqueMatched.length === 1) {
      const { rid, modeLabel } = uniqueMatched[0];
      setActive(channelId, userId, rid);
      return interaction.editReply(`役職発言モードを **ON** にしました。（${modeLabel}）`);
    }

    const options = uniqueMatched.map(({ mode, rid, modeLabel }) => {
      const cfg = clientConfig[rid] || {};
      const option = {
        label: modeLabel.substring(0, 100),
        value: `${mode}:${rid}`, // 選択時にどの役職として振る舞うか判別可能にする
      };

      if (cfg.emoji && typeof cfg.emoji === 'string' && cfg.emoji.trim() !== '') {
        option.emoji = cfg.emoji;
      }
      return option;
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`rolepost-choose-${channelId}-${userId}`)
      .setPlaceholder('発言モードを選択してください')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);

    return interaction.editReply({
      content: 'どのモードで発言モードを有効にしますか？',
      components: [row],
    });

  } catch (err) {
    console.error('[rolepost] execute error:', err);
    return interaction.editReply({ 
      content: '⚠️ 実行中にエラーが発生しました。', 
      flags: [MessageFlags.Ephemeral] 
    }).catch(() => {});
  }
}

// 選択メニューレスポンス
export async function handleRolepostSelect(interaction) {
  try {
    const [, , channelId, userId] = interaction.customId.split('-');
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: 'あなた以外は操作できません。', flags: [MessageFlags.Ephemeral] });
    }

    const [mode, roleId] = interaction.values[0].split(':');
    setActive(channelId, userId, roleId);

    const modeName = mode === 'diplomat' ? '外交官(外務省 総合外務部職員)' : 
                     mode === 'minister' ? '閣僚会議議員' : '入国審査担当官';

    await interaction.update({
      content: `役職発言モードを **ON** にしました。（${modeName}）`,
      components: [],
    });
  } catch (err) {
    console.error('[rolepost] handleSelect error:', err);
  }
}

// Embed 生成ヘルパー
export function makeEmbed(content, roleId, ROLE_CONFIG, attachmentURL = null) {
  const cfg = ROLE_CONFIG[roleId];
  if (!cfg) {
    return new EmbedBuilder()
      .setDescription(content)
      .setFooter({ text: `ROLE_ID:${roleId} (未定義)` });
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: cfg.embedName, iconURL: cfg.embedIcon })
    .setDescription(content)
    .setColor(cfg.embedColor ?? 0x3498db);

  if (attachmentURL) embed.setImage(attachmentURL);
  return embed;
}
