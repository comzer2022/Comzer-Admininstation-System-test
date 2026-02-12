import { createRequire } from "module";
const require = createRequire(import.meta.url);
import './logger.js';
import { messagelog } from './logger.js';
const config = require("./config.json");
import * as embedPost from './commands/embedPost.js';
import { data as infoData, execute as infoExecute } from './commands/info.js';
import axios from "axios";
import http from "node:http";
import fetch from 'node-fetch';
import { extractionPrompt } from "./prompts.js";
import * as statusCommand from './commands/status.js';
import * as debugCommand from './commands/debug.js';
import { data as shutdownData, execute as shutdownExec } from './commands/shutdown.js';
import fs from "node:fs";
import mysql from 'mysql2/promise';
import { syncMember, fullSync } from './citizen_data/syncMembers.js';
import { handleCommands, initBlacklist, isBlacklistedCountry, isBlacklistedPlayer } from "./blacklistCommands.js";
import {
  WebhookClient,
  Client,
  InteractionResponseType,
  MessageFlags,
  Collection,
  Events,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  SelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import OpenAI from "openai";
import { GoogleSpreadsheet } from "google-spreadsheet";
import express from 'express';
import bodyParser from 'body-parser';
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
const validateApiKey = (req) => {
  const apiKey = req.headers['x-api-key'];
  return apiKey === process.env.CASBOT_API_SECRET;
};

// Discord client 初期化
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences],
  partials: ['CHANNEL']
});
client.login(process.env.DISCORD_TOKEN);

// ── 通知キュー関連 ──
const queue = [];
let processing = false;
/**
 * キュー処理関数
 * メッセージを1.5秒間隔で送信し、失敗時は詳細な理由をログ出力します。
 */
async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const item = queue.shift();
    const statusReport = {
      requestId: item.requestId,
      discordId: item.discord_id,
      success: false,
      detail: "不明なエラー",
      errorCode: null
    };

    try {
      // 1. ユーザーの取得
      const user = await client.users.fetch(item.discord_id);
      
      // 2. メッセージ送信
      await user.send(item.message);
      
      statusReport.success = true;
      statusReport.detail = "送信成功";
      console.log(`[SUCCESS] Request:${item.requestId} -> ${user.tag}`);

    } catch (err) {
      // エラーオブジェクトから詳細を取得
      statusReport.errorCode = err.code;
      
      if (err.code === 50007) {
        // DM拒否設定（共通サーバー有無の簡易判定付き）
        const hasCommonGuild = client.guilds.cache.some(g => g.members.cache.has(item.discord_id));
        statusReport.detail = hasCommonGuild 
          ? "失敗(50007): ユーザーがDMを閉じているか、Botがブロックされています。" 
          : "失敗(50007): 共通サーバーにユーザーがいないため送信できません。";
      } else if (err.code === 10013) {
        statusReport.detail = "失敗(10013): ユーザーIDが正しくないか、存在しません。";
      } else if (err.code === 50001) {
        statusReport.detail = "失敗(50001): Botにメッセージ送信権限がありません。";
      } else {
        statusReport.detail = `失敗: ${err.message}`;
      }

      // ★ ここで必ずエラーログを出力する
    console.error(`[FAILURE REPORT] RequestID: ${statusReport.requestId} | TargetID: ${statusReport.discordId} | Reason: ${statusReport.detail}`, err);
    }
    
    await new Promise(res => setTimeout(res, 1500));
  }

  processing = false;
}

/**
 * /api/notify エンドポイント
 */
app.post('/api/notify', (req, res) => {
  console.log('--- APIリクエスト受信 ---');
  if (!validateApiKey(req)) {
    console.error('APIキー認証失敗:', req.headers['x-api-key']); // ヘッダー名に合わせて調整
    return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
  }
  const data = req.body || {};
  try {
    console.log('通知受信:', JSON.stringify(data).slice(0, 1000));
  } catch (e) {
    console.log('通知受信: (non-serializable)');
  }
  
  // 2. 基本情報の抽出
  const discordIdRaw = data.discord_id ?? data.discordId ?? data.discord ?? '';
  const discordId = String(discordIdRaw).trim();
  const requestId = data.request_id ?? data.requestId ?? '—';

  if (!discordId) {
    console.error('notify: missing discord_id', data);
    return res.status(400).json({ error: 'discord_id missing' });
  }

  // 3. メッセージ内容の翻訳・構築
  const typeMap = {
    registry_update: '国民登記情報修正申請',
    business_filing: '開業・廃業届',
    staff_appointment: '職員登用申請',
    donation_report: '寄付申告',
    party_membership: '入党・離党届',
    party_create_dissolve: '結党・解党届',
    citizen_recommend: '新規国民推薦届',
    citizen_denunciation: '脱退申告',
    anonymous_report: '匿名通報',
  };

  const rawRequestName = String(data.request_name ?? data.requestName ?? '').trim();
  const translatedType = typeMap[rawRequestName] || rawRequestName || '—';
  const createdAt = data.created_at ?? data.createdAt ?? '—';
  const department = data.department ?? data.dept ?? '—';
  const decisionEvent = data.decision_event ?? data.decisionEvent ?? '—';
  const decisionDatetime = data.decision_datetime ?? data.decisionDatetime ?? data.decision_event_datetime ?? '—';
  const notice = (data.notice ?? data.memo ?? '').toString().trim() || 'なし';
  const payloadContent = (data.request_content ?? data.requestContent ?? data.payload ?? '').toString().trim() || 'なし';

  const message = [
    '【重要】',
    '件名 : 審査結果通知のお知らせ',
    '申請先機関から通知結果が届いています。',
    '',
    '======================================',
    `さきに申請のあった${translatedType}（到達番号：${requestId}、作成日時：${createdAt}）について、以下のとおり${decisionEvent}されました。`,
    '',
    '《申請内容》',
    `申請種類：${translatedType}`,
    `申請到達日時：${createdAt}`,
    `申請内容：${payloadContent}`,
    '',
    '《決裁情報》',
    `決裁部門：${department}`,
    `決裁日時：${decisionDatetime}`,
    '担当者：（非開示）',
    `備考：${notice}`,
    '',
    '-# 📢 このメッセージは、仮想国家コミュニティ《コムザール連邦共和国》が管理運営するコムザール行政システムによる自動通知です。',
  ].join('\n');

  // 4. キューへの追加
  queue.push({ 
    discord_id: discordId, 
    message: message, 
    requestId: requestId 
  });

  console.log(`notify: queued message for ${discordId} (request ${requestId})`);
  
  processQueue();

  return res.json({ 
    status: 'queued', 
    requestId: requestId,
  });
});

