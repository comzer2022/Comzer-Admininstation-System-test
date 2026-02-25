/**
 * 除外キーワード
 * これらを含むログは Discord Webhook に送信されない
 */
export const EXCLUDE_KEYWORDS = [
  'parentId:',
  'TICKET_CAT:',
  'mentions.has(',
  'content:',
  'authorId:',
  'channelId:',
  '（型：',
  'channelName:',
];

/**
 * テキストが除外キーワードを含むかチェック
 * @param {string} チェックするテキスト
 * @returns {boolean} 除外すべきならtrue
 */
export function shouldExclude(text) {
  return EXCLUDE_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * テキストをクリーンアップ（前後の空白を削除）
 * @param {string} text - クリーンアップするテキスト
 * @returns {string} クリーンアップされたテキスト
 */
export function cleanText(text) {
  return text.trim();
}

/**
 * 引数の配列をフィルタリングして送信可能なテキストに変換
 * @param {Array} console.log/error の引数
 * @returns {string|null} 送信可能なテキスト、または除外すべき場合はnull
 */
export function filterAndFormat(args) {
  const rawText = args.map(String).join(' ');

  if (shouldExclude(rawText)) {
    return null;
  }

  const cleaned = cleanText(rawText);
  return cleaned || null;
}
