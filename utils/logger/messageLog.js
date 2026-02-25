/**
 * @param {import('discord.js').Message}
 * @param {string|undefined}
 * @param {import('discord.js').Client}
 */
export function messagelog(message, ticketCat, client) {
  const channel     = message.channel;
  const channelId   = message.channelId   ?? 'unknown';
  const channelName = channel?.name        ?? 'unknown';
  const parentId    = channel?.parentId    ?? 'none';
  const authorId    = message.author?.id   ?? 'unknown';
  const mentionsBot = client?.user ? message.mentions.has(client.user) : false;
  const contentPreview = message.content?.slice(0, 80) ?? '';

  console.log(
    `[MSG] channelId:${channelId} channelName:${channelName} ` +
    `parentId:${parentId} authorId:${authorId} ` +
    `TICKET_CAT:${ticketCat ?? 'none'} mentions.has(bot):${mentionsBot} ` +
    `content:${contentPreview}`
  );
}
export function logDebugInfo(label, ...args) {
  const parts = args.map(a => {
    if (a == null)             return String(a);
    if (a instanceof Error)    return a.stack ?? a.message;
    if (typeof a === 'object') {
      try { return JSON.stringify(a, null, 2); } catch { return String(a); }
    }
    return String(a);
  });
  console.log(`[DEBUG] ${label} （型：${typeof args[0]}）`, ...parts);
}
