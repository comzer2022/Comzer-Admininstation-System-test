export type CompanionEntry = string | { mcid: string };

export interface ParsedApplication {
  mcid?: string;
  nation?: string;
  purpose?: string;
  start_datetime?: string;
  end_datetime?: string;
  period?: string;
  companions?: CompanionEntry[];
  joiners?: string[];
  joinerDiscordIds?: string[];
  [key: string]: unknown;
}

export interface InspectionResult {
  approved: boolean;
  content: string | ParsedApplication;
  parsed?: ParsedApplication;
}

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

export type SessionStep =
  | 'intro'
  | 'select_version'
  | 'modal_submitted'
  | 'waitingJoiner'
  | (string & {});

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
