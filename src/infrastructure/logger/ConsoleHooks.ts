import { filterAndFormat, shouldExclude, cleanText } from './LogFilters.js';
import type { DiscordWebhookLogSink } from './DiscordWebhookLogSink.js';
function errorToString(error: Error): string {
    return error.stack || error.message;
}
function objectToString(obj: object): string {
    try {
        return JSON.stringify(obj, null, 2);
    }
    catch {
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
export class ConsoleHooks {
    readonly originalLog: typeof console.log = console.log;
    readonly originalError: typeof console.error = console.error;
    constructor(private readonly sink: DiscordWebhookLogSink) { }
    private hookConsoleLog(): void {
        console.log = (...args: unknown[]): void => {
            this.originalLog(...args);
            const text = filterAndFormat(args);
            if (text) {
                this.sink.send(text);
            }
        };
    }
    private hookConsoleError(): void {
        console.error = (...args: unknown[]): void => {
            this.originalError(...args);
            const raw = args.map(argToString).join('\n');
            if (!shouldExclude(raw)) {
                const cleaned = cleanText(raw);
                if (cleaned) {
                    this.sink.send(cleaned);
                }
            }
        };
    }
    initialize(): void {
        this.hookConsoleLog();
        this.hookConsoleError();
    }
}
