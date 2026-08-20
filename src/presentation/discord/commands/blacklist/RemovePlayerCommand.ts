import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { BlacklistManagementService } from '../../../../application/blacklist/BlacklistManagementService.js';
import { resolveUserRoleIds, unauthorizedReply } from './shared.js';
export class RemovePlayerCommand {
    readonly data = new SlashCommandBuilder()
        .setName('remove_player')
        .setDescription('ブラックリスト(プレイヤー)から削除')
        .addStringOption((o) => o.setName('mcid').setDescription('MCID').setRequired(true));
    constructor(private readonly blacklist: BlacklistManagementService) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const userRoleIds = await resolveUserRoleIds(interaction);
        if (!this.blacklist.hasManagePermission(userRoleIds)) {
            console.trace('権限エラー: remove_player');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(unauthorizedReply());
            }
            return;
        }
        const mcid = interaction.options.getString('mcid', true).trim();
        const result = await this.blacklist.removeEntry('Player', mcid);
        if (result.result === 'invalidated') {
            await interaction.reply(`🟣 「${mcid}」を無効化しました`);
        }
        else {
            await interaction.reply(`⚠️ ブラックリスト(プレイヤー) に「${mcid}」は存在しません`);
        }
    }
}
