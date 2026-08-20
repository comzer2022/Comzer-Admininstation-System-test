import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
type Mode = 'minister' | 'diplomat' | 'examiner';
interface RoleGroupDef {
    mode: Mode;
    label: string;
    getIds: (config: BotConfig) => string[];
}
export class DeleteRolepostCommand {
    readonly data = new SlashCommandBuilder()
        .setName('delete_rolepost')
        .setDescription('役職発言（Bot発言）の削除')
        .addStringOption((o) => o.setName('message_id').setDescription('削除するメッセージのID').setRequired(true));
    private readonly roleGroups: RoleGroupDef[] = [
        { mode: 'minister', label: '閣僚会議議員', getIds: (c) => c.ministerRoleIds },
        { mode: 'diplomat', label: '外交官(外務省 総合外務部職員)', getIds: (c) => c.diplomatRoleIds },
        { mode: 'examiner', label: '入国審査担当官', getIds: (c) => c.examinerRoleIds },
    ];
    constructor(private readonly config: BotConfig) { }
    private getRoleIdsByMode(mode: Mode): string[] {
        const group = this.roleGroups.find((g) => g.mode === mode);
        return group ? group.getIds(this.config) : [];
    }
    private getModeFromEmbedName(authorName: string): Mode | null {
        const group = this.roleGroups.find((g) => g.label === authorName);
        return group ? group.mode : null;
    }
    async execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
        let userRoleIds: string[] = [];
        if (interaction.guildId) {
            const member = interaction.member;
            userRoleIds = member && 'cache' in member.roles ? member.roles.cache.map((r) => String(r.id)) : [];
        }
        else {
            const guild = await interaction.client.guilds.fetch(this.config.referenceGuildId);
            const member = await guild.members.fetch(interaction.user.id);
            userRoleIds = member.roles.cache.map((r) => String(r.id));
        }
        const allAllowedIds = this.roleGroups.flatMap((g) => g.getIds(this.config));
        const hasPermission = allAllowedIds.some((id) => userRoleIds.includes(id));
        if (!hasPermission) {
            console.trace('権限エラー: delete_rolepost');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '君はステージが低い。君のコマンドを受け付けると君のカルマが私の中に入って来て私が苦しくなる。(権限エラー)',
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
            if (!msg.webhookId) {
                return await interaction.editReply({
                    content: 'コムザール行政システムが送信した役職発言のみ削除できます。',
                });
            }
            const authorName = msg.embeds[0]?.author?.name;
            if (!authorName) {
                return await interaction.editReply({ content: 'このメッセージは役職発言ではないようです。' });
            }
            const mode = this.getModeFromEmbedName(authorName);
            if (!mode) {
                return await interaction.editReply({ content: 'このメッセージは役職発言ではないようです。' });
            }
            const allowedIds = this.getRoleIdsByMode(mode);
            const hasDeletePermission = allowedIds.some((id) => userRoleIds.includes(id));
            if (!hasDeletePermission) {
                const label = this.roleGroups.find((g) => g.mode === mode)?.label ?? mode;
                return await interaction.editReply({ content: `この${label}の発言を削除する権限がありません。` });
            }
            await msg.delete();
            return await interaction.editReply({ content: '役職発言を削除しました。' });
        }
        catch (e) {
            console.error('delete_rolepost error:', e);
            return await interaction.editReply({
                content: '指定のメッセージが見つからないか、削除できませんでした。',
            });
        }
    }
}
