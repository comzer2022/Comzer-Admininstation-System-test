import { ActionRowBuilder, StringSelectMenuBuilder, ButtonInteraction } from 'discord.js';
import type { SessionLifecycleService } from '../../../application/session/SessionLifecycleService.js';
import { nowJST } from '../../../infrastructure/logger/nowJST.js';
export class ButtonInteractionHandler {
    constructor(private readonly sessions: SessionLifecycleService) { }
    async handle(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split('-');
        const type = parts[0];
        const sessionId = parts.slice(1).join('-');
        const session = this.sessions.getSession(sessionId);
        if (!session) {
            await interaction.reply({
                content: 'このセッションは存在しないか期限切れです。最初からやり直してください。',
                ephemeral: true,
            });
            return;
        }
        this.sessions.updateSessionLastAction(sessionId);
        if (type === 'start') {
            session.logs.push(`[${nowJST()}] 概要同意: start`);
            session.step = 'select_version';
            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
                .setCustomId(`version-select-${session.id}`)
                .setPlaceholder('ゲームエディションを選択してください')
                .addOptions([
                { label: 'Java Edition', value: 'java', description: 'Java版Minecraft' },
                { label: 'Bedrock Edition', value: 'bedrock', description: '統合版Minecraft' },
            ]));
            await interaction.update({ content: 'ゲームエディションを選択してください。', components: [row] });
            return;
        }
        if (type === 'cancel') {
            session.logs.push(`[${nowJST()}] ユーザーが途中キャンセル`);
            await interaction.update({ content: '申請をキャンセルしました。', components: [] });
            await this.sessions.endSession(session.id, 'キャンセル', interaction.client);
            return;
        }
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'その操作には対応していません。', ephemeral: true });
        }
    }
}
