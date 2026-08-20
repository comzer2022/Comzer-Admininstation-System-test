import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import type { CitizenInfoClient } from '../../../infrastructure/czrBridge/CitizenInfoClient.js';
const REQUIR_ROLE_ID = '1188422312823902229';
const labelMap: Record<string, string> = {
    discord_id: 'discord id',
    discord_name: 'discord名',
    sub_discord_id: 'サブdiscord id',
    mcid: 'mcid',
    sub_mcid: 'サブmcid',
    residence: '所属州',
    company: '所属企業',
    party: '所属政党',
};
export class InfoCommand {
    readonly data = new SlashCommandBuilder()
        .setName('info')
        .setDescription('実行者の国民情報を表示します（国民のみ実行可）');
    constructor(private readonly citizenInfo: CitizenInfoClient) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
        const member = interaction.member;
        const hasRole = member && 'cache' in member.roles ? member.roles.cache.has(REQUIR_ROLE_ID) : false;
        if (!hasRole) {
            return await interaction.reply({
                content: 'エラー：このコマンドを実行する権限がありません。',
                ephemeral: true,
            });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const resData = await this.citizenInfo.getByDiscordId(interaction.user.id);
            if (resData.message === '情報なし') {
                return await interaction.editReply(`Discord ID: ${interaction.user.id} に該当する国民情報は登録されていません。`);
            }
            const infoEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('👤 国民登録情報')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: '大統領府内務省 統合管理局' })
                .setTimestamp();
            Object.keys(labelMap).forEach((key) => {
                let value: unknown = resData[key] || '情報なし';
                if (typeof value === 'string' && value.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(value);
                        value = Array.isArray(parsed) ? (parsed.length > 0 ? parsed.join(', ') : '情報なし') : value;
                    }
                    catch {
                    }
                }
                infoEmbed.addFields({ name: labelMap[key] ?? key, value: String(value), inline: true });
            });
            await interaction.editReply({ embeds: [infoEmbed] });
        }
        catch (error) {
            console.error('API Error:', error);
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                await interaction.editReply('❌ API認証エラー');
            }
            else {
                await interaction.editReply('❌ システムエラーが発生しました。');
            }
        }
    }
}
