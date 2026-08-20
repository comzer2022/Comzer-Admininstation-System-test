import type { ButtonInteraction } from 'discord.js';
import type { SessionLifecycleService } from '../../../application/session/SessionLifecycleService.js';
import type { DebugModeState } from '../../../application/ops/DebugModeState.js';
import { nowJST } from '../../../infrastructure/logger/nowJST.js';
import { createApprovalEmbed, createRejectionEmbed, publishApproval } from './ApplicationEmbeds.js';
import { APP_CONFIG } from '../../../infrastructure/config/AppConfigLoader.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
export class JoinerResponseHandler {
    constructor(private readonly sessions: SessionLifecycleService, private readonly debugMode: DebugModeState, private readonly config: BotConfig) { }
    async handle(interaction: ButtonInteraction): Promise<unknown> {
        const parts = interaction.customId.split('-');
        const answer = parts[1];
        const sessionId = parts.slice(2).join('-');
        const session = this.sessions.getSession(sessionId);
        if (!session) {
            return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
        }
        session.logs.push(`[${nowJST()}] 合流者回答: ${interaction.user.id} → ${answer}`);
        session.data.joinerResponses = session.data.joinerResponses || {};
        session.data.joinerResponses[interaction.user.id] = answer ?? '';
        await interaction.reply({ content: '回答ありがとうございました。', ephemeral: true });
        const expectCount = (session.data.joinerDiscordIds || []).length;
        const gotCount = Object.keys(session.data.joinerResponses).length;
        if (expectCount === 0 || gotCount < expectCount)
            return;
        const anyNo = Object.values(session.data.joinerResponses).includes('no');
        const targetChannel = await interaction.client.channels.fetch(session.channelId).catch(() => null);
        if (!targetChannel?.isTextBased() || !('send' in targetChannel)) {
            return this.sessions.endSession(session.id, anyNo ? '却下' : '承認', interaction.client);
        }
        const applicantMention = session.data.applicantDiscordId ? `<@${session.data.applicantDiscordId}> ` : '';
        if (anyNo) {
            const embed = createRejectionEmbed(session.data.parsed ?? {}, '合流者が申請を承認しませんでした。合流者は正しいですか?');
            await targetChannel.send({ content: applicantMention, embeds: [embed] });
            return this.sessions.endSession(session.id, '却下', interaction.client);
        }
        else {
            const embed = createApprovalEmbed(session.data.parsed ?? {});
            await targetChannel.send({ content: applicantMention, embeds: [embed] });
            await publishApproval(session.data.parsed ?? {}, interaction.client, {
                publishChannelId: APP_CONFIG.publishChannelId,
                configLogChannelId: APP_CONFIG.logChannelId,
                debugChannelId: APP_CONFIG.debugChannelId,
                envLogChannelId: this.config.logChannelId,
            }, this.debugMode);
            return this.sessions.endSession(session.id, '承認', interaction.client);
        }
    }
}
