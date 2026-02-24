/**
 * @param {import('discord.js').Message} message
 * @param {string|undefined} ticketCat - TICKET_CAT 環境変数の値
 * @param {import('discord.js').Client} client
 */
export function messagelog(message, ticketCat, client) {
  const channel     = message.channel;
  const channelId   = message.channelId   ?? 'unknown';
  const channelName = channel?.name        ?? 'unknown';
  const parentId    = channel?.parentId    ?? 'none';
  const authorId    = message.author?.id   ?? 'unknown';

  // mentions.has() の結果を含めることで EXCLUDE_KEYWORDS に引っかかりローカルのみに残る
  const mentionsBot = client?.user ? message.mentions.has(client.user) : false;

  // content: を含む出力 → Webhook 除外キーワードに該当しローカルログのみに残る
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

  // （型： を含めることで EXCLUDE_KEYWORDS に引っかかりローカルログのみに残る）
  console.log(`[DEBUG] ${label} （型：${typeof args[0]}）`, ...parts);
}
