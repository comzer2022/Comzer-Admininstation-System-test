import { EmbedBuilder } from 'discord.js';
import type { RoleConfigEntry, RoleConfigMap } from '../../infrastructure/config/RoleConfig.js';
export class RolePostService {
    private readonly activeChannels = new Map<string, Map<string, string>>();
    private ensureChannelMap(channelId: string): Map<string, string> {
        if (!this.activeChannels.has(channelId)) {
            this.activeChannels.set(channelId, new Map());
        }
        return this.activeChannels.get(channelId)!;
    }
    isActive(channelId: string, userId: string): boolean {
        const chMap = this.activeChannels.get(channelId);
        return chMap ? chMap.has(userId) : false;
    }
    getRoleId(channelId: string, userId: string): string | null {
        const chMap = this.activeChannels.get(channelId);
        return chMap ? (chMap.get(userId) ?? null) : null;
    }
    setActive(channelId: string, userId: string, roleId: string): void {
        this.ensureChannelMap(channelId).set(userId, roleId);
    }
    setInactive(channelId: string, userId: string): void {
        const chMap = this.activeChannels.get(channelId);
        if (chMap)
            chMap.delete(userId);
    }
    makeEmbed(content: string, roleId: string, roleConfig: RoleConfigMap, attachmentURL: string | null = null): EmbedBuilder {
        const cfg = roleConfig[roleId];
        if (!cfg) {
            return new EmbedBuilder().setDescription(content).setFooter({ text: `ROLE_ID:${roleId} (未定義)` });
        }
        const embed = new EmbedBuilder()
            .setAuthor({ name: cfg.embedName, iconURL: cfg.embedIcon })
            .setDescription(content)
            .setColor((cfg as RoleConfigEntry & {
            embedColor?: number;
        }).embedColor ?? 0x3498db);
        if (attachmentURL)
            embed.setImage(attachmentURL);
        return embed;
    }
}
