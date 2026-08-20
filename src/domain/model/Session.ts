import type { CompanionEntry, ParsedApplication } from './ParsedApplication.js';
export interface SessionData {
    version?: string;
    mcid?: string;
    nation?: string;
    period?: string;
    companions?: string[];
    joiner?: string | null;
    applicantDiscordId?: string;
    parsed?: ParsedApplication;
    joinerDiscordIds?: string[];
    joinerResponses?: Record<string, string>;
}
export type SessionStep = 'intro' | 'select_version' | 'modal_submitted' | 'waitingJoiner' | (string & {});
export type SessionEndStatus = '承認' | '却下' | 'キャンセル' | 'タイムアウト' | (string & {});
export interface Session {
    id: string;
    channelId: string;
    userId: string;
    step: SessionStep;
    data: SessionData;
    logs: string[];
    lastAction: number;
    status?: SessionEndStatus;
}
export type { CompanionEntry };
