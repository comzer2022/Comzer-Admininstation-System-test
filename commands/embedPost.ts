import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { RoleConfigEntry, RoleConfigMap } from '../config/roleConfig.js';

// rolepost スラッシュコマンド定義
export const data = new SlashCommandBuilder()
  .setName('rolepost')
  .setDescription('役職発言モードの ON / OFF を切り替えます（トグル式）');

// 発言モード管理
const activeChannels = new Map<string, Map<string, string>>();

function ensureChannelMap(channelId: string): Map<string, string> {
  if (!activeChannels.has(channelId)) {
    activeChannels.set(channelId, new Map());
  }
  return activeChannels.get(channelId)!;
}

export function isActive(channelId: string, userId: string): boolean {
  const chMap = activeChannels.get(channelId);
  return chMap ? chMap.has(userId) : false;
}

export function getRoleId(channelId: string, userId: string): string | null {
  const chMap = activeChannels.get(channelId);
  return chMap ? (chMap.get(userId) ?? null) : null;
}

export function setActive(channelId: string, userId: string, roleId: string): void {
  ensureChannelMap(channelId).set(userId, roleId);
}

export function setInactive(channelId: string, userId: string): void {
  const chMap = activeChannels.get(channelId);
  if (chMap) chMap.delete(userId);
}

interface RoleGroup {
  idList: string[];
  mode: 'minister' | 'diplomat' | 'examiner';
  label: string;
}

interface MatchedRole {
  mode: RoleGroup['mode'];
  rid: string;
  modeLabel: string;
}

// rolepost コマンド本体
export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  try {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const { member, client, channelId, user } = interaction;
    const clientConfig: RoleConfigMap = client.ROLE_CONFIG || {};
    const userId = user.id;

    if (isActive(channelId, userId)) {
      setInactive(channelId, userId);
      return interaction.editReply('役職発言モードを **OFF** にしました。');
    }

    const roleGroups: RoleGroup[] = [
      {
        idList: (process.env.ROLLID_MINISTER || '').split(','),
        mode: 'minister',
        label: '閣僚会議議員',
      },
      {
        idList: (process.env.ROLLID_DIPLOMAT || '').split(','),
        mode: 'diplomat',
        label: '外交官(外務省 総合外務部職員)',
      },
      {
        idList: (process.env.EXAMINER_ROLE_IDS || '').split(','),
        mode: 'examiner',
        label: '入国審査担当官',
      },
    ];

    const userRoles = member && 'cache' in member.roles ? member.roles.cache : null;
    const matched: MatchedRole[] = [];

    if (userRoles) {
      for (const group of roleGroups) {
        for (const rid of group.idList) {
          const trimmedRid = rid.trim();
          if (trimmedRid && userRoles.has(trimmedRid)) {
            matched.push({ mode: group.mode, rid: trimmedRid, modeLabel: group.label });
          }
        }
      }
    }

    const uniqueMap = new Map<string, MatchedRole>();
    for (const item of matched) {
      const uniqueKey = item.mode;
      if (!uniqueMap.has(uniqueKey)) {
        uniqueMap.set(uniqueKey, item);
      }
    }
    const uniqueMatched = Array.from(uniqueMap.values());

    if (uniqueMatched.length === 0) {
      return interaction.editReply('対象の役職ロールを保有していません。');
    }

    // 単一ロール一致時
    if (uniqueMatched.length === 1) {
      const first = uniqueMatched[0]!;
      const { mode, rid, modeLabel } = first;
      setActive(channelId, userId, `${mode}:${rid}`); // ← mode:roleId で保存
      return interaction.editReply(`役職発言モードを **ON** にしました。（${modeLabel}）`);
    }

    const options = uniqueMatched.map(({ mode, rid, modeLabel }) => {
      const cfg: RoleConfigEntry & { emoji?: string } = clientConfig[rid] || ({} as RoleConfigEntry);
      const option: { label: string; value: string; emoji?: string } = {
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

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

    return interaction.editReply({
      content: 'どのモードで発言モードを有効にしますか？',
      components: [row],
    });
  } catch (err) {
    console.error('[rolepost] execute error:', err);
    return interaction
      .editReply({
        content: '⚠️ 実行中にエラーが発生しました。',
      })
      .catch(() => {});
  }
}

// 選択メニューレスポンス
export async function handleRolepostSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  try {
    const [, , channelId, userId] = interaction.customId.split('-');
    if (!channelId || !userId || interaction.user.id !== userId) {
      await interaction.reply({
        content: 'あなた以外は操作できません。',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const [mode, roleId] = interaction.values[0]!.split(':');
    if (!mode || !roleId) return;
    setActive(channelId, userId, `${mode}:${roleId}`);
    const modeName =
      mode === 'diplomat' ? '外交官(外務省 総合外務部職員)' : mode === 'minister' ? '閣僚会議議員' : '入国審査担当官';

    await interaction.update({
      content: `役職発言モードを **ON** にしました。（${modeName}）`,
      components: [],
    });
  } catch (err) {
    console.error('[rolepost] handleSelect error:', err);
  }
}

// Embed 生成ヘルパー
export function makeEmbed(
  content: string,
  roleId: string,
  ROLE_CONFIG: RoleConfigMap,
  attachmentURL: string | null = null
): EmbedBuilder {
  const cfg = ROLE_CONFIG[roleId];
  if (!cfg) {
    return new EmbedBuilder().setDescription(content).setFooter({ text: `ROLE_ID:${roleId} (未定義)` });
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: cfg.embedName, iconURL: cfg.embedIcon })
    .setDescription(content)
    .setColor((cfg as RoleConfigEntry & { embedColor?: number }).embedColor ?? 0x3498db);

  if (attachmentURL) embed.setImage(attachmentURL);
  return embed;
}
