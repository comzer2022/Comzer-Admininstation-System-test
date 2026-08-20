import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { BotLifecycleService } from '../../../application/ops/BotLifecycleService.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
export class StartCommand {
    readonly data = new SlashCommandBuilder().setName('start').setDescription('ボットを再起動します');
    constructor(private readonly lifecycle: BotLifecycleService, private readonly config: BotConfig) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
        const allowedUserIds = this.config.stopUserIds;
        const allowedRoleIds = this.config.stopRoleIds;
        let isAllowed = false;
        if (!interaction.guildId) {
            isAllowed = allowedUserIds.includes(interaction.user.id);
        }
        else {
            const member = interaction.member;
            const memberRoles = member && 'cache' in member.roles ? member.roles.cache : null;
            isAllowed =
                allowedUserIds.includes(interaction.user.id) ||
                    (memberRoles ? allowedRoleIds.some((rid) => memberRoles.has(rid)) : false);
        }
        if (!isAllowed) {
            return interaction.reply({
                content: 'このコマンドを実行する権限がありません。',
                flags: 1 << 6,
            });
        }
        await interaction.deferReply({ flags: 1 << 6 });
        await interaction.editReply({ content: 'ボットを再起動しています…' });
        const { ok, message } = await this.lifecycle.start();
        await interaction.editReply({ content: message });
        void ok;
    }
}
