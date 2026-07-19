import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_ID = process.env.GOOGLE_SHEET_ID as string;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY as string;
const TAB_NAME = process.env.BLACKLIST_TAB_NAME || 'blacklist(CAS連携)';

/** ブラックリストシートの行データ（列名ベース） */
export interface BlacklistRow {
  'Type(Country/Player)': 'Country' | 'Player';
  status: 'Active' | 'invalid';
  value: string;
  reason: string;
  date: string;
}

export type BlacklistEntryType = 'Country' | 'Player';

export interface AddResult {
  result: 'duplicate' | 'reactivated' | 'added';
}

export interface RemoveResult {
  result: 'notfound' | 'invalidated';
}

let sheet: GoogleSpreadsheetWorksheet | null = null;
let initPromise: Promise<void> | null = null;

export async function initBlacklist(): Promise<void> {
  // 既に初期化済みなら返す
  if (sheet) return;
  // 初期化中なら同じ Promise を待つ（二重初期化防止）
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const auth = new JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();
    const found = doc.sheetsByTitle[TAB_NAME];
    if (!found) throw new Error(`Tab '${TAB_NAME}' not found`);
    sheet = found;
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

async function ensureSheet(): Promise<GoogleSpreadsheetWorksheet> {
  if (!sheet) await initBlacklist();
  if (!sheet) throw new Error('Blacklist sheet is not initialized');
  return sheet;
}

export async function addBlacklistEntry(
  type: BlacklistEntryType,
  value: string,
  reason = ''
): Promise<AddResult> {
  const activeSheet = await ensureSheet();
  const rows = await activeSheet.getRows<BlacklistRow>();
  const today = new Date().toISOString().split('T')[0]!;

  const already = rows.find(
    (r) =>
      r.get('Type(Country/Player)') === type &&
      r.get('value') === value &&
      r.get('status') === 'Active'
  );
  if (already) return { result: 'duplicate' };

  const invalidRow = rows.find(
    (r) =>
      r.get('Type(Country/Player)') === type &&
      r.get('value') === value &&
      r.get('status') === 'invalid'
  );
  if (invalidRow) {
    invalidRow.set('status', 'Active');
    invalidRow.set('reason', reason);
    invalidRow.set('date', today);
    await invalidRow.save();
    return { result: 'reactivated' };
  }

  await activeSheet.addRow({
    'Type(Country/Player)': type,
    status: 'Active',
    value,
    reason,
    date: today,
  });
  return { result: 'added' };
}

export async function removeBlacklistEntry(
  type: BlacklistEntryType,
  value: string
): Promise<RemoveResult> {
  const activeSheet = await ensureSheet();
  const rows = await activeSheet.getRows<BlacklistRow>();
  const row = rows.find(
    (r) =>
      r.get('Type(Country/Player)') === type &&
      r.get('value') === value &&
      r.get('status') === 'Active'
  );
  if (!row) return { result: 'notfound' };

  row.set('status', 'invalid');
  row.set('date', new Date().toISOString().split('T')[0]!);
  await row.save();
  return { result: 'invalidated' };
}

export async function getActiveBlacklist(
  type: BlacklistEntryType
): Promise<GoogleSpreadsheetRow<BlacklistRow>[]> {
  const activeSheet = await ensureSheet();
  const rows = await activeSheet.getRows<BlacklistRow>();
  return rows.filter(
    (r) => r.get('Type(Country/Player)') === type && r.get('status') === 'Active'
  );
}

export async function isBlacklistedPlayer(mcid: string | undefined): Promise<boolean> {
  if (!mcid) return false;
  const players = await getActiveBlacklist('Player');
  return players.some((r) => r.get('value') === mcid);
}

export async function isBlacklistedCountry(country: string | undefined): Promise<boolean> {
  if (!country) return false;
  const countries = await getActiveBlacklist('Country');
  return countries.some((r) => r.get('value') === country);
}
