export interface RoleConfigEntry {
  embedName: string;
  embedIcon: string;
  webhookName: string;
  webhookIcon: string;
  canDelete: string[];
  /** embedNameのエイリアス（後方互換のため付与） */
  name?: string;
  /** embedIconのエイリアス（後方互換のため付与） */
  icon?: string;
}

export type RoleConfigMap = Record<string, RoleConfigEntry>;

const DIPLOMAT_ICON_URL =
  'https://www.comzer-gov.net/database/index.php/s/5dwbifgYfsdWpZx/preview';
const MINISTER_ICON_URL =
  'https://www.comzer-gov.net/database/index.php/s/qGWt4rftd9ygKdi/preview';
const EXAMINER_ICON_URL =
  'https://www.comzer-gov.net/database/index.php/s/NEsrzngYJEHZwTn/preview';
const COMZER_ICON_URL =
  'https://www.comzer-gov.net/database/index.php/s/2DfeR3dTWdtCrgq/preview';

const parseRoleIds = (value: string | undefined): string[] =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const DIPLOMAT_ROLE_IDS = parseRoleIds(process.env.ROLLID_DIPLOMAT);
const MINISTER_ROLE_IDS = parseRoleIds(process.env.ROLLID_MINISTER);
const EXAMINER_ROLE_IDS = parseRoleIds(process.env.EXAMINER_ROLE_IDS);

export const ROLE_CONFIG: RoleConfigMap = {
  ...Object.fromEntries(
    DIPLOMAT_ROLE_IDS.map((roleId): [string, RoleConfigEntry] => [
      roleId,
      {
        embedName: '外交官(外務省 総合外務部職員)',
        embedIcon: DIPLOMAT_ICON_URL,
        webhookName: 'コムザール連邦共和国 外務省',
        webhookIcon: DIPLOMAT_ICON_URL,
        canDelete: [...DIPLOMAT_ROLE_IDS],
      },
    ])
  ),
  ...Object.fromEntries(
    MINISTER_ROLE_IDS.map((roleId): [string, RoleConfigEntry] => [
      roleId,
      {
        embedName: '閣僚会議議員',
        embedIcon: MINISTER_ICON_URL,
        webhookName: 'コムザール連邦共和国 大統領府',
        webhookIcon: COMZER_ICON_URL,
        canDelete: [...MINISTER_ROLE_IDS],
      },
    ])
  ),
  ...Object.fromEntries(
    EXAMINER_ROLE_IDS.map((roleId): [string, RoleConfigEntry] => [
      roleId,
      {
        embedName: '入国審査担当官',
        embedIcon: EXAMINER_ICON_URL,
        webhookName: 'コムザール連邦共和国 大統領府',
        webhookIcon: COMZER_ICON_URL,
        canDelete: [...EXAMINER_ROLE_IDS],
      },
    ])
  ),
};

Object.entries(ROLE_CONFIG).forEach(([, cfg]) => {
  cfg.name = cfg.embedName;
  cfg.icon = cfg.embedIcon;
});
