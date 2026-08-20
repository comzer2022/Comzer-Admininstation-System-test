import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import type { BotConfig } from '../config/BotConfig.js';
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
export class BlacklistRepository {
    private sheet: GoogleSpreadsheetWorksheet | null = null;
    private initPromise: Promise<void> | null = null;
    constructor(private readonly config: BotConfig) { }
    async init(): Promise<void> {
        if (this.sheet)
            return;
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = (async () => {
            const auth = new JWT({
                email: this.config.googleServiceAccountEmail,
                key: this.config.googlePrivateKey.replace(/\\n/g, '\n'),
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            const doc = new GoogleSpreadsheet(this.config.googleSheetId, auth);
            await doc.loadInfo();
            const found = doc.sheetsByTitle[this.config.blacklistTabName];
            if (!found)
                throw new Error(`Tab '${this.config.blacklistTabName}' not found`);
            this.sheet = found;
        })();
        try {
            await this.initPromise;
        }
        finally {
            this.initPromise = null;
        }
    }
    async healthCheck(): Promise<boolean> {
        const auth = new JWT({
            email: this.config.googleServiceAccountEmail,
            key: this.config.googlePrivateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(this.config.googleSheetId, auth);
        await doc.loadInfo();
        return !!doc.sheetsByTitle[this.config.blacklistTabName];
    }
    private async ensureSheet(): Promise<GoogleSpreadsheetWorksheet> {
        if (!this.sheet)
            await this.init();
        if (!this.sheet)
            throw new Error('Blacklist sheet is not initialized');
        return this.sheet;
    }
    async addEntry(type: BlacklistEntryType, value: string, reason = ''): Promise<AddResult> {
        const activeSheet = await this.ensureSheet();
        const rows = await activeSheet.getRows<BlacklistRow>();
        const today = new Date().toISOString().split('T')[0]!;
        const already = rows.find((r) => r.get('Type(Country/Player)') === type && r.get('value') === value && r.get('status') === 'Active');
        if (already)
            return { result: 'duplicate' };
        const invalidRow = rows.find((r) => r.get('Type(Country/Player)') === type && r.get('value') === value && r.get('status') === 'invalid');
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
    async removeEntry(type: BlacklistEntryType, value: string): Promise<RemoveResult> {
        const activeSheet = await this.ensureSheet();
        const rows = await activeSheet.getRows<BlacklistRow>();
        const row = rows.find((r) => r.get('Type(Country/Player)') === type && r.get('value') === value && r.get('status') === 'Active');
        if (!row)
            return { result: 'notfound' };
        row.set('status', 'invalid');
        row.set('date', new Date().toISOString().split('T')[0]!);
        await row.save();
        return { result: 'invalidated' };
    }
    async getActive(type: BlacklistEntryType): Promise<GoogleSpreadsheetRow<BlacklistRow>[]> {
        const activeSheet = await this.ensureSheet();
        const rows = await activeSheet.getRows<BlacklistRow>();
        return rows.filter((r) => r.get('Type(Country/Player)') === type && r.get('status') === 'Active');
    }
    async isBlacklistedPlayer(mcid: string | undefined): Promise<boolean> {
        if (!mcid)
            return false;
        const players = await this.getActive('Player');
        return players.some((r) => r.get('value') === mcid);
    }
    async isBlacklistedCountry(country: string | undefined): Promise<boolean> {
        if (!country)
            return false;
        const countries = await this.getActive('Country');
        return countries.some((r) => r.get('value') === country);
    }
}
