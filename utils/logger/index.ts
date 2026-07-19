import type { Message, Client } from 'discord.js';
import { isWebhookEnabled } from './webhook.js';
import { initializeHooks, originalLog, originalError } from './hooks.js';
import { messagelog, logDebugInfo } from './messageLog.js';

// コンソールフックを初期化
initializeHooks();
if (isWebhookEnabled()) {
  originalLog('✅ Discord Webhook ロギングが有効化されました');
} else {
  originalLog('⚠️ Discord Webhook URL が設定されていません（ロギング無効）');
}

export interface Logger {
  messagelog: (message: Message, ticketCat: string | undefined, client: Client) => void;
  logDebugInfo: (label: string, ...args: unknown[]) => void;
  originalLog: typeof console.log;
  originalError: typeof console.error;
}

// エクスポート
export { messagelog, logDebugInfo, originalLog, originalError };

export const logger: Logger = {
  messagelog,
  logDebugInfo,
  originalLog,
  originalError,
};

export default logger;
