import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { SelfCheckService } from '../../../application/ops/SelfCheckService.js';
export class StatusCommand {
    readonly data = new SlashCommandBuilder()
        .setName('status')
        .setDescription('BOTの最終自己診断時刻と連携状態を表示');
    constructor(private readonly selfCheck: SelfCheckService) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        console.log('[STATUS EXECUTE] replied:', interaction.replied, 'deferred:', interaction.deferred);
        if (interaction.replied || interaction.deferred)
            return;
        try {
            await interaction.deferReply({ ephemeral: true });
        }
        catch (err) {
            console.error('[STATUS] deferReply failed:', err);
            return;
        }
        const { citizenSheet, blacklistSheet, mojangApi, bedrockApi, checkedAt } = await this.selfCheck.runSelfCheck();
        const timeStr = checkedAt.toLocaleString('ja-JP', { hour12: false, timeZone: 'Asia/Tokyo' });
        const embed = new EmbedBuilder()
            .setTitle('CAS自己診断プログラムを実行しました')
            .setDescription(`✅ 最終診断時刻：${timeStr}\n` +
            `${citizenSheet}\n` +
            `${blacklistSheet}\n` +
            `${mojangApi}\n` +
            `${bedrockApi}`)
            .setColor(0x2ecc71);
        try {
            await interaction.editReply({ embeds: [embed] });
        }
        catch (err) {
            console.error('[STATUS] editReply failed:', err);
            try {
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            }
            catch (err2) {
                console.error('[STATUS] followUp also failed:', err2);
            }
        }
    }
}