app.get('/', (req, res) => {
  res.send('OK');
});
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

const HEALTHZ_URL = process.env.HEALTHZ_URL
  || (process.env.CZR_BASE
      ? `${process.env.CZR_BASE}/wp-json/czr-bridge/v1/healthz`
      : 'https://comzer-gov.net/wp-json/czr-bridge/v1/healthz');
const API_URL   = 'https://comzer-gov.net/wp-json/czr/v1/data-access'
const API_TOKEN = process.env.YOUR_SECRET_API_KEY;

let healthPromise;
async function verifyDbHealthOnce() {
  if (healthPromise) return healthPromise;

  healthPromise = (async () => {
    console.log('[Startup] DB接続チェック…', HEALTHZ_URL);
    let res;
    try {
      res = await fetch(HEALTHZ_URL);
    } catch (e) {
      console.error('[Startup] ヘルスエンドポイント到達失敗:', e.message);
      return { ok: false, error: e.message };
    }
    if (res.ok) {
      console.log('[Startup] DB 接続 OK');
      return { ok: true };
    }
    const body = await res.json().catch(() => ({}));
    console.error(
      `[Startup] DBヘルスチェック ${res.status} エラー:`,
      body.message || body
    );
    return { ok: false, status: res.status, message: body.message };
  })();
  
  return healthPromise;
}

// ── 環境変数
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TICKET_CAT = process.env.TICKET_CAT;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const ADMIN_KEYWORD = process.env.ADMIN_KEYWORD || "!status";
const SHEET_ID_RAW = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const sheetId = SHEET_ID_RAW.match(/[-\w]{25,}/)?.[0] || SHEET_ID_RAW;
const today = (new Date()).toISOString().slice(0,10);
const prompt = extractionPrompt.replace("__TODAY__", today);
const DIPLOMAT_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/5dwbifgYfsdWpZx/preview';
const MINISTER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/qGWt4rftd9ygKdi/preview';
const EXAMINER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/NEsrzngYJEHZwTn/preview';
const COMZER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/2DfeR3dTWdtCrgq/preview';
  
const DIPLOMAT_ROLE_IDS = (process.env.ROLLID_DIPLOMAT || '').split(',').filter(Boolean);
const MINISTER_ROLE_IDS = (process.env.ROLLID_MINISTER || '').split(',').filter(Boolean);
const EXAMINER_ROLE_IDS = (process.env.EXAMINER_ROLE_IDS || '').split(',').filter(Boolean);

const ROLE_CONFIG = {
  ...Object.fromEntries(
    DIPLOMAT_ROLE_IDS.map(roleId => [ roleId, {
      embedName:   '外交官(外務省 総合外務部職員)',
      embedIcon:   DIPLOMAT_ICON_URL,
      webhookName: 'コムザール連邦共和国 外務省',
      webhookIcon: DIPLOMAT_ICON_URL,
      canDelete: [...DIPLOMAT_ROLE_IDS],  
    }])
  ),
  ...Object.fromEntries(
    MINISTER_ROLE_IDS.map(roleId => [ roleId, {
      embedName:   '閣僚会議議員',
      embedIcon:   MINISTER_ICON_URL,
      webhookName: 'コムザール連邦共和国 大統領府',
      webhookIcon: COMZER_ICON_URL,
      canDelete: [...MINISTER_ROLE_IDS], 
    }])
  ),
  ...Object.fromEntries(
    EXAMINER_ROLE_IDS.map(roleId => [ roleId, {
      embedName:   '入国審査担当官',
      embedIcon:   EXAMINER_ICON_URL,
      webhookName: 'コムザール連邦共和国 大統領府',
      webhookIcon: COMZER_ICON_URL,
      canDelete: [...EXAMINER_ROLE_IDS], 
    }])
  ),
};

Object.entries(ROLE_CONFIG).forEach(([roleId, cfg]) => {
  cfg.name = cfg.embedName;
  cfg.icon = cfg.embedIcon;
});

export { ROLE_CONFIG };

const webhooks = new Map();
async function getOrCreateHook(channel, roleId) {
  const key = `${channel.id}:${roleId}`;
  if (webhooks.has(key)) return webhooks.get(key);
  
  const whs = await channel.fetchWebhooks();
  const webhookName = ROLE_CONFIG[roleId].webhookName;
  const webhookIcon = ROLE_CONFIG[roleId].webhookIcon;
  
  const existing = whs.find(w => w.name === webhookName);
  const hook = existing
    ? new WebhookClient({ id: existing.id, token: existing.token })
    : await channel.createWebhook({
        name: webhookName,
        avatar: webhookIcon,
      });

  webhooks.set(key, hook);
  return hook;
}

