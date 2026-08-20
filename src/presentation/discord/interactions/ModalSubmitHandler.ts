import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalSubmitInteraction } from 'discord.js';
import type { SessionLifecycleService } from '../../../application/session/SessionLifecycleService.js';
import type { InspectionOrchestrator } from '../../../application/inspection/InspectionOrchestrator.js';
import type { DebugModeState } from '../../../application/ops/DebugModeState.js';
import { nowJST } from '../../../infrastructure/logger/nowJST.js';
import { createApprovalEmbed, createRejectionEmbed, publishApproval } from './ApplicationEmbeds.js';
import { APP_CONFIG } from '../../../infrastructure/config/AppConfigLoader.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
import type { InspectionResult, ParsedApplication } from '../../../domain/model/ParsedApplication.js';
const INSPECTION_TIMEOUT_MS = 60000;
export class ModalSubmitHandler {
    constructor(private readonly sessions: SessionLifecycleService, private readonly orchestrator: InspectionOrchestrator, private readonly debugMode: DebugModeState, private readonly config: BotConfig) { }
    async handle(interaction: ModalSubmitInteraction): Promise<unknown> {
        const sessionId = interaction.customId.replace('immigration-modal-', '');
        const session = this.sessions.getSession(sessionId);
        if (!session) {
            return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
        }
        this.sessions.updateSessionLastAction(sessionId);
        let mcid: string, nation: string, period: string, companionsRaw: string, joinersRaw: string;
        try {
            mcid = interaction.fields.getTextInputValue('mcid').trim();
            nation = interaction.fields.getTextInputValue('nation').trim();
            period = interaction.fields.getTextInputValue('period').trim();
            companionsRaw = interaction.fields.getTextInputValue('companions').trim();
            joinersRaw = interaction.fields.getTextInputValue('joiners').trim();
        }
        catch (err) {
            console.error('[Modal] フィールド取得エラー:', err);
            return interaction.reply({
                content: '入力内容の取得に失敗しました。もう一度お試しください。',
                ephemeral: true,
            });
        }
        const companions = companionsRaw && companionsRaw !== 'なし'
            ? companionsRaw
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
            : [];
        const joiner = joinersRaw && joinersRaw !== 'なし' ? joinersRaw : null;
        const version = session.data.version;
        session.data = { version, mcid, nation, period, companions, joiner };
        session.logs.push(`[${nowJST()}] Modal送信完了`);
        session.logs.push(`[${nowJST()}] version: ${version}, MCID: ${mcid}, 国籍: ${nation}`);
        session.logs.push(`[${nowJST()}] 期間: ${period}, 同行者: ${companions.join(',') || 'なし'}, 合流者: ${joiner || 'なし'}`);
        await interaction.deferReply();
        await interaction.editReply({ content: '申請内容を確認中…' });
        session.logs.push(`[${nowJST()}] Modal送信後、審査開始`);
        const inputText = [
            `MCID: ${mcid}`,
            `国籍: ${nation}`,
            `目的・期間: ${period}`,
            companions.length > 0 ? `同行者: ${companions.join(', ')}` : '',
            joiner ? `合流者: ${joiner}` : '',
        ]
            .filter(Boolean)
            .join('\n');
        let isTimeout = false;
        const timeoutPromise = new Promise<InspectionResult>((resolve) => {
            setTimeout(() => {
                isTimeout = true;
                resolve({
                    approved: false,
                    content: 'システムが混雑しています。60秒以上応答がなかったため、タイムアウトとして処理を中断しました。',
                });
            }, INSPECTION_TIMEOUT_MS);
        });
        const inspectionPromise = (async (): Promise<InspectionResult> => {
            await interaction.editReply({ content: '申請内容のAI解析中…' });
            try {
                return await this.orchestrator.runInspection(inputText, session);
            }
            catch (err) {
                console.error('[ERROR] runInspection:', err);
                return { approved: false, content: '審査中にエラーが発生しました。' };
            }
        })();
        const result = await Promise.race([timeoutPromise, inspectionPromise]);
        if (isTimeout) {
            await interaction.editReply({
                content: '⏳ 60秒間応答がなかったため、処理をタイムアウトで中断しました。再度申請してください。',
            });
            session.logs.push(`[${nowJST()}] タイムアウトエラー`);
            return this.sessions.endSession(session.id, 'タイムアウト', interaction.client);
        }
        const joinData: ParsedApplication = typeof result.content === 'object' ? result.content : {};
        if (result.approved && Array.isArray(joinData.joiners) && (joinData.joinerDiscordIds?.length ?? 0) > 0) {
            session.data.applicantDiscordId = interaction.user.id;
            session.data.parsed = joinData;
            session.data.joinerDiscordIds = joinData.joinerDiscordIds;
            for (const discordId of joinData.joinerDiscordIds ?? []) {
                try {
                    const user = await interaction.client.users.fetch(discordId);
                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
                        .setCustomId(`joinerResponse-yes-${session.id}`)
                        .setLabel('はい')
                        .setStyle(ButtonStyle.Success), new ButtonBuilder()
                        .setCustomId(`joinerResponse-no-${session.id}`)
                        .setLabel('いいえ')
                        .setStyle(ButtonStyle.Danger));
                    await user.send({
                        content: `外務省入管局からの確認通知です。申請者 ${joinData.mcid} さんからあなたが国内で合流するユーザーである旨の申請がありました。この申請はお間違えございませんか?(心当たりがない場合は、「いいえ」をご選択ください。)`,
                        components: [row],
                    });
                }
                catch (e) {
                    console.error(`[JoinerConfirm][Error] DM 送信失敗: ${discordId}`, e);
                }
            }
            await interaction.editReply({ content: '申請を受け付けました。しばらくお待ち下さい' });
            session.step = 'waitingJoiner';
            return;
        }
        if (result.approved) {
            let embedData: ParsedApplication = {};
            if (typeof result.content === 'object') {
                embedData = result.content;
            }
            else {
                try {
                    embedData = JSON.parse(result.content) as ParsedApplication;
                    const rawPeriod = embedData.period ?? (embedData as Record<string, unknown>)['期間'];
                    if (rawPeriod && (!embedData.start_datetime || !embedData.end_datetime)) {
                        embedData.start_datetime = embedData.start_datetime || (rawPeriod as string);
                        embedData.end_datetime = embedData.end_datetime || (rawPeriod as string);
                    }
                }
                catch (e) {
                    console.error('[ERROR] JSON parse failed:', e);
                    embedData = {};
                }
            }
            if (Object.keys(embedData).length) {
                await interaction.editReply({ embeds: [createApprovalEmbed(embedData)] });
                await publishApproval(embedData, interaction.client, {
                    publishChannelId: APP_CONFIG.publishChannelId,
                    configLogChannelId: APP_CONFIG.logChannelId,
                    debugChannelId: APP_CONFIG.debugChannelId,
                    envLogChannelId: this.config.logChannelId,
                }, this.debugMode);
                return this.sessions.endSession(session.id, '承認', interaction.client);
            }
        }
        const reasonMsg = typeof result.content === 'string'
            ? result.content
            : '申請内容に不備や却下条件があったため、審査が却下されました。';
        await interaction.editReply({ embeds: [createRejectionEmbed(result.parsed ?? {}, reasonMsg)] });
        return this.sessions.endSession(session.id, '却下', interaction.client);
    }
}
