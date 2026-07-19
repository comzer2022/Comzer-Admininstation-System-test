/**
 * アプリケーション全体で共有されるドメイン型定義。
 * セッション管理・入国審査(GPT整形結果)・Discordインタラクション処理で使用する。
 */

/** 同行者エントリー（文字列 or {mcid} オブジェクトの両方があり得る） */
export type CompanionEntry = string | { mcid: string };

/**
 * GPTによって抽出・整形された申請内容。
 * GPTの出力は動的なため、既知フィールド以外も許容するインデックスシグネチャを付与。
 */
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

/** 審査結果 */
export interface InspectionResult {
  approved: boolean;
  content: string | ParsedApplication;
  parsed?: ParsedApplication;
}

/** セッション中に蓄積される申請フォームデータ */
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

/** セッションの進行ステップ */
export type SessionStep =
  | 'intro'
  | 'select_version'
  | 'modal_submitted'
  | 'waitingJoiner'
  | (string & {});

/** セッションのライフサイクル終了ステータス */
export type SessionEndStatus = '承認' | '却下' | 'キャンセル' | 'タイムアウト' | (string & {});

/** 進行中の一時入国審査セッション */
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
