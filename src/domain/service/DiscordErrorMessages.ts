export interface DiscordApiErrorLike {
    code?: string | number;
    message: string;
}
export function isDiscordApiErrorLike(err: unknown): err is DiscordApiErrorLike {
    return typeof err === 'object' && err !== null && 'message' in err;
}
export function describeDmSendError(err: unknown, hasCommonGuild: boolean): {
    detail: string;
    errorCode: string | number | null;
} {
    const code = isDiscordApiErrorLike(err) ? (err.code ?? null) : null;
    if (code === 50007) {
        return {
            errorCode: code,
            detail: hasCommonGuild
                ? '失敗(50007): ユーザーがDMを閉じているか、Botがブロックされています。'
                : '失敗(50007): 共通サーバーにユーザーがいないため送信できません。',
        };
    }
    if (code === 10013) {
        return { errorCode: code, detail: '失敗(10013): ユーザーIDが正しくないか、存在しません。' };
    }
    if (code === 50001) {
        return { errorCode: code, detail: '失敗(50001): Botにメッセージ送信権限がありません。' };
    }
    const message = isDiscordApiErrorLike(err) ? err.message : String(err);
    return { errorCode: code, detail: `失敗: ${message}` };
}
