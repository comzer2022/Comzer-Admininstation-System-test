import type { Client } from 'discord.js';
import { nowJST } from '../../infrastructure/logger/nowJST.js';
import type { Session, SessionEndStatus } from '../../domain/model/Session.js';
import type { BotConfig } from '../../infrastructure/config/BotConfig.js';
const TIMEOUT_MS = 10 * 60 * 1000;
const WATCH_INTERVAL_MS = 60 * 1000;
export class SessionLifecycleService {
    private readonly sessions = new Map<string, Session>();
    private botClient: Client | null = null;
    private watchTimer: ReturnType<typeof setInterval> | null = null;
    constructor(private readonly config: BotConfig) { }
    setBotClient(client: Client): void {
        this.botClient = client;
    }
    startSession(channelId: string, userId: string): Session {
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
        this.sessions.set(id, session);
        return session;
    }
    async endSession(id: string, status: SessionEndStatus, bot?: Client | null): Promise<void> {
        const session = this.sessions.get(id);
        if (!session)
            return;
        const client = bot ?? this.botClient;
        session.status = status;
        session.logs.push(`[${nowJST()}] セッション終了: ${status}`);
        const text = session.logs.join('\n');
        const buffer = Buffer.from(text, 'utf8');
        const targetChannel = client?.channels.cache.get(session.channelId);
        const channelName = (targetChannel && 'name' in targetChannel ? targetChannel.name : null) || session.channelId;
        const fileName = `${channelName}-一時入国審査.txt`;
        if (client) {
            const logChannel = client.channels.cache.get(this.config.logChannelId);
            if (logChannel?.isTextBased() && 'send' in logChannel) {
                try {
                    await logChannel.send({
                        content: `セッション ${session.id} が ${status} しました。詳細ログを添付します。`,
                        files: [{ attachment: buffer, name: fileName }],
                    });
                }
                catch (err) {
                    console.error('ログ送信エラー:', err);
                }
            }
        }
        else {
            console.warn('[endSession] bot client が未設定のため、ログ送信をスキップしました');
        }
        this.sessions.delete(id);
    }
    getSession(id: string): Session | undefined {
        return this.sessions.get(id);
    }
    getAllSessions(): Map<string, Session> {
        return this.sessions;
    }
    updateSessionLastAction(id: string): void {
        const session = this.sessions.get(id);
        if (session) {
            session.lastAction = Date.now();
        }
    }
    startTimeoutWatcher(): void {
        if (this.watchTimer)
            return;
        this.watchTimer = setInterval(() => {
            const now = Date.now();
            for (const session of this.sessions.values()) {
                if (session.step === 'waitingJoiner')
                    continue;
                if (now - session.lastAction > TIMEOUT_MS) {
                    session.logs.push(`[${nowJST()}] タイムアウト`);
                    this.endSession(session.id, 'タイムアウト').catch(console.error);
                }
            }
        }, WATCH_INTERVAL_MS);
    }
}
