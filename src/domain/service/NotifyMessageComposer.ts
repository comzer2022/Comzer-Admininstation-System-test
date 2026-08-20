export interface NotifyRequestBody {
    discord_id?: string;
    discordId?: string;
    discord?: string;
    request_id?: string;
    requestId?: string;
    request_name?: string;
    requestName?: string;
    created_at?: string;
    createdAt?: string;
    department?: string;
    dept?: string;
    decision_event?: string;
    decisionEvent?: string;
    decision_datetime?: string;
    decisionDatetime?: string;
    decision_event_datetime?: string;
    notice?: string;
    memo?: string;
    request_content?: string;
    requestContent?: string;
    payload?: string;
    [key: string]: unknown;
}
const TYPE_MAP: Record<string, string> = {
    registry_update: '国民登記情報修正申請',
    business_filing: '開業・廃業届',
    staff_appointment: '職員登用申請',
    donation_report: '寄付申告',
    party_membership: '入党・離党届',
    party_create_dissolve: '結党・解党届',
    citizen_recommend: '新規国民推薦届',
    citizen_denunciation: '脱退申告',
    anonymous_report: '匿名通報',
};
export interface NormalizedNotifyRequest {
    discordId: string;
    requestId: string | number;
}
export function extractIdentifiers(data: NotifyRequestBody): NormalizedNotifyRequest {
    const discordIdRaw = data.discord_id ?? data.discordId ?? data.discord ?? '';
    const discordId = String(discordIdRaw).trim();
    const requestId = data.request_id ?? data.requestId ?? '—';
    return { discordId, requestId };
}
export function composeNotifyMessage(data: NotifyRequestBody, requestId: string | number): string {
    const rawRequestName = String(data.request_name ?? data.requestName ?? '').trim();
    const translatedType = TYPE_MAP[rawRequestName] || rawRequestName || '—';
    const createdAt = data.created_at ?? data.createdAt ?? '—';
    const department = data.department ?? data.dept ?? '—';
    const decisionEvent = data.decision_event ?? data.decisionEvent ?? '—';
    const decisionDatetime = data.decision_datetime ?? data.decisionDatetime ?? data.decision_event_datetime ?? '—';
    const notice = (data.notice ?? data.memo ?? '').toString().trim() || 'なし';
    const payloadContent = (data.request_content ?? data.requestContent ?? data.payload ?? '').toString().trim() || 'なし';
    return [
        '【重要】',
        '件名 : 審査結果通知のお知らせ',
        '申請先機関から通知結果が届いています。',
        '',
        '======================================',
        `さきに申請のあった${translatedType}（到達番号：${requestId}、作成日時：${createdAt}）について、以下のとおり${decisionEvent}されました。`,
        '',
        '《申請内容》',
        `申請種類：${translatedType}`,
        `申請到達日時：${createdAt}`,
        `申請内容：${payloadContent}`,
        '',
        '《決裁情報》',
        `決裁部門：${department}`,
        `決裁日時：${decisionDatetime}`,
        '担当者：（非開示）',
        `備考：${notice}`,
        '',
        '-# 📢 このメッセージは、仮想国家コミュニティ《コムザール連邦共和国》が管理運営するコムザール行政システムによる自動通知です。',
    ].join('\n');
}
