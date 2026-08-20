import type { BotConfig } from './BotConfig.js';
export interface RoleConfigEntry {
    embedName: string;
    embedIcon: string;
    webhookName: string;
    webhookIcon: string;
    canDelete: string[];
    name?: string;
    icon?: string;
}
export type RoleConfigMap = Record<string, RoleConfigEntry>;
const DIPLOMAT_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/5dwbifgYfsdWpZx/preview';
const MINISTER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/qGWt4rftd9ygKdi/preview';
const EXAMINER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/NEsrzngYJEHZwTn/preview';
const COMZER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/2DfeR3dTWdtCrgq/preview';
export function buildRoleConfig(config: BotConfig): RoleConfigMap {
    const diplomatRoleIds = config.diplomatRoleIds;
    const ministerRoleIds = config.ministerRoleIds;
    const examinerRoleIds = config.examinerRoleIds;
    const roleConfig: RoleConfigMap = {
        ...Object.fromEntries(diplomatRoleIds.map((roleId): [
            string,
            RoleConfigEntry
        ] => [
            roleId,
            {
                embedName: '外交官(外務省 総合外務部職員)',
                embedIcon: DIPLOMAT_ICON_URL,
                webhookName: 'コムザール連邦共和国 外務省',
                webhookIcon: DIPLOMAT_ICON_URL,
                canDelete: [...diplomatRoleIds],
            },
        ])),
        ...Object.fromEntries(ministerRoleIds.map((roleId): [
            string,
            RoleConfigEntry
        ] => [
            roleId,
            {
                embedName: '閣僚会議議員',
                embedIcon: MINISTER_ICON_URL,
                webhookName: 'コムザール連邦共和国 大統領府',
                webhookIcon: COMZER_ICON_URL,
                canDelete: [...ministerRoleIds],
            },
        ])),
        ...Object.fromEntries(examinerRoleIds.map((roleId): [
            string,
            RoleConfigEntry
        ] => [
            roleId,
            {
                embedName: '入国審査担当官',
                embedIcon: EXAMINER_ICON_URL,
                webhookName: 'コムザール連邦共和国 大統領府',
                webhookIcon: COMZER_ICON_URL,
                canDelete: [...examinerRoleIds],
            },
        ])),
    };
    Object.entries(roleConfig).forEach(([, cfg]) => {
        cfg.name = cfg.embedName;
        cfg.icon = cfg.embedIcon;
    });
    return roleConfig;
}
export type RolepostMode = 'minister' | 'diplomat' | 'examiner';
export const ROLEPOST_MODE_CONFIG: Record<RolepostMode, RoleConfigEntry> = {
    minister: {
        embedName: '閣僚会議議員',
        embedIcon: MINISTER_ICON_URL,
        webhookName: 'コムザール連邦共和国 大統領府',
        webhookIcon: COMZER_ICON_URL,
        canDelete: [],
    },
    diplomat: {
        embedName: '外交官(外務省 総合外務部職員)',
        embedIcon: DIPLOMAT_ICON_URL,
        webhookName: 'コムザール連邦共和国 外務省',
        webhookIcon: DIPLOMAT_ICON_URL,
        canDelete: [],
    },
    examiner: {
        embedName: '入国審査担当官',
        embedIcon: EXAMINER_ICON_URL,
        webhookName: 'コムザール連邦共和国 大統領府',
        webhookIcon: COMZER_ICON_URL,
        canDelete: [],
    },
};
export const ROLEPOST_MODE_LABELS: Record<RolepostMode, string> = {
    minister: '閣僚会議議員',
    diplomat: '外交官(外務省 総合外務部職員)',
    examiner: '入国審査担当官',
};
export const ROLEPOST_ENV_KEY_BY_MODE: Record<RolepostMode, keyof Pick<BotConfig, 'ministerRoleIds' | 'diplomatRoleIds' | 'examinerRoleIds'>> = {
    minister: 'ministerRoleIds',
    diplomat: 'diplomatRoleIds',
    examiner: 'examinerRoleIds',
};
