import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { BlacklistManagementService } from '../../../../application/blacklist/BlacklistManagementService.js';
import { resolveUserRoleIds, unauthorizedReply } from './shared.js';
export class AddPlayerCommand {
    readonly data = new SlashCommandBuilder()
        .setName('add_player')
        .setDescription('ブラックリスト(プレイヤー)に追加')
        .addStringOption((o) => o.setName('mcid').setDescription('MCID').setRequired(true));
    constructor(private readonly blacklist: BlacklistManagementService) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const userRoleIds = await resolveUserRoleIds(interaction);
        if (!this.blacklist.hasManagePermission(userRoleIds)) {
            console.trace('権限エラー: add_player');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(unauthorizedReply());
            }
            return;
        }
        const mcid = interaction.options.getString('mcid', true).trim();
        const result = await this.blacklist.addEntry('Player', mcid);
        if (result.result === 'duplicate') {
            await interaction.reply(`⚠️ 既にブラックリスト(プレイヤー) に登録されています`);
        }
        else if (result.result === 'reactivated') {
            await interaction.reply(`🟢 無効だった「${mcid}」を再有効化しました`);
        }
        else if (result.result === 'added') {
            await interaction.reply(`✅ ブラックリスト(プレイヤー) に「${mcid}」を追加しました`);
        }
    }
}
