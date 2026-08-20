export const EXCLUDE_KEYWORDS: string[] = [
    'parentId:',
    'TICKET_CAT:',
    'mentions.has(',
    'content:',
    'authorId:',
    'channelId:',
    '（型：',
    'channelName:',
];
export function shouldExclude(text: string): boolean {
    return EXCLUDE_KEYWORDS.some((keyword) => text.includes(keyword));
}
export function cleanText(text: string): string {
    return text.trim();
}
export function filterAndFormat(args: unknown[]): string | null {
    const rawText = args.map(String).join(' ');
    if (shouldExclude(rawText)) {
        return null;
    }
    const cleaned = cleanText(rawText);
    return cleaned || null;
}
