// utils/logger/index.js
// ロガーシステム - メインエクスポート

import { isWebhookEnabled } from './webhook.js';
import { initializeHooks, originalLog, originalError } from './hooks.js';
import { messagelog, logDebugInfo } from './messageLog.js';

// コンソールフックを初期化
initializeHooks();

// 初期化メッセージ
if (isWebhookEnabled()) {
  originalLog('✅ Discord Webhook ロギングが有効化されました');
} else {
  originalLog('⚠️ Discord Webhook URL が設定されていません（ロギング無効）');
}

// エクスポート
export { messagelog, logDebugInfo, originalLog, originalError };

export const logger = {
  messagelog,
  logDebugInfo,
  originalLog,
  originalError,
};

export default logger;
