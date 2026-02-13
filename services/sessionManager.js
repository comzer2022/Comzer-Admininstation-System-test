// services/sessionManager.js
import { nowJST } from '../utils/helpers.js';

const sessions = new Map();
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

export function startSession(channelId, userId) {
  const id = `${channelId}-${userId}-${Date.now()}`;
  sessions.set(id, {
    id,
    channelId,
    userId,
    step: 'intro',
    data: {},
    logs: [],
    lastAction: Date.now()
  });
  return sessions.get(id);
}

export async function endSession(id, status, bot) {
  const session = sessions.get(id);
  if (!session) return;

  session.status = status;
  session.logs.push(`[${nowJST()}] セッション終了: ${status}`);

  const text = session.logs.join("\n");
  const buffer = Buffer.from(text, 'utf8');
  const channelName = bot.channels.cache.get(session.channelId)?.name || session.channelId;
  const fileName = `${channelName}-一時入国審査.txt`;

  const logChannel = bot.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel?.isTextBased()) {
    try {
      await logChannel.send({
        content: `セッション ${session.id} が ${status} しました。詳細ログを添付します。`,
        files: [{ attachment: buffer, name: fileName }],
      });
    } catch (err) {
      console.error('ログ送信エラー:', err);
    }
  }

  sessions.delete(id);
}

export function getSession(id) {
  return sessions.get(id);
}

export function getAllSessions() {
  return sessions;
}

export function updateSessionLastAction(id) {
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
