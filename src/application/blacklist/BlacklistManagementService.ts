import { BlacklistRepository, BlacklistEntryType, AddResult, RemoveResult } from '../../infrastructure/sheets/BlacklistRepository.js';
import type { BotConfig } from '../../infrastructure/config/BotConfig.js';
export class BlacklistManagementService {
    constructor(private readonly repo: BlacklistRepository, private readonly config: BotConfig) { }
    hasManagePermission(userRoleIds: string[]): boolean {
        const allowedRoleIds = [
            ...this.config.ministerRoleIds,
            ...this.config.diplomatRoleIds,
            ...this.config.examinerRoleIds,
        ];
        const hasRole = allowedRoleIds.some((roleId) => userRoleIds.includes(roleId));
        console.log('【権限チェック】有効ロールID:', allowedRoleIds);
        console.log('【権限チェック】ユーザーロールID:', userRoleIds);
        console.log('【権限チェック】hasRole:', hasRole);
        return hasRole;
    }
    addEntry(type: BlacklistEntryType, value: string): Promise<AddResult> {
        return this.repo.addEntry(type, value, '');
    }
    removeEntry(type: BlacklistEntryType, value: string): Promise<RemoveResult> {
        return this.repo.removeEntry(type, value);
    }
    async listActive(): Promise<{
        countries: string[];
        players: string[];
    }> {
        const countries = await this.repo.getActive('Country');
        const players = await this.repo.getActive('Player');
        return {
            countries: countries.map((r) => r.get('value')),
            players: players.map((r) => r.get('value')),
        };
    }
    initialize(): Promise<void> {
        return this.repo.init();
    }
}
