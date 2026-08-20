import { SlashCommandBuilder, MessageFlags, REST, Routes, ChatInputCommandInteraction } from 'discord.js';
import type { CommandRegistry } from './CommandRegistry.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
export class DeployCommand {
    readonly data = new SlashCommandBuilder().setName('deploy').setDescription('スラッシュコマンドを再登録します');
    constructor(private readonly registry: CommandRegistry, private readonly config: BotConfig) { }
    async execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
        const allowedRoleId = this.config.deployRoleId;
        const member = interaction.member;
        const hasRole = member && 'cache' in member.roles ? member.roles.cache.has(allowedRoleId ?? '') : false;
        if (allowedRoleId && !hasRole) {
            return interaction.reply({ content: '権限がありません。', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const rest = new REST({ version: '10' }).setToken(this.config.discordToken as string);
            const globalBody = this.registry.toDeployBody();
            const clientId = interaction.client.user?.id;
            if (!clientId) {
                return interaction.editReply('❌ クライアント情報が取得できませんでした。');
            }
            await rest.put(Routes.applicationCommands(clientId), { body: globalBody });
            return interaction.editReply(`✅ コマンド登録完了: ${globalBody.length} 件`);
        }
        catch (err) {
            console.error('[deploy] error:', err);
            return interaction.editReply(`❌ 登録失敗: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
