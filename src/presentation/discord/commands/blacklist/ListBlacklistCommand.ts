import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { BlacklistManagementService } from '../../../../application/blacklist/BlacklistManagementService.js';
import { resolveUserRoleIds, unauthorizedReply } from './shared.js';
export class ListBlacklistCommand {
    readonly data = new SlashCommandBuilder()
        .setName('list_blacklist')
        .setDescription('ブラックリストの一覧を表示');
    constructor(private readonly blacklist: BlacklistManagementService) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const userRoleIds = await resolveUserRoleIds(interaction);
        if (!this.blacklist.hasManagePermission(userRoleIds)) {
            console.trace('権限エラー: list_blacklist');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(unauthorizedReply());
            }
            return;
        }
        const { countries, players } = await this.blacklist.listActive();
        const countryList = countries.length > 0 ? countries.join('\n') : 'なし';
        const playerList = players.length > 0 ? players.join('\n') : 'なし';
        await interaction.reply({
            embeds: [
                {
                    title: 'ブラックリスト一覧',
                    fields: [
                        { name: '国', value: countryList, inline: false },
                        { name: 'プレイヤー', value: playerList, inline: false },
                    ],
                    color: 0x2c3e50,
                },
            ],
            ephemeral: true,
        });
    }
}
