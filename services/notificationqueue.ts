import type { Express, Request, Response } from 'express';
import type { Client } from 'discord.js';

interface QueueItem {
  discord_id: string;
  message: string;
  requestId: string;
}

interface StatusReport {
  requestId: string;
  discordId: string;
  success: boolean;
  detail: string;
  errorCode: string | number | null;
}

/** Discord APIエラーの最小限の形（discord.js DiscordAPIErrorを想定） */
interface DiscordApiErrorLike {
  code?: string | number;
  message: string;
}

function isDiscordApiErrorLike(err: unknown): err is DiscordApiErrorLike {
  return typeof err === 'object' && err !== null && 'message' in err;
}

const queue: QueueItem[] = [];
let processing = false;

async function processQueue(client: Client): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;

    const statusReport: StatusReport = {
      requestId: item.requestId,
      discordId: item.discord_id,
      success: false,
      detail: '不明なエラー',
      errorCode: null,
    };

    try {
      const user = await client.users.fetch(item.discord_id);
      await user.send(item.message);

      statusReport.success = true;
      statusReport.detail = '送信成功';
      console.log(`[SUCCESS] Request:${item.requestId} -> ${user.tag}`);
    } catch (err: unknown) {
      const code = isDiscordApiErrorLike(err) ? (err.code ?? null) : null;
      statusReport.errorCode = code;

      if (code === 50007) {
        const hasCommonGuild = client.guilds.cache.some((g) =>
          g.members.cache.has(item.discord_id)
        );
        statusReport.detail = hasCommonGuild
          ? '失敗(50007): ユーザーがDMを閉じているか、Botがブロックされています。'
          : '失敗(50007): 共通サーバーにユーザーがいないため送信できません。';
      } else if (code === 10013) {
        statusReport.detail = '失敗(10013): ユーザーIDが正しくないか、存在しません。';
      } else if (code === 50001) {
        statusReport.detail = '失敗(50001): Botにメッセージ送信権限がありません。';
      } else {
        const message = isDiscordApiErrorLike(err) ? err.message : String(err);
        statusReport.detail = `失敗: ${message}`;
      }

      console.error(
        `[FAILURE REPORT] RequestID: ${statusReport.requestId} | TargetID: ${statusReport.discordId} | Reason: ${statusReport.detail}`,
        err
      );
    }

    await new Promise((res) => setTimeout(res, 1500));
  }

  processing = false;
}

/** /api/notify エンドポイントで受け取る想定のペイロード（外部システム由来のため緩やかな型） */
interface NotifyRequestBody {
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

export function setupNotificationAPI(app: Express, client: Client): void {
  app.post('/api/notify', (req: Request<unknown, unknown, NotifyRequestBody>, res: Response) => {
    console.log('--- APIリクエスト受信 ---');

    // APIキー検証
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.CASBOT_API_SECRET) {
      console.error('APIキー認証失敗:', apiKey);
      return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
    }

    const data: NotifyRequestBody = req.body || {};

    try {
      console.log('通知受信:', JSON.stringify(data).slice(0, 1000));
    } catch {
      console.log('通知受信: (non-serializable)');
    }

    const discordIdRaw = data.discord_id ?? data.discordId ?? data.discord ?? '';
    const discordId = String(discordIdRaw).trim();
    const requestId = data.request_id ?? data.requestId ?? '—';

    if (!discordId) {
      console.error('notify: missing discord_id', data);
      return res.status(400).json({ error: 'discord_id missing' });
    }

    // メッセージ内容の翻訳・構築
    const typeMap: Record<string, string> = {
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

    const rawRequestName = String(data.request_name ?? data.requestName ?? '').trim();
    const translatedType = typeMap[rawRequestName] || rawRequestName || '—';
    const createdAt = data.created_at ?? data.createdAt ?? '—';
    const department = data.department ?? data.dept ?? '—';
    const decisionEvent = data.decision_event ?? data.decisionEvent ?? '—';
    const decisionDatetime =
      data.decision_datetime ?? data.decisionDatetime ?? data.decision_event_datetime ?? '—';
    const notice = (data.notice ?? data.memo ?? '').toString().trim() || 'なし';
    const payloadContent =
      (data.request_content ?? data.requestContent ?? data.payload ?? '').toString().trim() ||
      'なし';

    const message = [
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

    queue.push({
      discord_id: discordId,
      message: message,
      requestId: requestId,
    });

    console.log(`notify: queued message for ${discordId} (request ${requestId})`);

    processQueue(client);

    return res.json({
      status: 'queued',
      requestId: requestId,
    });
  });
}
