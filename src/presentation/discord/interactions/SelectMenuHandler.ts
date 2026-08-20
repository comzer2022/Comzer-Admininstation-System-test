import { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuInteraction, } from 'discord.js';
import type { SessionLifecycleService } from '../../../application/session/SessionLifecycleService.js';
import { nowJST } from '../../../infrastructure/logger/nowJST.js';
export class SelectMenuHandler {
    constructor(private readonly sessions: SessionLifecycleService) { }
    async handleVersionSelect(interaction: StringSelectMenuInteraction): Promise<unknown> {
        const sessionId = interaction.customId.replace('version-select-', '');
        const session = this.sessions.getSession(sessionId);
        if (!session) {
            return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
        }
        this.sessions.updateSessionLastAction(sessionId);
        session.data.version = interaction.values[0];
        session.logs.push(`[${nowJST()}] ゲームエディション選択: ${session.data.version}`);
        const modal = new ModalBuilder()
            .setCustomId(`immigration-modal-${session.id}`)
            .setTitle('一時入国審査申請フォーム');
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId('mcid')
            .setLabel('MCID / ゲームタグ')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('BE_を付ける必要はありません')
            .setRequired(true)
            .setMaxLength(50)), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId('nation')
            .setLabel('国籍')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('例: 日本')
            .setRequired(true)
            .setMaxLength(100)), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId('period')
            .setLabel('入国期間と目的')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('例: 観光で10日間')
            .setRequired(true)
            .setMaxLength(200)), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId('companions')
            .setLabel('同行者(いなければ空欄)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('例: user1,BE_user2')
            .setRequired(false)
            .setMaxLength(300)), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId('joiners')
            .setLabel('合流者(いなければ空欄)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('例: citizen123, 12345678901234, BE_citizen234')
            .setRequired(false)
            .setMaxLength(300)));
        await interaction.showModal(modal);
        session.step = 'modal_submitted';
    }
}
