import { sendToWebhook } from './webhook.js';
import { filterAndFormat, shouldExclude, cleanText } from './filters.js';

// 元の console.log / console.error を保存
export const originalLog: typeof console.log = console.log;
export const originalError: typeof console.error = console.error;

// 文字列に変換
function errorToString(error: Error): string {
  return error.stack || error.message;
}

function objectToString(obj: object): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function argToString(arg: unknown): string {
  if (arg instanceof Error) {
    return errorToString(arg);
  }
  if (typeof arg === 'object' && arg !== null) {
    return objectToString(arg);
  }
  return String(arg);
}

// フック
export function hookConsoleLog(): void {
  console.log = (...args: unknown[]): void => {
    originalLog(...args);

    // フィルタリングして送信
    const text = filterAndFormat(args);
    if (text) {
      sendToWebhook(text);
    }
  };
}

export function hookConsoleError(): void {
  console.error = (...args: unknown[]): void => {
    originalError(...args);
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

export function initializeHooks(): void {
  hookConsoleLog();
  hookConsoleError();
}
