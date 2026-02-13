const DIPLOMAT_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/5dwbifgYfsdWpZx/preview';
const MINISTER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/qGWt4rftd9ygKdi/preview';
const EXAMINER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/NEsrzngYJEHZwTn/preview';
const COMZER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/2DfeR3dTWdtCrgq/preview';

const DIPLOMAT_ROLE_IDS = (process.env.ROLLID_DIPLOMAT || '').split(',').filter(Boolean);
const MINISTER_ROLE_IDS = (process.env.ROLLID_MINISTER || '').split(',').filter(Boolean);
const EXAMINER_ROLE_IDS = (process.env.EXAMINER_ROLE_IDS || '').split(',').filter(Boolean);

export const ROLE_CONFIG = {
  ...Object.fromEntries(
    DIPLOMAT_ROLE_IDS.map(roleId => [roleId, {
      embedName: '外交官(外務省 総合外務部職員)',
      embedIcon: DIPLOMAT_ICON_URL,
      webhookName: 'コムザール連邦共和国 外務省',
      webhookIcon: DIPLOMAT_ICON_URL,
      canDelete: [...DIPLOMAT_ROLE_IDS],
    }])
  ),
  ...Object.fromEntries(
    MINISTER_ROLE_IDS.map(roleId => [roleId, {
      embedName: '閣僚会議議員',
      embedIcon: MINISTER_ICON_URL,
      webhookName: 'コムザール連邦共和国 大統領府',
      webhookIcon: COMZER_ICON_URL,
      canDelete: [...MINISTER_ROLE_IDS],
    }])
  ),
  ...Object.fromEntries(
    EXAMINER_ROLE_IDS.map(roleId => [roleId, {
      embedName: '入国審査担当官',
      embedIcon: EXAMINER_ICON_URL,
      webhookName: 'コムザール連邦共和国 大統領府',
      webhookIcon: COMZER_ICON_URL,
      canDelete: [...EXAMINER_ROLE_IDS],
    }])
  ),
};

// name と icon プロパティを追加
Object.entries(ROLE_CONFIG).forEach(([roleId, cfg]) => {
  cfg.name = cfg.embedName;
  cfg.icon = cfg.embedIcon;
});
