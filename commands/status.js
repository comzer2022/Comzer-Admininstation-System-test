import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import axios from 'axios';

// 最終診断時刻の保持
let lastSelfCheck = new Date();
export function updateLastSelfCheck() {
  lastSelfCheck = new Date();
}

// コマンド定義
export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('BOTの最終自己診断時刻と連携状態を表示');
async function checkCitizenSheet() {
  try {
    const resp = await axios.get('https://comzer-gov.net/wp-json/czr/v1/healthz', { timeout: 3000 });
    return resp.status === 200 ? '✅ 国民名簿：連携中' : '⛔ 国民名簿：連携失敗';
  } catch (err) {
    console.error('[STATUS] citizen healthz error:', err.message);
    return '⛔ 国民名簿：連携失敗';
  }
}

async function checkBlacklistSheet() {
  try {
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    const tab = process.env.BLACKLIST_TAB_NAME || 'blacklist(CAS連携)';
    return doc.sheetsByTitle[tab] ? '✅ ブラックリスト：連携中' : '⛔ ブラックリスト：連携失敗';
  } catch (err) {
    console.error('[STATUS] blacklist sheet error:', err.message);
    return '⛔ ブラックリスト：連携失敗';
  }
}

async function checkMojang() {
  try {
    const resp = await axios.get('https://api.mojang.com/users/profiles/minecraft/Notch', { timeout: 3000 });
    return resp.status === 200 ? '✅ Mojang API：連携中' : '⛔ Mojang API：連携失敗';
  } catch (err) {
    console.error('[STATUS] mojang API error:', err.message);
    return '⛔ Mojang API：連携失敗';
  }
}

async function checkBedrock() {
  try {
    const resp = await axios.get('https://playerdb.co/api/player/xbox/Notch', { timeout: 3000 });
    return (resp.data && resp.data.success) ? '✅ Bedrock API：連携中' : '⛔ Bedrock API：連携失敗';
  } catch (err) {
    console.error('[STATUS] bedrock API error:', err.message);
    return '⛔ Bedrock API：連携失敗';
  }
}

// コマンド実行本体
export async function execute(interaction) {
  console.log("[STATUS EXECUTE] replied:", interaction.replied, "deferred:", interaction.deferred);
  if (interaction.replied || interaction.deferred) return;
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    console.error('[STATUS] deferReply failed:', err);
    return;
  }
  const results = await Promise.allSettled([
    checkCitizenSheet(),
    checkBlacklistSheet(),
    checkMojang(),
    checkBedrock(),
  ]);
  const citizenSheet   = results[0].status === 'fulfilled' ? results[0].value : '⛔ 国民名簿：連携失敗';
  const blacklistSheet = results[1].status === 'fulfilled' ? results[1].value : '⛔ ブラックリスト：連携失敗';
  const mojangApi      = results[2].status === 'fulfilled' ? results[2].value : '⛔ Mojang API：連携失敗';
  const bedrockApi     = results[3].status === 'fulfilled' ? results[3].value : '⛔ Bedrock API：連携失敗';

  updateLastSelfCheck();
  const timeStr = lastSelfCheck.toLocaleString('ja-JP', {
    hour12: false,
    timeZone: 'Asia/Tokyo'
  });

  const embed = new EmbedBuilder()
    .setTitle('CAS自己診断プログラムを実行しました')
    .setDescription(
      `✅ 最終診断時刻：${timeStr}\n` +
      `${citizenSheet}\n` +
      `${blacklistSheet}\n` +
      `${mojangApi}\n` +
      `${bedrockApi}`
    )
    .setColor(0x2ecc71);

  try {
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[STATUS] editReply failed:', err);
    try {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } catch (err2) {
      console.error('[STATUS] followUp also failed:', err2);
    }
  }
}

// lastSelfCheck をエクスポート
export { lastSelfCheck };