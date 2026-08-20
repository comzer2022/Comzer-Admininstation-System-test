import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { BlacklistManagementService } from '../../../../application/blacklist/BlacklistManagementService.js';
import { resolveUserRoleIds, unauthorizedReply } from './shared.js';
export class RemoveCountryCommand {
    readonly data = new SlashCommandBuilder()
        .setName('remove_country')
        .setDescription('ブラックリスト(国)から削除')
        .addStringOption((o) => o.setName('name').setDescription('国名').setRequired(true));
    constructor(private readonly blacklist: BlacklistManagementService) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const userRoleIds = await resolveUserRoleIds(interaction);
        if (!this.blacklist.hasManagePermission(userRoleIds)) {
            console.trace('権限エラー: remove_country');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(unauthorizedReply());
            }
            return;
        }
        const country = interaction.options.getString('name', true).trim();
        const result = await this.blacklist.removeEntry('Country', country);
        if (result.result === 'invalidated') {
            await interaction.reply(`🟣 「${country}」を無効化しました`);
        }
        else {
            await interaction.reply(`⚠️ ブラックリスト(国) に「${country}」は存在しません`);
        }
    }
}
