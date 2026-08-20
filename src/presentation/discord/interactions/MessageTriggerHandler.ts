import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Message, Client } from 'discord.js';
import type { RolePostService } from '../../../application/rolepost/RolePostService.js';
import type { SessionLifecycleService } from '../../../application/session/SessionLifecycleService.js';
import type { WebhookManager } from '../../../infrastructure/discord/WebhookManager.js';
import { messagelog } from '../../../infrastructure/logger/MessageLogWriter.js';
import { nowJST } from '../../../infrastructure/logger/nowJST.js';
import { ROLEPOST_MODE_CONFIG, type RolepostMode } from '../../../infrastructure/config/RoleConfig.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
export class MessageTriggerHandler {
    constructor(private readonly rolePost: RolePostService, private readonly sessions: SessionLifecycleService, private readonly webhooks: WebhookManager, private readonly config: BotConfig) { }
    async handle(message: Message, client: Client): Promise<unknown> {
        if (message.author.bot)
            return;
        messagelog(message, this.config.ticketCategoryId, client);
        if (this.rolePost.isActive(message.channel.id, message.author.id)) {
            await this.handleRolepostMessage(message);
            return;
        }
        if (message.content.trim() === this.config.adminKeyword) {
            const reportEmbed = new EmbedBuilder()
                .setTitle('管理レポート')
                .addFields({ name: '未完了セッション数', value: `${this.sessions.getAllSessions().size}` });
            if ('send' in message.channel) {
                return message.channel.send({ embeds: [reportEmbed] });
            }
            return;
        }
        const parentId = 'parentId' in message.channel ? message.channel.parentId : null;
        if (client.user &&
            message.mentions.has(client.user) &&
            String(parentId) === String(this.config.ticketCategoryId) &&
            /ID:CASTEST/.test(message.content)) {
            await this.startImmigrationSession(message);
        }
    }
    private async handleRolepostMessage(message: Message): Promise<void> {
        const stored = this.rolePost.getRoleId(message.channel.id, message.author.id);
        if (!stored)
            return;
        const colonIdx = stored.indexOf(':');
        if (colonIdx === -1)
            return;
        const mode = stored.slice(0, colonIdx) as RolepostMode;
        const roleId = stored.slice(colonIdx + 1);
        const cfg = ROLEPOST_MODE_CONFIG[mode];
        if (!cfg)
            return;
        try {
            const channel = message.channel;
            if (!('fetchWebhooks' in channel))
                return;
            const hook = await this.webhooks.getOrCreateHook(channel, roleId, cfg);
            const files = [...message.attachments.values()].map((att) => ({ attachment: att.url }));
            const firstImg = files.find((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.attachment));
            await hook.send({
                username: cfg.webhookName,
                avatarURL: cfg.webhookIcon,
                embeds: [
                    this.rolePost.makeEmbed(message.content || '(無言)', roleId, { [roleId]: cfg }, firstImg?.attachment),
                ],
                files,
                allowedMentions: { users: [], roles: [roleId] },
            });
            await message.delete().catch(() => { });
        }
        catch (err) {
            console.error('[rolepost] resend error:', err instanceof Error ? err.message : err);
        }
    }
    private async startImmigrationSession(message: Message): Promise<unknown> {
        const session = this.sessions.startSession(message.channel.id, message.author.id);
        session.logs.push(`[${nowJST()}] セッション開始`);
        const introEmbed = new EmbedBuilder()
            .setTitle('自動入国審査システムです。')
            .setDescription('こちらのチケットでは、旅行、取引、労働等を行うために一時的に入国を希望される方に対し、許可証を自動で発行しております。\n' +
            '審査は24時間365日いつでも受けられ、最短数分で許可証が発行されます。\n' +
            '以下の留意事項をよくお読みの上、次に進む場合は「進む」、申請を希望しない場合は「終了」をクリックしてください。')
            .addFields({
            name: '【留意事項】',
            value: '・入国が承認されている期間中、申告内容に誤りがあることが判明したり、[コムザール連邦共和国の明示する法令](https://comzer-gov.net/laws/) に違反した場合は承認が取り消されることがあります。\n' +
                '・法令の不知は理由に抗弁できません。\n' +
                '・損害を与えた場合、行政省庁は相当の対応を行う可能性があります。\n' +
                '・入国情報は適切な範囲で国民に共有されます。',
        });
        const introRow = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`start-${session.id}`).setLabel('進む').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`cancel-${session.id}`).setLabel('終了').setStyle(ButtonStyle.Danger));
        return message.reply({ embeds: [introEmbed], components: [introRow] });
    }
}
