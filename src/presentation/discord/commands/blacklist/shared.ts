import type { ChatInputCommandInteraction, InteractionReplyOptions } from 'discord.js';
const REFERENCE_GUILD_ID = '1188411576483590194';
export async function resolveUserRoleIds(interaction: ChatInputCommandInteraction): Promise<string[]> {
    if (interaction.guildId) {
        const member = interaction.member;
        return member && 'cache' in member.roles ? member.roles.cache.map((r) => String(r.id)) : [];
    }
    const guild = await interaction.client.guilds.fetch(REFERENCE_GUILD_ID);
    const member = await guild.members.fetch(interaction.user.id);
    return member.roles.cache.map((r) => String(r.id));
}
export function unauthorizedReply(): InteractionReplyOptions {
    return {
        content: '君はステージが低い。君のコマンドを受け付けると君のカルマが私の中に入って来て私が苦しくなる。(権限エラー)',
        ephemeral: true,
    };
}
