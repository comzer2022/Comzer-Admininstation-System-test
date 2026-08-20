import type { Client, GuildMember } from 'discord.js';
import { CzrBridgeClient, UpsertMemberResponse } from '../../infrastructure/czrBridge/CzrBridgeClient.js';
import { inferGroupFromRoles } from '../../domain/service/RoleGroupClassifier.js';
import type { BotConfig } from '../../infrastructure/config/BotConfig.js';
const MIN_SYNCED_THRESHOLD = 10;
export class MemberSyncService {
    constructor(private readonly czrBridge: CzrBridgeClient, private readonly config: BotConfig) { }
    async syncMember(m: GuildMember): Promise<UpsertMemberResponse | null> {
        const user = m.user ?? (await m.fetch().then((fm) => fm.user));
        if (!user?.username) {
            console.warn('skip: username missing', m.id);
            return null;
        }
        const roles = [...m.roles.cache.keys()];
        const payload = {
            guild_id: this.config.referenceGuildId,
            discord_id: m.id,
            discord_name: user.username,
            display_name: m.displayName ?? user.username,
            group: inferGroupFromRoles(roles),
            roles,
        };
        const res = await this.czrBridge.upsertMember(payload);
        console.log(m.id, user.username, res.status);
        return res;
    }
    async fullSync(client: Client, throttleMs = 1000): Promise<void> {
        const g = await client.guilds.fetch(this.config.referenceGuildId);
        const members = await g.members.fetch();
        const syncedIds = new Set<string>();
        for (const m of members.values()) {
            if (m.user?.bot)
                continue;
            try {
                const res = await this.syncMember(m);
                if (res !== null) {
                    syncedIds.add(m.id);
                }
            }
            catch (e) {
                console.error(m.id, 'failed:', e instanceof Error ? e.message : e);
            }
            const jitter = Math.floor(Math.random() * 250);
            await new Promise((r) => setTimeout(r, throttleMs + jitter));
        }
        console.log(`Synced: ${syncedIds.size} members.`);
        await this.purgeAbsentMembers(syncedIds);
        console.log('[fullSync] Completed.');
    }
    private async purgeAbsentMembers(syncedIds: Set<string>): Promise<void> {
        if (syncedIds.size < MIN_SYNCED_THRESHOLD) {
            console.warn(`Skipped: synced count (${syncedIds.size}) is below threshold (${MIN_SYNCED_THRESHOLD}).`);
            return;
        }
        let result;
        try {
            result = await this.czrBridge.deleteAbsentMembers({
                guild_id: this.config.referenceGuildId,
                discord_ids: [...syncedIds],
            });
        }
        catch (e) {
            console.error('Failed:', e instanceof Error ? e.message : e);
            return;
        }
        const { deleted_count = 0, deleted_ids = [] } = result;
        console.log(`Deleted ${deleted_count} absent member(s).`);
        for (const id of deleted_ids) {
            console.log('removed', id);
        }
    }
}
