import { sendToWebhook } from './webhook.js';
import { filterAndFormat, shouldExclude, cleanText } from './filters.js';

// 元の console.log / console.error を保存
export const originalLog = console.log;
export const originalError = console.error;

/**
 * エラーオブジェクトを文字列に変換
 * @param {Error} error - エラーオブジェクト
 * @returns {string} 変換された文字列
 */
function errorToString(error) {
  return error.stack || error.message;
}

/**
 * オブジェクトを文字列に変換
 * @param {*} obj - 変換するオブジェクト
 * @returns {string} 変換された文字列
 */
function objectToString(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

/**
 * 引数を文字列に変換
 * @param {*} arg - 変換する引数
 * @returns {string} 変換された文字列
 */
function argToString(arg) {
  if (arg instanceof Error) {
    return errorToString(arg);
  }
  if (typeof arg === 'object' && arg !== null) {
    return objectToString(arg);
  }
  return String(arg);
}

/**
 * console.log をフック
 */
export function hookConsoleLog() {
  console.log = (...args) => {
    // 元の console.log を実行
    originalLog(...args);

    // フィルタリングして Webhook に送信
    const text = filterAndFormat(args);
    if (text) {
      sendToWebhook(text);
    }
  };
}

/**
 * console.error をフック
 */
export function hookConsoleError() {
  console.error = (...args) => {
    // 元の console.error を実行
    originalError(...args);

    // 引数を文字列に変換
    const raw = args.map(argToString).join('\n');

    // フィルタリングして送信
    if (!shouldExclude(raw)) {
      const cleaned = cleanText(raw);
      if (cleaned) {
        sendToWebhook(cleaned);
      }
    }
  };
}

/**
 * すべてのコンソールフックを初期化
 */
export function initializeHooks() {
  hookConsoleLog();
  hookConsoleError();
}
