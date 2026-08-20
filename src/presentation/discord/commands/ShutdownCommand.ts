import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { BotLifecycleService } from '../../../application/ops/BotLifecycleService.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
export class ShutdownCommand {
    readonly data = new SlashCommandBuilder().setName('shutdown').setDescription('ボットを停止します');
    constructor(private readonly lifecycle: BotLifecycleService, private readonly config: BotConfig) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
        let executorRoleIds: string[] = [];
        if (interaction.guildId) {
            const member = interaction.member;
            executorRoleIds = member && 'cache' in member.roles ? member.roles.cache.map((r) => r.id) : [];
        }
        else {
            const guild = await interaction.client.guilds.fetch(this.config.referenceGuildId);
            const member = await guild.members.fetch(interaction.user.id);
            executorRoleIds = member.roles.cache.map((r) => r.id);
        }
        const isAllowed = this.config.stopRoleIds.some((rid) => executorRoleIds.includes(rid));
        if (!isAllowed) {
            return interaction.reply({
                content: '⚠️ このコマンドを実行する権限がありません。',
                ephemeral: !!interaction.guildId,
            });
        }
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({ content: 'ボットをシャットダウンします' });
        setTimeout(() => {
            this.lifecycle.shutdown(interaction.client).catch((error) => {
                console.error('エラーが発生しました:', error);
            });
        }, 1000);
    }
}
