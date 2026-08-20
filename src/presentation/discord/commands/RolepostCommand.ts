import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags, ChatInputCommandInteraction, StringSelectMenuInteraction, } from 'discord.js';
import type { RolePostService } from '../../../application/rolepost/RolePostService.js';
import type { RoleConfigEntry, RoleConfigMap } from '../../../infrastructure/config/RoleConfig.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
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
export class RolepostCommand {
    readonly data = new SlashCommandBuilder()
        .setName('rolepost')
        .setDescription('役職発言モードの ON / OFF を切り替えます（トグル式）');
    constructor(private readonly rolePost: RolePostService, private readonly config: BotConfig) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const { member, client, channelId, user } = interaction;
            const clientConfig: RoleConfigMap = client.ROLE_CONFIG || {};
            const userId = user.id;
            if (this.rolePost.isActive(channelId, userId)) {
                this.rolePost.setInactive(channelId, userId);
                return interaction.editReply('役職発言モードを **OFF** にしました。');
            }
            const roleGroups: RoleGroup[] = [
                { idList: this.config.ministerRoleIds, mode: 'minister', label: '閣僚会議議員' },
                { idList: this.config.diplomatRoleIds, mode: 'diplomat', label: '外交官(外務省 総合外務部職員)' },
                { idList: this.config.examinerRoleIds, mode: 'examiner', label: '入国審査担当官' },
            ];
            const userRoles = member && 'cache' in member.roles ? member.roles.cache : null;
            const matched: MatchedRole[] = [];
            if (userRoles) {
                for (const group of roleGroups) {
                    for (const rid of group.idList) {
                        if (rid && userRoles.has(rid)) {
                            matched.push({ mode: group.mode, rid, modeLabel: group.label });
                        }
                    }
                }
            }
            const uniqueMap = new Map<string, MatchedRole>();
            for (const item of matched) {
                if (!uniqueMap.has(item.mode)) {
                    uniqueMap.set(item.mode, item);
                }
            }
            const uniqueMatched = Array.from(uniqueMap.values());
            if (uniqueMatched.length === 0) {
                return interaction.editReply('対象の役職ロールを保有していません。');
            }
            if (uniqueMatched.length === 1) {
                const first = uniqueMatched[0]!;
                const { mode, rid, modeLabel } = first;
                this.rolePost.setActive(channelId, userId, `${mode}:${rid}`);
                return interaction.editReply(`役職発言モードを **ON** にしました。（${modeLabel}）`);
            }
            const options = uniqueMatched.map(({ mode, rid, modeLabel }) => {
                const cfg: RoleConfigEntry & {
                    emoji?: string;
                } = clientConfig[rid] || ({} as RoleConfigEntry);
                const option: {
                    label: string;
                    value: string;
                    emoji?: string;
                } = {
                    label: modeLabel.substring(0, 100),
                    value: `${mode}:${rid}`,
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
        }
        catch (err) {
            console.error('[rolepost] execute error:', err);
            return interaction
                .editReply({ content: '⚠️ 実行中にエラーが発生しました。' })
                .catch(() => { });
        }
    }
    async handleRolepostSelect(interaction: StringSelectMenuInteraction): Promise<void> {
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
            if (!mode || !roleId)
                return;
            this.rolePost.setActive(channelId, userId, `${mode}:${roleId}`);
            const modeName = mode === 'diplomat' ? '外交官(外務省 総合外務部職員)' : mode === 'minister' ? '閣僚会議議員' : '入国審査担当官';
            await interaction.update({
                content: `役職発言モードを **ON** にしました。（${modeName}）`,
                components: [],
            });
        }
        catch (err) {
            console.error('[rolepost] handleSelect error:', err);
        }
    }
}
