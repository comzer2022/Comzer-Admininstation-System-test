// 除外キーワード
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

export function shouldExclude(text) {
  return EXCLUDE_KEYWORDS.some(keyword => text.includes(keyword));
}

// テキストをクリーンアップ（前後の空白を削除）
export function cleanText(text) {
  return text.trim();
}

// 引数の配列をフィルタリングして送信可能なテキストに変換
export function filterAndFormat(args) {
  const rawText = args.map(String).join(' ');

  if (shouldExclude(rawText)) {
    return null;
  }

  const cleaned = cleanText(rawText);
  return cleaned || null;
}
