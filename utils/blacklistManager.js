import { GoogleSpreadsheet } from 'google-spreadsheet';

const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY         = process.env.GOOGLE_PRIVATE_KEY;
const TAB_NAME            = process.env.BLACKLIST_TAB_NAME || "blacklist(CAS連携)";

let sheet = null;
let initPromise = null;

export async function initBlacklist() {
  // 既に初期化済みなら返す
  if (sheet) return;
  // 初期化中なら同じ Promise を待つ（二重初期化防止）
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
    await doc.loadInfo();
    sheet = doc.sheetsByTitle[TAB_NAME];
    if (!sheet) throw new Error(`Tab '${TAB_NAME}' not found`);
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

async function ensureSheet() {
  if (!sheet) await initBlacklist();
}

export async function addBlacklistEntry(type, value, reason = "") {
  await ensureSheet();
  const rows = await sheet.getRows();
  const today = new Date().toISOString().split("T")[0];

  const already = rows.find(r =>
    r['Type(Country/Player)'] === type &&
    r.value === value &&
    r.status === "Active"
  );
  if (already) return { result: "duplicate" };

  const invalidRow = rows.find(r =>
    r['Type(Country/Player)'] === type &&
    r.value === value &&
    r.status === "invalid"
  );
  if (invalidRow) {
    invalidRow.status = "Active";
    invalidRow.reason = reason;
    invalidRow.date   = today;
    await invalidRow.save();
    return { result: "reactivated" };
  }

  await sheet.addRow({
    'Type(Country/Player)': type,
    status: "Active",
    value,
    reason,
    date: today,
  });
  return { result: "added" };
}

export async function removeBlacklistEntry(type, value) {
  await ensureSheet();
  const rows = await sheet.getRows();
  const row = rows.find(r =>
    r['Type(Country/Player)'] === type &&
    r.value === value &&
    r.status === "Active"
  );
  if (!row) return { result: "notfound" };

  row.status = "invalid";
  row.date   = new Date().toISOString().split("T")[0];
  await row.save();
  return { result: "invalidated" };
}

export async function getActiveBlacklist(type) {
  await ensureSheet();
  const rows = await sheet.getRows();
  return rows.filter(r =>
    r['Type(Country/Player)'] === type &&
    r.status === "Active"
  );
}

export async function isBlacklistedPlayer(mcid) {
  const players = await getActiveBlacklist("Player");
  return players.some(r => r.value === mcid);
}

export async function isBlacklistedCountry(country) {
  const countries = await getActiveBlacklist("Country");
  return countries.some(r => r.value === country);
}