function nowJST() {
  const now = new Date();
  return now.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// ── Googleシート初期化
let sheet;
try {
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth({
    client_email: SERVICE_ACCOUNT_EMAIL,
    private_key:  PRIVATE_KEY.replace(/\\n/g, '\n'),
  });
  await doc.loadInfo();
  sheet = doc.sheetsByTitle['コムザール連邦共和国'];
  console.log('✅ GoogleSheet 読み込み完了');
} catch (err) {
  console.error('❌ GoogleSheet 初期化失敗:', err);
}

// ── OpenAI／Discord Bot 初期化
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});
bot.ROLE_CONFIG = ROLE_CONFIG;
bot.commands = new Collection([
  [embedPost.data.name,     embedPost],
  [statusCommand.data.name, statusCommand],
  [shutdownData.name,       { data: shutdownData, execute: shutdownExec }],
  [infoData.name,           { data: infoData, execute: infoExecute }],
  [debugCommand.data.name, debugCommand],
]);

bot.once("ready", async () => {
  console.log(`Logged in as ${bot.user.tag} | initializing blacklist…`);
  await initBlacklist();
  console.log("✅ Bot ready & blacklist initialized");

  try {
    await fullSync(bot, Number(process.env.CZR_THROTTLE_MS || 700));
  } catch (e) {
    console.error('[fullSync] 初回同期失敗:', e);
  }

  const interval = Number(process.env.CZR_SYNC_INTERVAL_MS || 10800000);
  setInterval(() => {
    fullSync(bot).catch(err => console.error('[fullSync] 定期同期失敗:', err));
  }, interval);
});

// ── セッション管理
const sessions = new Map();
function startSession(channelId, userId) {
  const id = `${channelId}-${userId}-${Date.now()}`;
  sessions.set(id, { id, channelId, userId, step: 'intro', data: {}, logs: [], lastAction: Date.now() });
  return sessions.get(id);
}

async function endSession(id, status) {
  const session = sessions.get(id);
  if (!session) return;
  session.status = status;
  session.logs.push(`[${nowJST()}] セッション終了: ${status}`);
  const text = session.logs.join("\n");
  const buffer = Buffer.from(text, 'utf8');
  const channelName = bot.channels.cache.get(session.channelId)?.name || session.channelId;
  const fileName = `${channelName}-一時入国審査.txt`;
  const logChannel = bot.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel?.isTextBased()) {
    try {
      await logChannel.send({
        content: `セッション ${session.id} が ${status} しました。詳細ログを添付します。`,
        files: [{ attachment: buffer, name: fileName }],
      });
    } catch (err) {
      console.error('ログ送信エラー:', err);
    }
  }
  sessions.delete(id);
}

// ステータスメッセージ更新
setInterval(() => {
  const jstTime = new Date().toLocaleString("ja-JP", { hour12: false });
  bot.user.setActivity(
    `コムザール行政システム(CAS) 稼働中 | 診断:${jstTime}`,
    { type: ActivityType.Watching }
  );
  statusCommand.updateLastSelfCheck();
}, 30 * 60 * 1000);

bot.once("ready", () => {
  const jstTime = new Date().toLocaleString("ja-JP", { hour12: false });
  bot.user.setActivity(
    `コムザール行政システム稼働中 | 最新自己診断時刻:${jstTime}`,
    { type: ActivityType.Watching }
  );
  statusCommand.updateLastSelfCheck();
});

