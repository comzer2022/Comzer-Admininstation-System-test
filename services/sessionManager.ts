import type { Client } from 'discord.js';
import { nowJST } from '../utils/helpers.js';
import type { Session, SessionEndStatus } from '../types/domain.js';

const sessions = new Map<string, Session>();
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID as string;

// bot (client) を保持するための参照
let _botClient: Client | null = null;

export function setBotClient(client: Client): void {
  _botClient = client;
}

export function startSession(channelId: string, userId: string): Session {
  const id = `${channelId}-${userId}-${Date.now()}`;
  const session: Session = {
    id,
    channelId,
    userId,
    step: 'intro',
    data: {},
    logs: [],
    lastAction: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

export async function endSession(
  id: string,
  status: SessionEndStatus,
  bot?: Client | null
): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;

  // bot 引数が省略された場合は保存済みの参照を使用
  const client = bot ?? _botClient;

  session.status = status;
  session.logs.push(`[${nowJST()}] セッション終了: ${status}`);

  const text = session.logs.join('\n');
  const buffer = Buffer.from(text, 'utf8');
  const targetChannel = client?.channels.cache.get(session.channelId);
  const channelName =
    (targetChannel && 'name' in targetChannel ? targetChannel.name : null) ||
    session.channelId;
  const fileName = `${channelName}-一時入国審査.txt`;

  if (client) {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel?.isTextBased() && 'send' in logChannel) {
      try {
        await logChannel.send({
          content: `セッション ${session.id} が ${status} しました。詳細ログを添付します。`,
          files: [{ attachment: buffer, name: fileName }],
        });
      } catch (err) {
        console.error('ログ送信エラー:', err);
      }
    }
  } else {
    console.warn('[endSession] bot client が未設定のため、ログ送信をスキップしました');
  }

  sessions.delete(id);
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getAllSessions(): Map<string, Session> {
  return sessions;
}

export function updateSessionLastAction(id: string): void {
  const session = sessions.get(id);
  if (session) {
    session.lastAction = Date.now();
  }
}

// タイムアウト監視
setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.step === 'waitingJoiner') continue;
    if (now - session.lastAction > 10 * 60 * 1000) {
      session.logs.push(`[${nowJST()}] タイムアウト`);
      endSession(session.id, 'タイムアウト').catch(console.error);
    }
  }
}, 60 * 1000);
