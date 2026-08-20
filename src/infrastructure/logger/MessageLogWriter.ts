import type { Message, Client } from 'discord.js';
export function messagelog(message: Message, ticketCat: string | undefined, client: Client): void {
    const channel = message.channel;
    const channelId = message.channelId ?? 'unknown';
    const channelName = ('name' in channel ? channel.name : null) ?? 'unknown';
    const parentId = ('parentId' in channel ? channel.parentId : null) ?? 'none';
    const authorId = message.author?.id ?? 'unknown';
    const mentionsBot = client?.user ? message.mentions.has(client.user) : false;
    const contentPreview = message.content?.slice(0, 80) ?? '';
    const createdAt = message.createdAt
        ? message.createdAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
        : 'unknown';
    console.log(`parentId: ${parentId} （型： ${typeof parentId} ）\n` +
        `TICKET_CAT: ${ticketCat ?? 'none'} （型： ${typeof ticketCat} ）\n` +
        `mentions.has(bot.user): ${mentionsBot}\n` +
        `authorId: ${authorId}\n` +
        `channelId: ${channelId} channelName: ${channelName}\n` +
        `createdAt: ${createdAt}\n` +
        `parentId: ${parentId} （型： ${typeof parentId} ）\n` +
        `content：${contentPreview}`);
}
export function logDebugInfo(label: string, ...args: unknown[]): void {
    const parts = args.map((a) => {
        if (a == null)
            return String(a);
        if (a instanceof Error)
            return a.stack ?? a.message;
        if (typeof a === 'object') {
            try {
                return JSON.stringify(a, null, 2);
            }
            catch {
                return String(a);
            }
        }
        return String(a);
    });
    console.log(`[DEBUG] ${label} （型：${typeof args[0]}）`, ...parts);
}