// タイムアウト監視
setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.step === 'waitingJoiner') continue;
    if (now - session.lastAction > 10 * 60 * 1000) {
      session.logs.push(`[${nowJST()}] タイムアウト`);
      endSession(session.id, 'タイムアウト');
    }
  }
}, 60 * 1000);
// ── 審査ロジック
async function runInspection(content, session) {
  let parsed;
  try {
    const today = (new Date()).toISOString().slice(0,10);
    const prompt = extractionPrompt.replace("__TODAY__", today);
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: content }
      ],
    });
    parsed = JSON.parse(gptRes.choices[0].message.content);
    if (parsed.companions && Array.isArray(parsed.companions)) {
      parsed.companions = parsed.companions.map(c =>
        typeof c === "string" ? { mcid: c } : c
      );
    }    
    session.logs.push(`[${nowJST()}] 整形結果: ${JSON.stringify(parsed, null, 2)}`);
  } catch (e) {
    session.logs.push(`[${nowJST()}] 整形エラー: ${e}`);
    return { approved: false, content: "申請内容の解析に失敗しました。もう一度ご入力ください。" };
  }

  if (await isBlacklistedCountry(parsed.nation)) {
    session.logs.push(`[${nowJST()}] ＜Blacklist(国)該当＞ ${parsed.nation}`);
    return { approved: false, content: "申請された国籍は安全保障上の理由から入国を許可することができないため、却下します。" };
  }
  if (await isBlacklistedPlayer(parsed.mcid)) {
    session.logs.push(`[${nowJST()}] ＜Blacklist(プレイヤー)該当＞ ${parsed.mcid}`);
    return { approved: false, content: "申請されたMCIDは安全保障上の理由から入国を許可することができないため、却下します。" };
  }

  let exists = false;
  try {
    const version = session?.data?.version || "java";
    const mcid = parsed.mcid.replace(/^BE_/, "");

    const url = version === "java"
      ? `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(mcid)}`
      : `https://playerdb.co/api/player/xbox/${encodeURIComponent(mcid)}`;
    const resp = await axios.get(url, { validateStatus: () => true });
    exists = version === "java" ? resp.status === 200 : resp.data.success === true;
  } catch {}

  if (!exists) {
    return { approved: false, content: `申請者MCID「${parsed.mcid}」のアカウントチェックが出来ませんでした。綴りにお間違いはございませんか？` };
  }

  if (parsed.companions && Array.isArray(parsed.companions)) {
    parsed.companions = parsed.companions.map(c =>
      typeof c === "string" ? { mcid: c } : c
    );
  }
  if (parsed.companions && parsed.companions.length > 0) {
    for (const { mcid: companionId } of parsed.companions) {
      if (!companionId) continue;
      if (await isBlacklistedPlayer(companionId)) {
        return { approved: false, content: `同行者「${companionId}」は安全保障上の理由から入国を許可することができないため。` };
      }
      let version = session?.data?.version || "java";
      if (companionId.startsWith("BE_")) version = "bedrock";
      const apiId = companionId.replace(/^BE_/, "");
      let exists = false;
      try {
        const url = version === "java"
          ? `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(apiId)}`
          : `https://playerdb.co/api/player/xbox/${encodeURIComponent(apiId)}`;
        const resp = await axios.get(url, { validateStatus: () => true });
        exists = version === "java" ? resp.status === 200 : resp.data.success === true;
      } catch {}
      if (!exists) {
        return { approved: false, content: `同行者MCID「${companionId}」のアカウントチェックが出来ませんでした。綴りにお間違いはございませんか？。` };
      }
      if (companionId.nation && companionId.nation !== parsed.nation) {
        return { approved: false, content: `同行者「${companionId}」は申請者と国籍が異なるため承認できません。国籍が異なる場合、それぞれご申告ください。` };
      }
    }
  }

  if (parsed.joiners && parsed.joiners.length > 0) {
    const joinerList = parsed.joiners;
    console.log("[JoinerCheck] joinerList:", joinerList);
    console.log("[JoinerCheck] Sending Authorization:", `Bearer ${API_TOKEN}`);

    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_TOKEN}`,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify({
          action:  "match_joiners_strict",
          joiners: joinerList
        })
      });
    } catch (e) {
      console.error("[JoinerCheck][Error] ネットワークエラー:", e.message);
      return {
        approved: false,
        content: "合流者チェックの通信に失敗しました。ネットワークをご確認ください。"
      };
    }

    const data = await res.json().catch(() => ({}));
    console.log(
      "[JoinerCheck] data.discord_ids:",
      JSON.stringify(data.discord_ids, null, 2)
    );

    if (!res.ok) {
      console.error("[JoinerCheck][Error] APIエラー");
      console.error(`  URL:    ${API_URL}`);
      console.error(`  Status: ${res.status} (${res.statusText})`);
      console.error("  Body:   ", JSON.stringify(data, null, 2));
      return {
        approved: false,
        content: data.message || `サーバーエラー(${res.status})が発生しました。`
      };
    }

    parsed.joinerDiscordIds = joinerList
      .map(j => {
        const raw = j.trim();
        const key = raw.normalize("NFKC");
        const id  = data.discord_ids?.[key];
        if (!id) {
          console.warn(`[JoinerCheck][Warn] raw "${raw}" が discord_ids のキーになっていません`);
        } else {
          console.log(`[JoinerCheck] raw "${raw}" → ID ${id}`);
        }
        return id;
      })
      .filter(Boolean);

    console.log("[JoinerCheck] parsed.joinerDiscordIds:", parsed.joinerDiscordIds);
  }

  const start = new Date(parsed.start_datetime);
  const end = new Date(parsed.end_datetime);
  const periodHours = (end - start) / (1000 * 60 * 60);
  if (periodHours > 24*31) {
    return { approved: false, content: "申請期間が長すぎるため却下します（申請期間が31日を超える場合、31日で申請後、申請が切れる前に再審査をお願いいたします。）" };
  }
  if (!parsed.mcid || !parsed.nation || !parsed.purpose || !parsed.start_datetime || !parsed.end_datetime) {
    return { approved: false, content: "申請情報に不足があります。全項目を入力してください。" };
  }

  return { approved: true, content: parsed };
}

// ── インタラクション処理
bot.on('interactionCreate', async interaction => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChatInputCommand() && !interaction.isModalSubmit()) return;

  // 合流者応答ボタン
  if (interaction.isButton() && interaction.customId.startsWith('joinerResponse-')) {
    const parts = interaction.customId.split('-');
    const answer = parts[1];
    const sessionId = parts.slice(2).join('-');
    const session = sessions.get(sessionId);
    if (!session) {
      return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
    }
    session.logs.push(`[${nowJST()}] 合流者回答: ${interaction.user.id} → ${answer}`);

    session.data.joinerResponses = session.data.joinerResponses || {};
    session.data.joinerResponses[interaction.user.id] = answer;

    await interaction.reply({ content: '回答ありがとうございました。', ephemeral: true });

    const expectCount = (session.data.joinerDiscordIds || []).length;
    const gotCount = Object.keys(session.data.joinerResponses).length;
    if (gotCount === expectCount) {
      const anyNo = Object.values(session.data.joinerResponses).includes('no');
      const targetChannel = await bot.channels.fetch(session.channelId);
      if (!targetChannel?.isTextBased()) return endSession(session.id, anyNo ? '却下' : '承認');
      const applicantMention = session.data.applicantDiscordId
        ? `<@${session.data.applicantDiscordId}> `
        : '';
      
      if (anyNo) {
        const parsed = session.data.parsed;
        const companionStr = Array.isArray(parsed.companions) && parsed.companions.length > 0
          ? parsed.companions.map(c => typeof c === 'string' ? c : c.mcid).join(', ')
          : 'なし';
        const joinerStr = Array.isArray(parsed.joiners) && parsed.joiners.length > 0
          ? parsed.joiners.join(', ')
          : 'なし';
        const reasonMsg = "合流者が申請を承認しませんでした。合流者は正しいですか？"
        const detailLines = [
          `申請者: ${parsed.mcid}`,
          `国籍: ${parsed.nation}`,
          `申請日: ${nowJST()}`,
          `入国目的: ${parsed.purpose}`,
          `入国期間: ${parsed.start_datetime} ～ ${parsed.end_datetime}`,
          `同行者: ${companionStr || "なし"}`,
          `合流者: ${joinerStr || "なし"}`,
        ].join("\n");
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("一時入国審査【却下】")
          .setDescription(
            `**申請が却下されました**\n\n【却下理由】\n${reasonMsg}\n\n【申請内容】\n${detailLines}`
          )
          .setFooter({ text: "再申請の際は内容をよくご確認ください。" });
        await targetChannel.send({ 
          content: `${applicantMention}`,
          embeds: [embed] 
        });
        return endSession(session.id, '却下');
      } else {
        const parsed = session.data.parsed;
        const companionStr = Array.isArray(parsed.companions) && parsed.companions.length > 0
          ? parsed.companions.map(c => typeof c === 'string' ? c : c.mcid).join(', ')
          : 'なし';
        const joinerStr = Array.isArray(parsed.joiners) && parsed.joiners.length > 0
          ? parsed.joiners.join(', ')
          : 'なし';
        
        const fields = [
          { name: "申請者", value: parsed.mcid, inline: true },
          { name: "国籍", value: parsed.nation, inline: true },
          { name: "申請日", value: nowJST(), inline: true },
          { name: "入国目的", value: parsed.purpose, inline: true },
          { name: "入国期間", value: `${parsed.start_datetime} ～ ${parsed.end_datetime}`, inline: false },
          { name: "同行者", value: companionStr || "なし", inline: false },
          { name: "合流者", value: joinerStr || "なし", inline: false },
        ];

        const embed = new EmbedBuilder()
          .setTitle("一時入国審査結果")
          .setColor(0x3498db)
          .addFields(...fields)
          .setDescription(
            "自動入国審査システムです。上記の通り申請されました" +
            `"__**一時入国審査**__"について、審査が完了いたしましたので、以下の通り通知いたします。\n\n` +
            "> 審査結果：**承認**"
          )
          .addFields({
            name: "【留意事項】",
            value:
              "・在留期間の延長が予定される場合、速やかににこのチャンネルでお知らせください。但し、合計在留期間が31日を超える場合、新規に申請が必要です。\n" +
              "・入国が承認されている期間中、申請内容に誤りがあることが判明したり、異なる行為をした場合、又は、コムザール連邦共和国の法令に違反したり、行政省庁の指示に従わなかった場合は、**承認が取り消される**場合があります。\n" +
              "・入国中、あなたは[コムザール連邦共和国の明示する法令](https://comzer-gov.net/laws/) を理解したものと解釈され、これの不知を理由に抗弁することはできません。\n" +
              "・あなたがコムザール連邦共和国及び国民に対して損害を生じさせた場合、行政省庁は、あなたが在籍する国家に対して、相当の対応を行う可能性があります。\n" +
              "・あなたの入国関連情報は、その期間中、公表が不適切と判断される情報を除外した上で、コムザール連邦共和国国民に対して自動的に共有されます。\n\n" +
              "コムザール連邦共和国へようこそ。"
          });

        await targetChannel.send({ 
          content: `${applicantMention}`,
          embeds: [embed] 
        });
        const publishEmbed = new EmbedBuilder()
          .setTitle("【一時入国審査に係る入国者の公示】")
          .addFields(fields) // ここでは本人通知用と同じ fields を使用していますが、必要に応じて調整してください
          .setColor(0x27ae60)
          .setDescription("以下の外国籍プレイヤーの入国が承認された為、以下の通り公示いたします。(外務省入管部)");

        // debugCommand.isDebugMode の状態によって ID を切り替える
        const publishChannelId = debugCommand.isDebugMode 
          ? (config.debugChannelId || LOG_CHANNEL_ID) 
          : (config.publishChannelId || config.logChannelId || LOG_CHANNEL_ID);

        const publishChannel = bot.channels.cache.get(publishChannelId);

        // 公示チャンネルへ送信
        if (publishChannel?.isTextBased()) {
          if (debugCommand.isDebugMode) {
          }
          await publishChannel.send({ embeds: [publishEmbed] });
        } else {
          console.error("公示用チャンネルが見つかりません。ID:", publishChannelId);
        }

        // セッションを終了
        return endSession(session.id, '承認');
    }
    }
    return;
  }

  // rolepost選択メニュー

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rolepost-choose-')) {
    const selectedValue = interaction.values[0];
    
    // "diplomat-123456789" のような形式を分解
    const [type, roleId] = selectedValue.includes('-') 
      ? selectedValue.split('-') 
      : [null, selectedValue];

    // 分解した純粋な roleId を保存
    embedPost.setActive(interaction.channelId, interaction.user.id, roleId);

    // ROLE_CONFIG から設定を取得（安全のため存在チェック付き）
    const cfg = ROLE_CONFIG[roleId];
    const modeName = cfg ? cfg.embedName : '役職';

    await interaction.update({
      content: `役職発言モードを **ON** にしました。（${modeName}）`,
      components: [],
    }).catch(err => console.error("Update failed:", err));
    
    return;
  }

  // ゲームエディション選択メニュー
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('version-select-')) {
    const sessionId = interaction.customId.replace('version-select-', '');
    const session = sessions.get(sessionId);
    
    if (!session) {
      return interaction.reply({
        content: 'セッションが存在しないか期限切れです。',
        ephemeral: true
      });
    }
    
    session.lastAction = Date.now();
    const selectedVersion = interaction.values[0];
    session.data.version = selectedVersion;
    session.logs.push(`[${nowJST()}] ゲームエディション選択: ${selectedVersion}`);
    
    // Modal作成
    const modal = new ModalBuilder()
      .setCustomId(`immigration-modal-${session.id}`)
      .setTitle('一時入国審査申請フォーム');

    const mcidInput = new TextInputBuilder()
      .setCustomId('mcid')
      .setLabel('MCID / ゲームタグ')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('BE_を付ける必要はありません')
      .setRequired(true)
      .setMaxLength(50);

    const nationInput = new TextInputBuilder()
      .setCustomId('nation')
      .setLabel('国籍')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: 日本')
      .setRequired(true)
      .setMaxLength(100);

    const periodInput = new TextInputBuilder()
      .setCustomId('period')
      .setLabel('入国期間と目的')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: 観光で10日間')
      .setRequired(true)
      .setMaxLength(200);

    const companionsInput = new TextInputBuilder()
      .setCustomId('companions')
      .setLabel('同行者(いなければ空欄)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: user1,BE_user2')
      .setRequired(false)
      .setMaxLength(300);

    const joinersInput = new TextInputBuilder()
      .setCustomId('joiners')
      .setLabel('合流者(いなければ空欄)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: citizen123, 12345678901234, BE_citizen234 ')
      .setRequired(false)
      .setMaxLength(300);

    const rows = [
      new ActionRowBuilder().addComponents(mcidInput),
      new ActionRowBuilder().addComponents(nationInput),
      new ActionRowBuilder().addComponents(periodInput),
      new ActionRowBuilder().addComponents(companionsInput),
      new ActionRowBuilder().addComponents(joinersInput),
    ];

    modal.addComponents(...rows);
    
    await interaction.showModal(modal);
    session.step = 'modal_submitted';
    return;
  }

  // スラッシュコマンド
  if (interaction.isChatInputCommand()) {
    const cmd = bot.commands.get(interaction.commandName);
    if (cmd) {
      await cmd.execute(interaction);
      return;
    }
  }

  // blacklistコマンド処理
  const handled = await handleCommands(interaction);
  if (handled) return;

  try {
    // ボタン処理
    if (interaction.isButton()) {
      const parts = interaction.customId.split('-');
      const type = parts[0];
      const sessionId = parts.slice(1).join('-');
      const session = sessions.get(sessionId);
      
      if (!session) {
        await interaction.reply({
          content: "このセッションは存在しないか期限切れです。最初からやり直してください。",
          ephemeral: true
        });
        return;
      }
      session.lastAction = Date.now();

      if (type === 'start') {
        session.logs.push(`[${nowJST()}] 概要同意: start`);
        session.step = 'select_version';
        
        // ゲームエディション選択メニューを表示
        const row = new ActionRowBuilder().addComponents(
          new SelectMenuBuilder()
            .setCustomId(`version-select-${session.id}`)
            .setPlaceholder('ゲームエディションを選択してください')
            .addOptions([
              { label: 'Java Edition', value: 'java', description: 'Java版Minecraft' },
              { label: 'Bedrock Edition', value: 'bedrock', description: '統合版Minecraft' },
            ])
        );
        
        await interaction.update({
          content: 'ゲームエディションを選択してください。',
          components: [row]
        });
        return;
      }

      if (type === 'cancel') {
        session.logs.push(`[${nowJST()}] ユーザーが途中キャンセル`);
        await interaction.update({ content: '申請をキャンセルしました。', components: [] });
        return endSession(session.id, 'キャンセル');
      }
    }

    // Modal送信処理
    if (interaction.isModalSubmit() && interaction.customId.startsWith('immigration-modal-')) {
      const sessionId = interaction.customId.replace('immigration-modal-', '');
      const session = sessions.get(sessionId);
      
      if (!session) {
        return interaction.reply({
          content: 'セッションが存在しないか期限切れです。',
          ephemeral: true
        });
      }

      session.lastAction = Date.now();
      
      // versionは既にセッションに保存されている
      const version = session.data.version;
      
      // フィールド値を安全に取得
      let mcid, nation, period, companionsInput, joinersInput;
      try {
        mcid = interaction.fields.getTextInputValue('mcid').trim();
        nation = interaction.fields.getTextInputValue('nation').trim();
        period = interaction.fields.getTextInputValue('period').trim();
        companionsInput = interaction.fields.getTextInputValue('companions').trim();
        joinersInput = interaction.fields.getTextInputValue('joiners').trim();
      } catch (err) {
        console.error('[Modal] フィールド取得エラー:', err);
        return interaction.reply({
          content: '入力内容の取得に失敗しました。もう一度お試しください。',
          ephemeral: true
        });
      }

      let companions = [];
      let joiner = null;
      
      // 同行者の処理
      if (companionsInput && companionsInput !== 'なし') {
        companions = companionsInput.split(',').map(x => x.trim()).filter(Boolean);
      }
      
      // 合流者の処理
      if (joinersInput && joinersInput !== 'なし') {
        joiner = joinersInput;
      }

      session.data = {
        version, // 既にセッションに保存済み
        mcid,
        nation,
        period,
        companions,
        joiner
      };

      session.logs.push(`[${nowJST()}] Modal送信完了`);
      session.logs.push(`[${nowJST()}] version: ${version}, MCID: ${mcid}, 国籍: ${nation}`);
      session.logs.push(`[${nowJST()}] 期間: ${period}, 同行者: ${companions.join(',') || 'なし'}, 合流者: ${joiner || 'なし'}`);

      // Modal送信後、即座に審査を開始
      await interaction.deferReply();
      session.logs.push(`[${nowJST()}] Modal送信後、審査開始`);

      const inputText = [
        `MCID: ${mcid}`,
        `国籍: ${nation}`,
        `目的・期間: ${period}`,
        companions.length > 0 ? `同行者: ${companions.join(', ')}` : '',
        joiner ? `合流者: ${joiner}` : ''
      ].filter(Boolean).join('\n');

      let progressMsg = "申請内容を確認中…";
      await interaction.editReply({ content: progressMsg });

      let isTimeout = false;
      const timeoutPromise = new Promise(resolve => {
        setTimeout(() => {
          isTimeout = true;
          resolve({ approved: false, content: "システムが混雑しています。60秒以上応答がなかったため、タイムアウトとして処理を中断しました。" });
        }, 60000);
      });

      const inspectionPromise = (async () => {
        progressMsg = "申請内容のAI解析中…";
        await interaction.editReply({ content: progressMsg });
        let result;
        try {
          result = await runInspection(inputText, session);
        } catch (err) {
          console.error('[ERROR] runInspection:', err);
          result = { approved: false, content: '審査中にエラーが発生しました。' };
        }
        return result;
      })();

      let result = await Promise.race([timeoutPromise, inspectionPromise]);
      if (isTimeout) {
        await interaction.editReply({ content: "⏳ 60秒間応答がなかったため、処理をタイムアウトで中断しました。再度申請してください。" });
        session.logs.push(`[${nowJST()}] タイムアウトエラー`);
        return endSession(session.id, "タイムアウト");
      }

      // 合流者確認が必要な場合
      const joinData = typeof result.content === "object" ? result.content : {};
      if (result.approved && Array.isArray(joinData.joiners) && joinData.joinerDiscordIds?.length > 0) {
        session.data.applicantDiscordId = interaction.user.id;
        session.data.parsed = joinData;
        for (const discordId of joinData.joinerDiscordIds) {
          try {
            const user = await bot.users.fetch(discordId);
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`joinerResponse-yes-${session.id}`)
                .setLabel('はい')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`joinerResponse-no-${session.id}`)
                .setLabel('いいえ')
                .setStyle(ButtonStyle.Danger),
            );
            await user.send({
              content: `外務省入管局からの確認通知です。申請者 ${joinData.mcid} さんからあなたが国内で合流するユーザーである旨の申請がありました。この申請はお間違えございませんか？(心当たりがない場合は、「いいえ」をご選択ください。)`,
              components: [row]
            });
          } catch (e) {
            console.error(`[JoinerConfirm][Error] DM 送信失敗: ${discordId}`, e);
          }
        }
        session.data.joinerDiscordIds = joinData.joinerDiscordIds;
        await interaction.editReply({ content: '申請を受け付けました。しばらくお待ち下さい' });
        session.step = 'waitingJoiner';
        return;
      }

      // 承認・却下の処理
      let embedData = {};
      if (typeof result.content === "object") {
        embedData = result.content;
      } else {
        try {
          embedData = JSON.parse(result.content);
          const rawPeriod = embedData.period ?? embedData.期間;
          if (rawPeriod && (!embedData.start_datetime || !embedData.end_datetime)) {
            embedData.start_datetime = embedData.start_datetime || rawPeriod;
            embedData.end_datetime = embedData.end_datetime || rawPeriod;
          }
        } catch (e) {
          console.error("[ERROR] JSON parse failed:", e);
          embedData = {};
        }
      }

      const today = (new Date()).toISOString().slice(0, 10);
      const safeReplace = s => typeof s === "string" ? s.replace(/__TODAY__/g, today) : s;
      const companionStr = Array.isArray(embedData.companions) && embedData.companions.length > 0
        ? embedData.companions.map(c => typeof c === "string" ? c : c.mcid).filter(Boolean).join(", ")
        : "なし";
      const joinerStr = Array.isArray(embedData.joiners) && embedData.joiners.length > 0
        ? embedData.joiners.join(", ")
        : "なし";

      if (result.approved && Object.keys(embedData).length) {
        const fields = [
          { name: "申請者", value: embedData.mcid, inline: true },
          { name: "申請日", value: nowJST(), inline: true },
          { name: "入国目的", value: safeReplace(embedData.purpose), inline: true },
          { name: "入国期間", value: safeReplace(`${embedData.start_datetime} ～ ${embedData.end_datetime}`), inline: false },
          { name: "同行者", value: companionStr, inline: false },
          { name: "合流者", value: joinerStr, inline: false },
        ];
        const embed = new EmbedBuilder()
          .setTitle("一時入国審査結果")
          .setColor(0x3498db)
          .addFields(fields)
          .setDescription(
            "自動入国審査システムです。上記の通り申請されました\"__**一時入国審査**__\"について、審査が完了いたしましたので、以下の通り通知いたします。\n\n" +
            `> 審査結果：**承認**`
          )
          .addFields({
            name: "【留意事項】", value:
              "・在留期間の延長が予定される場合、速やかににこのチャンネルでお知らせください。但し、合計在留期間が31日を超える場合、新規に申請が必要です。\n" +
              "・入国が承認されている期間中、申請内容に誤りがあることが判明したり、異なる行為をした場合、又は、コムザール連邦共和国の法令に違反したり、行政省庁の指示に従わなかった場合は、**承認が取り消される**場合があります。\n" +
              "・入国中、あなたは[コムザール連邦共和国の明示する法令](https://comzer-gov.net/laws/) を理解したものと解釈され、これの不知を理由に抗弁することはできません。\n" +
              "・あなたがコムザール連邦共和国及び国民に対して損害を生じさせた場合、行政省庁は、あなたが在籍する国家に対して、相当の対応を行う可能性があります。\n" +
              "・あなたの入国関連情報は、その期間中、公表が不適切と判断される情報を除外した上で、コムザール連邦共和国国民に対して自動的に共有されます。\n\n" +
              "コムザール連邦共和国へようこそ。"
          });
        await interaction.editReply({ embeds: [embed] });

        const publishFields = [
          { name: "申請者", value: embedData.mcid, inline: true },
          { name: "国籍", value: embedData.nation, inline: true },
          { name: "申請日", value: nowJST(), inline: true },
          { name: "入国目的", value: safeReplace(embedData.purpose), inline: true },
          { name: "入国期間", value: safeReplace(`${embedData.start_datetime} ～ ${embedData.end_datetime}`), inline: false },
          { name: "同行者", value: companionStr, inline: false },
          { name: "合流者", value: joinerStr, inline: false },
        ];
        const publishEmbed = new EmbedBuilder()
          .setTitle("【一時入国審査に係る入国者の公示】")
          .addFields(publishFields)
          .setColor(0x27ae60)
          .setDescription("以下の外国籍プレイヤーの入国が承認された為、以下の通り公示いたします。(外務省入管部)");
        // debugCommand.isDebugMode の状態によって ID を切り替える
        const publishChannelId = debugCommand.isDebugMode 
          ? (config.debugChannelId || LOG_CHANNEL_ID) 
          : (config.publishChannelId || config.logChannelId || LOG_CHANNEL_ID);

        const publishChannel = bot.channels.cache.get(publishChannelId);

        if (publishChannel?.isTextBased()) {
          if (debugCommand.isDebugMode) {
          }
          await publishChannel.send({ embeds: [publishEmbed] });
        } else {
          console.error("公示用チャンネルが見つかりません。ID:", publishChannelId);
        }
        return endSession(session.id, "承認");
      } else {
        let details = "";
        if (Object.keys(embedData).length) {
          details =
            `申請者: ${embedData.mcid || "不明"}\n` +
            `国籍: ${embedData.nation || "不明"}\n` +
            `入国目的: ${embedData.purpose || "不明"}\n` +
            `入国期間: ${(embedData.start_datetime && embedData.end_datetime) ? `${embedData.start_datetime} ～ ${embedData.end_datetime}` : "不明"}\n` +
            `同行者: ${companionStr}\n` +
            `合流者: ${joinerStr}\n`;
        } else {
          details = `${inputText}`;
        }
        const reasonMsg = typeof result.content === "string"
          ? result.content
          : "申請内容に不備や却下条件があったため、審査が却下されました。";

        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("一時入国審査【却下】")
          .setDescription(
            `**申請が却下されました**\n\n【却下理由】\n${reasonMsg}\n\n【申請内容】\n${details}`
          )
          .setFooter({ text: "再申請の際は内容をよくご確認ください。" });

        await interaction.editReply({ embeds: [embed] });
        return endSession(session.id, "却下");
      }
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "その操作にはまだ対応していません。",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("❌ interactionCreate handler error:", error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "エラーが発生しました。",
          flags: 1 << 6,
        });
      } else {
        await interaction.reply({
          content: "エラーが発生しました。",
          flags: 1 << 6,
        });
      }
    } catch (notifyErr) {
      console.error("❌ Failed to send error notification:", notifyErr);
    }
  }
});

// 国民台帳同期
bot.on('guildMemberAdd', (m) => {
  syncMember(m).catch(e => console.error('[guildMemberAdd]', e.message));
});

bot.on('guildMemberUpdate', (oldM, newM) => {
  syncMember(newM).catch(e => console.error('[guildMemberUpdate]', e.message));
});

// ── メッセージ処理
bot.on('messageCreate', async m => {
  if (m.author.bot) return;
  messagelog(m, TICKET_CAT, bot);
  if (embedPost.isActive(m.channel.id, m.author.id)) {
    const member = m.member;
    let roleId = embedPost.getRoleId(m.channel.id, m.author.id);
    if (!roleId) {
      roleId = Object.keys(ROLE_CONFIG)
        .find(r => member.roles.cache.has(r));
    }
    if (roleId) {
      try {
        const hook = await getOrCreateHook(m.channel, roleId);
        const files = [...m.attachments.values()]
          .map(att => ({ attachment: att.url }));
        const firstImg = files.find(f =>
          /\.(png|jpe?g|gif|webp)$/i.test(f.attachment));

        await hook.send({
          embeds: [
            embedPost.makeEmbed(
              m.content || '(無言)',
              roleId,
              ROLE_CONFIG,
              firstImg?.attachment
            )
          ],
          files,
          allowedMentions: { users: [], roles: [roleId] },
        });

        await m.delete().catch(() => {});
      } catch (err) {
        console.error('[rolepost] resend error:', err);
      }
      return;
    }
  }

  if (m.content.trim() === ADMIN_KEYWORD) {
    const reportEmbed = new EmbedBuilder()
      .setTitle('管理レポート')
      .addFields(
        { name: '未完了セッション数', value: `${sessions.size}` },
      );
    return m.channel.send({ embeds: [reportEmbed] });
  }

  if (
    m.mentions.has(bot.user) &&
    String(m.channel.parentId) === String(TICKET_CAT) &&
    /ID:CAS/.test(m.content)
  ) {
    const session = startSession(m.channel.id, m.author.id);
    session.logs.push(`[${nowJST()}] セッション開始`);
    const introEmbed = new EmbedBuilder()
      .setTitle("自動入国審査システムです。")
      .setDescription(
        "こちらのチケットでは、旅行、取引、労働等を行うために一時的に入国を希望される方に対し、許可証を自動で発行しております。\n" +
        "審査は24時間365日いつでも受けられ、最短数分で許可証が発行されます。\n" +
        "以下の留意事項をよくお読みの上、次に進む場合は「進む」、申請を希望しない場合は「終了」をクリックしてください。"
      )
      .addFields({ name: '【留意事項】', value:
        "・入国が承認されている期間中、申告内容に誤りがあることが判明したり、[コムザール連邦共和国の明示する法令](https://comzer-gov.net/laws/) に違反した場合は承認が取り消されることがあります。\n" +
        "・法令の不知は理由に抗弁できません。\n" +
        "・損害を与えた場合、行政省庁は相当の対応を行う可能性があります。\n" +
        "・入国情報は適切な範囲で国民に共有されます。"
      });
    const introRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`start-${session.id}`).setLabel('進む').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancel-${session.id}`).setLabel('終了').setStyle(ButtonStyle.Danger)
    );
    return m.reply({ embeds: [introEmbed], components: [introRow] });
  }
});

bot.login(DISCORD_TOKEN);
