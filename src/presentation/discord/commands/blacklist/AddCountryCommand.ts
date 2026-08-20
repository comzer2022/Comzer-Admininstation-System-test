import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { BlacklistManagementService } from '../../../../application/blacklist/BlacklistManagementService.js';
import { resolveUserRoleIds, unauthorizedReply } from './shared.js';
export class AddCountryCommand {
    readonly data = new SlashCommandBuilder()
        .setName('add_country')
        .setDescription('ブラックリスト(国)に追加')
        .addStringOption((o) => o.setName('name').setDescription('国名').setRequired(true));
    constructor(private readonly blacklist: BlacklistManagementService) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const userRoleIds = await resolveUserRoleIds(interaction);
        if (!this.blacklist.hasManagePermission(userRoleIds)) {
            console.trace('権限エラー: add_country');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(unauthorizedReply());
            }
            return;
        }
        const country = interaction.options.getString('name', true).trim();
        const result = await this.blacklist.addEntry('Country', country);
        if (result.result === 'duplicate') {
            await interaction.reply(`⚠️ 既にブラックリスト(国) に登録されています`);
        }
        else if (result.result === 'reactivated') {
            await interaction.reply(`🟢 無効だった「${country}」を再有効化しました`);
        }
        else if (result.result === 'added') {
            await interaction.reply(`✅ ブラックリスト(国) に「${country}」を追加しました`);
        }
    }
}
