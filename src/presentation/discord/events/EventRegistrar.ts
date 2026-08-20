import { ActivityType, Client, GuildMember, PartialGuildMember } from 'discord.js';
import type { InteractionRouter } from '../interactions/InteractionRouter.js';
import type { MessageTriggerHandler } from '../interactions/MessageTriggerHandler.js';
import type { MemberSyncService } from '../../../application/citizenSync/MemberSyncService.js';
import type { SessionLifecycleService } from '../../../application/session/SessionLifecycleService.js';
import type { SelfCheckService } from '../../../application/ops/SelfCheckService.js';
import type { BotConfig } from '../../../infrastructure/config/BotConfig.js';
const STATUS_UPDATE_INTERVAL_MS = 30 * 60 * 1000;
export class EventRegistrar {
    constructor(private readonly interactionRouter: InteractionRouter, private readonly messageTrigger: MessageTriggerHandler, private readonly memberSync: MemberSyncService, private readonly sessions: SessionLifecycleService, private readonly selfCheck: SelfCheckService, private readonly config: BotConfig) { }
    register(client: Client): void {
        client.once('ready', async (readyClient) => {
            console.log(`Logged in as ${readyClient.user.tag}`);
            this.sessions.setBotClient(readyClient);
            try {
                await this.memberSync.fullSync(readyClient, this.config.czrThrottleMs);
            }
            catch (e) {
                console.error('[fullSync] 初回同期失敗:', e);
            }
            setInterval(() => {
                this.memberSync.fullSync(readyClient).catch((err) => console.error('[fullSync] 定期同期失敗:', err));
            }, this.config.czrSyncIntervalMs);
            this.updateBotStatus(readyClient);
            setInterval(() => {
                this.updateBotStatus(readyClient);
                this.selfCheck.touchLastCheckTime();
            }, STATUS_UPDATE_INTERVAL_MS);
        });
        client.on('interactionCreate', async (interaction) => {
            await this.interactionRouter.handle(interaction);
        });
        client.on('messageCreate', async (message) => {
            await this.messageTrigger.handle(message, client);
        });
        client.on('guildMemberAdd', (member: GuildMember) => {
            this.memberSync.syncMember(member).catch((e: Error) => console.error('[guildMemberAdd]', e.message));
        });
        client.on('guildMemberUpdate', (_oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
            this.memberSync.syncMember(newMember).catch((e: Error) => console.error('[guildMemberUpdate]', e.message));
        });
    }
    private updateBotStatus(client: Client<true>): void {
        const jstTime = new Date().toLocaleString('ja-JP', { hour12: false });
        client.user.setActivity(`コムザール行政システム稼働中 | 最新自己診断時刻:${jstTime}`, {
            type: ActivityType.Watching,
        });
    }
}
