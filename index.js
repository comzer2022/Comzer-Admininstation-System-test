import { createRequire } from "module";
const require = createRequire(import.meta.url);
import './logger.js';
const config = require("./config.json"); // JSONを require で読み込む方法 :contentReference[oaicite:1]{index=1}
import * as embedPost from './commands/embedPost.js';
import axios from "axios";
import http from "node:http";
import fetch from 'node-fetch';
import { extractionPrompt } from "./prompts.js";
import * as statusCommand from './commands/status.js';
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: ['CHANNEL']
});
client.login(process.env.DISCORD_TOKEN);

// ── 通知キュー関連 ──
const queue = [];
let processing = false;

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const item = queue.shift();
    try {
      const user = await client.users.fetch(item.discord_id);
      if (user) {
        // item.message はプレーン文字列またはオブジェクト（embeds 等）を想定
        await user.send(item.message);
      }
    } catch (err) {
      console.error('DM送信エラー:', err);
    }
    await new Promise(res => setTimeout(res, 1500)); // 1.5s throttle
  }

  processing = false;
}

// ── /api/notify ハンドラ（Bot側テンプレ化）────────
app.post('/api/notify', (req, res) => {
  // APIキーの検証
  if (!validateApiKey(req)) {
    return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
  }
  const data = req.body || {};
  try {
    console.log('通知受信:', JSON.stringify(data).slice(0, 1000));
  } catch (e) {
    console.log('通知受信: (non-serializable)');
  }

  const discordIdRaw = data.discord_id ?? data.discordId ?? data.discord ?? '';
  const discordId = String(discordIdRaw).trim();
  if (!discordId) {
    console.error('notify: missing discord_id', data);
    return res.status(400).json({ error: 'discord_id missing' });
  }

  const typeMap = {
    business_filing: '開業・廃業届',
    political_org_create: '政治団体設立申請',
    donation_report: '寄付申告',
    party_membership: '入党・離党届',
    party_create_dissolve: '結党・解党届',
    citizen_recommend: '新規国民推薦届',
    staff_appointment: '職員登用申請',
    registry_update: '国民登記情報修正申請'
  };

  const rawRequestName = String(data.request_name ?? data.requestName ?? '').trim();
  const translatedType = typeMap[rawRequestName] || rawRequestName || '—';
  const requestId = data.request_id ?? data.requestId ?? '—';
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

  queue.push({ discord_id: String(discordId), message });
  console.log(`notify: queued message for ${discordId} (request ${requestId})`);
  processQueue();

  return res.json({ status: 'queued' });
});
// ヘルスチェック
app.get('/', (req, res) => {
  console.log('[HEALTHZ] ping received');
  res.send('OK');
});
// ── Listen────────
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
 const HEALTHZ_URL = process.env.HEALTHZ_URL
   || (process.env.CZR_BASE
       ? `${process.env.CZR_BASE}/wp-json/czr-bridge/v1/healthz`
       : 'https://comzer-gov.net/wp-json/czr-bridge/v1/healthz');
const API_URL   = 'https://comzer-gov.net/wp-json/czr/v1/data-access'
const API_TOKEN = process.env.YOUR_SECRET_API_KEY;

// MySQL関連
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
const DIPLOMAT_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/5dwbifgYfsdWpZx/preview'; // ← 外務省アイコン URL
const MINISTER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/qGWt4rftd9ygKdi/preview'; // ← 閣僚議会議員アイコン URL
const EXAMINER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/NEsrzngYJEHZwTn/preview'; // ← 入国審査担当官アイコン URL
const COMZER_ICON_URL = 'https://www.comzer-gov.net/database/index.php/s/2DfeR3dTWdtCrgq/preview'; // ← 国旗アイコン URL
  
// 1. 環境変数からロールIDリストを取得（例: 閣僚・外交官どちらも）
const DIPLOMAT_ROLE_IDS = (process.env.ROLLID_DIPLOMAT || '').split(',').filter(Boolean);
const MINISTER_ROLE_IDS = (process.env.ROLLID_MINISTER || '').split(',').filter(Boolean);
const EXAMINER_ROLE_IDS = (process.env.EXAMINER_ROLE_IDS || '').split(',').filter(Boolean);

// 2. 各役職ロールごとの設定（ここに削除権限リストも入れる！）
const ROLE_CONFIG = {
  // ── 外交官ロールをまとめて
  ...Object.fromEntries(
    DIPLOMAT_ROLE_IDS.map(roleId => [ roleId, {
      embedName:   '外交官(外務省 総合外務部職員)',
      embedIcon:   DIPLOMAT_ICON_URL,
      webhookName: 'コムザール連邦共和国 外務省',
      webhookIcon: DIPLOMAT_ICON_URL,
      canDelete: [...DIPLOMAT_ROLE_IDS],  
    }])
  ),
  // ── 閣僚議会議員ロールをまとめて
  ...Object.fromEntries(
    MINISTER_ROLE_IDS.map(roleId => [ roleId, {
      embedName:   '閣僚議会議員',
      embedIcon:   MINISTER_ICON_URL,
      webhookName: 'コムザール連邦共和国 大統領府',
      webhookIcon: COMZER_ICON_URL,
      canDelete: [...MINISTER_ROLE_IDS], 
    }])
  ),
  // ── 入国審査担当官ロールをまとめて
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
    // embedName/embedIcon の内容を
    // 従来の name/icon プロパティとしても参照できるようにする
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

// ── タイムゾーン定義
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

// ── 合流者名簿用Googleシートの初期化
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
]);

// ── Botがログインして準備完了したら一度だけblacklistCommands.js側を初期化
bot.once("ready", async () => {
  console.log(`Logged in as ${bot.user.tag} | initializing blacklist…`);
  await initBlacklist();
  console.log("✅ Bot ready & blacklist initialized");

  try {
    // 初回フル同期（スロットルは環境変数・既定 700ms）
    await fullSync(bot, Number(process.env.CZR_THROTTLE_MS || 700));
  } catch (e) {
    console.error('[fullSync] 初回同期失敗:', e);
  }

  // 定期同期（既定 3h）
  const interval = Number(process.env.CZR_SYNC_INTERVAL_MS || 10800000);
  setInterval(() => {
    fullSync(bot).catch(err => console.error('[fullSync] 定期同期失敗:', err));
  }, interval);
});
// ── セッション管理
const sessions = new Map();
function startSession(channelId, userId) {
  const id = `${channelId}-${userId}-${Date.now()}`;
  sessions.set(id, { id, channelId, userId, step: 'version', data: {}, logs: [], lastAction: Date.now() });
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

// ステータスメッセージ更新＆診断時刻管理
setInterval(() => {
  const jstTime = new Date().toLocaleString("ja-JP", { hour12: false });
  bot.user.setActivity(
    `コムザール行政システム(CAS) 稼働中 | 診断:${jstTime}`,
    { type: ActivityType.Watching }
  );
  statusCommand.updateLastSelfCheck(); // ←最終診断時刻を更新
}, 30 * 60 * 1000);

// BOT起動直後にも初期化
bot.once("ready", () => {
  const jstTime = new Date().toLocaleString("ja-JP", { hour12: false });
  bot.user.setActivity(
    `コムザール行政システム稼働中 | 最新自己診断時刻:${jstTime}`,
    { type: ActivityType.Watching }
  );
  statusCommand.updateLastSelfCheck();
});

// タイムアウト監視 (10 分)
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
  // 1. GPTで整形
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

  // 2. ブラックリスト照合
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
  // セッション（引数session）に格納されたバージョン情報を使う
  // ない場合は"java"デフォルト
  const version = session?.data?.version || "java";
  const mcid = parsed.mcid.replace(/^BE_/, ""); // ユーザーがBE_付けてても外す

  const url = version === "java"
    ? `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(mcid)}`
    : `https://playerdb.co/api/player/xbox/${encodeURIComponent(mcid)}`;
  const resp = await axios.get(url, { validateStatus: () => true });
  exists = version === "java" ? resp.status === 200 : resp.data.success === true;
  } catch {}

  if (!exists) {
    return { approved: false, content: `申請者MCID「${parsed.mcid}」のアカウントチェックが出来ませんでした。綴りにお間違いはございませんか？` };
  }

  // 3. 同行者チェック（全員：同国籍のみ可・存在判定・ブラックリストも判定！）
  if (parsed.companions && Array.isArray(parsed.companions)) {
    parsed.companions = parsed.companions.map(c =>
      typeof c === "string" ? { mcid: c } : c
    );
  }
  if (parsed.companions && parsed.companions.length > 0) {
    for (const { mcid: companionId } of parsed.companions) {
      if (!companionId) continue;
      // ブラックリスト判定
      if (await isBlacklistedPlayer(companionId)) {
        return { approved: false, content: `同行者「${companionId}」は安全保障上の理由から入国を許可することができないため。` };
      }
      // Java/BE判定
      let version = session?.data?.version || "java";
      if (companionId.startsWith("BE_")) version = "bedrock";
      // "BE_"をAPI問い合わせ時には必ず外す
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
      // 国籍も主申請者と一致が必須（※ここはparsed.companionsにnationが入っていれば比較）
      if (companionId.nation && companionId.nation !== parsed.nation) {
        return { approved: false, content: `同行者「${companionId}」は申請者と国籍が異なるため承認できません。国籍が異なる場合、それぞれご申告ください。` };
      }
    }
  }

  // 4. 合流者チェック
  if (parsed.joiners && parsed.joiners.length > 0) {
  // ① 配列チェック
  const joinerList = parsed.joiners;
  console.log("[JoinerCheck] joinerList:", joinerList);
  console.log("[JoinerCheck] Sending Authorization:", `Bearer ${API_TOKEN}`);

  // ② WordPress プラグインに問い合わせ
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

  // ③ レスポンスをパース
  const data = await res.json().catch(() => ({}));
  console.log(
    "[JoinerCheck] data.discord_ids:",
    JSON.stringify(data.discord_ids, null, 2)
  );

  // ④ エラー時はリターン
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

  // ⑤ 成功時は Discord ID リストを構築しつつ、過程をログ
  parsed.joinerDiscordIds = joinerList
    .map(j => {
      const raw = j.trim();
      const key = raw.normalize("NFKC");  // PHP 側が raw キーを使う場合
      const id  = data.discord_ids?.[key];
      if (!id) {
        console.warn(`[JoinerCheck][Warn] raw "${raw}" が discord_ids のキーになっていません`);
      } else {
        console.log(`[JoinerCheck] raw "${raw}" → ID ${id}`);
      }
      return id;
    })
    .filter(Boolean);

  // ⑥ 最終的な ID リスト
  console.log("[JoinerCheck] parsed.joinerDiscordIds:", parsed.joinerDiscordIds);
}

  // 5. 審査ルール（例：期間チェックなど、自由に追加！）
  // 例: 期間が31日超えなら却下など（例示・要件に合わせて変更可）
  const start = new Date(parsed.start_datetime);
  const end = new Date(parsed.end_datetime);
  const periodHours = (end - start) / (1000 * 60 * 60);
  if (periodHours > 24*31) {
    return { approved: false, content: "申請期間が長すぎるため却下します（申請期間が31日を超える場合、31日で申請後、申請が切れる前に再審査をお願いいたします。）" };
  }
  // 必須項目チェック
  if (!parsed.mcid || !parsed.nation || !parsed.purpose || !parsed.start_datetime || !parsed.end_datetime) {
    return { approved: false, content: "申請情報に不足があります。全項目を入力してください。" };
  }

  // 6. 承認
  // 承認時に内容を2段組で返す用にパースデータも一緒に返す
  return { approved: true, content: parsed };
}

// ── コンポーネント応答ハンドラ
bot.on('interactionCreate', async interaction => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChatInputCommand()) return;
  if (interaction.isButton() && interaction.customId.startsWith('joinerResponse-')) {
    const parts     = interaction.customId.split('-');
    const answer    = parts[1];
    const sessionId = parts.slice(2).join('-');  // join で元の session.id を復元
    const session = sessions.get(sessionId);
    if (!session) {
      return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
    }
    // ログに記録
    session.logs.push(`[${nowJST()}] 合流者回答: ${interaction.user.id} → ${answer}`);

    // 回答を格納
    session.data.joinerResponses = session.data.joinerResponses || {};
    session.data.joinerResponses[interaction.user.id] = answer;

    await interaction.reply({ content: '回答ありがとうございました。', ephemeral: true });

    // すべての合流者から回答が揃ったかチェック
    const expectCount = (session.data.joinerDiscordIds || []).length;
    const gotCount    = Object.keys(session.data.joinerResponses).length;
    if (gotCount === expectCount) {
    // 一人でも「no」があれば却下、それ以外は承認
      const anyNo = Object.values(session.data.joinerResponses).includes('no');
      const targetChannel = await bot.channels.fetch(session.channelId);
      if (!targetChannel?.isTextBased()) return endSession(session.id, anyNo ? '却下' : '承認');
      const applicantMention = session.data.applicantDiscordId
        ? `<@${session.data.applicantDiscordId}> `
        : '';
      
      if (anyNo) {
        // 却下時
        const parsed = session.data.parsed;
        const companionStr = Array.isArray(parsed.companions) && parsed.companions.length > 0
          ? parsed.companions.map(c => typeof c === 'string' ? c : c.mcid).join(', ')
          : 'なし';
        const joinerStr = Array.isArray(parsed.joiners) && parsed.joiners.length > 0
          ? parsed.joiners.join(', ')
          : 'なし';
        const reasonMsg = "合流者が申請を承認しませんでした。合流者は正しいですか？"
        const formattedLog = session.logs.find(log => log.includes('整形結果'));
        // --- デバッグ出力 ---
        console.log('[DEBUG] joinerResponse Handler parsed:', parsed);
        console.log('[DEBUG] parsed.mcid:', parsed.mcid);
        console.log('[DEBUG] parsed.nation:', parsed.nation);
        console.log('[DEBUG] parsed.start_datetime:', parsed.start_datetime);
        console.log('[DEBUG] parsed.end_datetime:', parsed.end_datetime);
        console.log('[DEBUG] companionStr:', companionStr);
        console.log('[DEBUG] joinerStr:', joinerStr);
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
        // 承認時
        const parsed = session.data.parsed;
        const companionStr = Array.isArray(parsed.companions) && parsed.companions.length > 0
          ? parsed.companions.map(c => typeof c === 'string' ? c : c.mcid).join(', ')
          : 'なし';
        const joinerStr = Array.isArray(parsed.joiners) && parsed.joiners.length > 0
          ? parsed.joiners.join(', ')
          : 'なし';
        // --- デバッグ出力 ---
        console.log('[DEBUG] joinerResponse Handler parsed:', parsed);
        console.log('[DEBUG] parsed.mcid:', parsed.mcid);
        console.log('[DEBUG] parsed.nation:', parsed.nation);
        console.log('[DEBUG] parsed.start_datetime:', parsed.start_datetime);
        console.log('[DEBUG] parsed.end_datetime:', parsed.end_datetime);
        console.log('[DEBUG] companionStr:', companionStr);
        console.log('[DEBUG] joinerStr:', joinerStr);
        
        const fields = [
          { name: "申請者",   value: parsed.mcid,                                         inline: true },
          { name: "国籍",     value: parsed.nation,                                      inline: true },
          { name: "申請日",   value: nowJST(),                                            inline: true },
          { name: "入国目的", value: parsed.purpose,                                     inline: true },
          { name: "入国期間", value: `${parsed.start_datetime} ～ ${parsed.end_datetime}`, inline: false },
          { name: "同行者",   value: companionStr || "なし",                            inline: false },
          { name: "合流者",   value: joinerStr   || "なし",                            inline: false },
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
  return endSession(session.id, '承認');
}
    }
    return;
  }

  // -- 修正確認用ハンドラ --
if (interaction.isButton() && interaction.customId.startsWith('editConfirm-')) {
  const parts = interaction.customId.split('-');
  const action = parts[1]; // 'yes' または 'no'
  const sessionId = parts.slice(2).join('-');
  const session = sessions.get(sessionId);
  if (!session) {
    return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
  }
  session.lastAction = Date.now();
  session.logs.push(`[${nowJST()}] 修正確認応答: ${interaction.user.id} → ${action}`);

  if (action === 'yes') {
    // データを初期化して version 選択から再開
    session.data = {}; // 必要なら保持したいフィールドをここで残す
    session.step = 'version';
    const row = new ActionRowBuilder().addComponents(
      new SelectMenuBuilder()
        .setCustomId(`version-${session.id}`)
        .setPlaceholder('どちらのゲームエディションですか？')
        .addOptions([
          { label: 'Java', value: 'java' },
          { label: 'Bedrock', value: 'bedrock' },
        ])
    );
    return interaction.update({
      content: 'ゲームエディションを選択してください。',
      components: [row]
    });
  } else {
    // no
  session.logs.push(`[${nowJST()}] 修正取消`);
  session.step = 'confirm';

  const sd = session.data || {};
  const version = sd.version || '未設定';
  const mcid = sd.mcid || '未設定';
  const nation = sd.nation || '未設定';
  const period = sd.period || '未設定';
  const companions = (sd.companions && sd.companions.length > 0)
    ? sd.companions.join(', ')
    : 'なし';
  const joiner = sd.joiner || 'なし'
  const summary = [
    `ゲームバージョン: ${version}`,
    `MCID: ${mcid}`,
    `国籍: ${nation}`,
    `期間: ${period}`,
    `同行者: ${companions}`,
    `合流者: ${joiner}`
  ].join('\n');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm-${session.id}`).setLabel('確定').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`edit-${session.id}`).setLabel('修正').setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({
    content: `以下の内容で審査を実行しますか？\n${summary}`,
    components: [row]
  });
}
}

  if (interaction.isButton()) {
    const id = interaction.customId ?? "";
    // 「プレフィックス-セッションID」という形式でないものはスキップ
    if (!/^(start|cancel|confirm|edit)-/.test(id)) {
      return;
    }
  }
  try {
    // ① SelectMenuの処理（ON/OFF 切り替え）
   if (
     interaction.isStringSelectMenu() &&
     interaction.customId.startsWith('rolepost-choose-')
   ) {
      const roleId = interaction.values[0];
      embedPost.setActive(interaction.channelId, interaction.user.id, roleId);
      await interaction.update({
        content: `役職発言モードを **ON** にしました。（${ROLE_CONFIG[roleId].embedName}）`,
        components: [],
      });
      return;
    }
    
    // ① Chat-Input（Slash）コマンドのハンドル
if (interaction.isChatInputCommand()) {
  const cmd = bot.commands.get(interaction.commandName);
  if (cmd) {
    await cmd.execute(interaction);
    return;
  }
}
    // ② 既存の SlashCommand／Button の処理
    const handled = await handleCommands(interaction);
    if (handled) return;
  
      // DEBUG出力は省略可
      console.log(
        `[DEBUG] interactionCreate: type=${interaction.type}, ` +
        `isSelectMenu=${interaction.isStringSelectMenu?.()}, ` +
        `isButton=${interaction.isButton?.()}, customId=${interaction.customId}`
      );
  
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
          const row = new ActionRowBuilder().addComponents(
            new SelectMenuBuilder()
              .setCustomId(`version-${session.id}`)
              .setPlaceholder('どちらのゲームエディションですか？')
              .addOptions([
                { label: 'Java', value: 'java' },
                { label: 'Bedrock', value: 'bedrock' },
              ])
          );
          return interaction.update({ content: 'ゲームエディションを選択してください。', components: [row] });
        }
  
        if (type === 'cancel') {
          session.logs.push(`[${nowJST()}] ユーザーが途中キャンセル`);
          await interaction.update({ content: '申請をキャンセルしました。', components: [] });
          return endSession(session.id, 'キャンセル');
        }
  
        // 確定ボタン押下後の処理
        if (type === 'confirm') {
          await interaction.deferReply();
          session.logs.push(`[${nowJST()}] 確定ボタン押下`);
          const inputText = [
            `MCID: ${session.data.mcid}`,
            `国籍: ${session.data.nation}`,
            `目的・期間: ${session.data.period}`,
            session.data.companions && session.data.companions.length > 0
              ? `同行者: ${session.data.companions.join(', ')}`
              : '',
            session.data.joiner ? `合流者: ${session.data.joiner}` : ''
          ].filter(Boolean).join('\n');
        
          // --- 進捗メッセージ用 ---
          let progressMsg = "申請内容を確認中…";
          await interaction.editReply({ content: progressMsg, components: [] });
        
          let isTimeout = false;
          // タイムアウト監視Promise
          const timeoutPromise = new Promise(resolve => {
            setTimeout(() => {
              isTimeout = true;
              resolve({ approved: false, content: "システムが混雑しています。60秒以上応答がなかったため、タイムアウトとして処理を中断しました。" });
            }, 60000); // 60秒
          });
        
          // runInspection実行Promise
          const inspectionPromise = (async () => {
            // 進捗1
            progressMsg = "申請内容のAI解析中…";
            await interaction.editReply({ content: progressMsg, components: [] });
            let result;
            try {
              result = await runInspection(inputText, session, async (step) => {
                // オプション：進捗コールバック（runInspectionから途中経過通知が欲しい場合）
                progressMsg = step;
                await interaction.editReply({ content: progressMsg, components: [] });
              });
            } catch (err) {
              console.error('[ERROR] runInspection:', err);
              result = { approved: false, content: '審査中にエラーが発生しました。' };
            }
            return result;
          })();
        
          // どちらか早い方
          let result = await Promise.race([timeoutPromise, inspectionPromise]);
          if (isTimeout) {
            await interaction.editReply({ content: "⏳ 60秒間応答がなかったため、処理をタイムアウトで中断しました。再度申請してください。", components: [] });
            session.logs.push(`[${nowJST()}] タイムアウトエラー`);
            return endSession(session.id, "タイムアウト");
          }
          
          // ── ここで合流者がいる場合は確認DMを送り、申請者には仮応答して一時停止 ─────────
          const joinData = typeof result.content === "object" ? result.content : {};
          if (result.approved && Array.isArray(joinData.joiners) && joinData.joinerDiscordIds?.length > 0) {
            // 1) 国民（合流者）へ DM
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
            // 2) 申請者への仮応答
            session.data.joinerDiscordIds = joinData.joinerDiscordIds;
            await interaction.editReply({
              content: '申請を受け付けました。しばらくお待ち下さい',
              components: []
            });
            session.step = 'waitingJoiner';
            // セッションはまだ保持 => endSession しない
            return;
          }

          // --- Embed通知（承認／却下どちらもこの中で処理！）---
          let embedData = {};
          if (typeof result.content === "object") {
            embedData = result.content;
          } else {
            try {
              embedData = JSON.parse(result.content);
              const rawPeriod = embedData.period ?? embedData.期間;
              if (rawPeriod && (!embedData.start_datetime || !embedData.end_datetime)) {
                embedData.start_datetime = embedData.start_datetime || rawPeriod;
                embedData.end_datetime   = embedData.end_datetime   || rawPeriod;
                }
            } catch (e) {
              console.error("[ERROR] JSON parse failed:", e);
              embedData = {};
            }
          }
          const today = (new Date()).toISOString().slice(0, 10);
          const safeReplace = s => typeof s === "string" ? s.replace(/__TODAY__/g, today) : s;
          const companionStr =
            Array.isArray(embedData.companions) && embedData.companions.length > 0
              ? embedData.companions.map(c => typeof c === "string" ? c : c.mcid).filter(Boolean).join(", ")
              : "なし";
          const joinerStr =
            Array.isArray(embedData.joiners) && embedData.joiners.length > 0
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
                await interaction.editReply({ embeds: [embed], components: [] });
              
                // ---- 公示用Embed転記 ----
                const publishFields = [
                  { name: "申請者", value: embedData.mcid, inline: true },
                  { name: "国籍", value: embedData.nation, inline: true },  // ←ここを追加
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
              
                // 公示用チャンネル取得（config.json/LOG_CHANNEL_IDどちらでも可）
                const publishChannelId = config.publishChannelId || config.logChannelId || LOG_CHANNEL_ID;
                const publishChannel = bot.channels.cache.get(publishChannelId);
                if (publishChannel?.isTextBased()) {
                  await publishChannel.send({ embeds: [publishEmbed] });
                } else {
                  console.error("公示用チャンネルが見つかりません。ID:", publishChannelId);
                }
              
                return endSession(session.id, "承認");
              }              
           else {
            // --- 却下時 ---
            let details = "";
             console.log(
               "[DEBUG] 審査データ:\n" +
               `申請者: ${embedData.mcid || "不明"}\n` +
               `国籍: ${embedData.nation || "不明"}\n` +
               `入国目的: ${embedData.purpose || "不明"}\n` +
               `入国期間: ${(embedData.start_datetime && embedData.end_datetime) ? `${embedData.start_datetime} ～ ${embedData.end_datetime}` : "不明"}\n` +
               `同行者: ${companionStr}\n` +
               `合流者: ${joinerStr}\n`
             );
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
            const reasonMsg =
              typeof result.content === "string"
                ? result.content
                : "申請内容に不備や却下条件があったため、審査が却下されました。";
  
            const embed = new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("一時入国審査【却下】")
              .setDescription(
                `**申請が却下されました**\n\n【却下理由】\n${reasonMsg}\n\n【申請内容】\n${details}`
              )
              .setFooter({ text: "再申請の際は内容をよくご確認ください。" });
  
            await interaction.editReply({ embeds: [embed], components: [] });
            return endSession(session.id, "却下");
          }
        } // ←このifブロック、ここで終わり！
        if (type === 'edit') {
  session.logs.push(`[${nowJST()}] 修正ボタン押下（確認表示）`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`editConfirm-yes-${session.id}`)
      .setLabel('はい')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`editConfirm-no-${session.id}`)
      .setLabel('いいえ')
      .setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({
    content: '申請内容を修正しますか？（ゲームエディションの選択から再開します）',
    components: [row]
  });
  return;
}

      } // ←このif(interaction.isButton())ブロック、ここで終わり！
  
      // --- セレクトメニュー処理 ---
      if (interaction.isStringSelectMenu()) {
          if (interaction.customId.startsWith('rolepost-choose-')) {
    return;
  }
        const parts = interaction.customId.split('-');
        const type = parts[0];
        const sessionId = parts.slice(1).join('-');
        const session = sessions.get(sessionId);
        if (!session) {
          console.error('[WARN] invalid sessionId:', sessionId);
          return;
        }
  
        session.lastAction = Date.now();
  
        if (type === 'version') {
          session.data.version = interaction.values[0];
        session.logs.push(`[${nowJST()}] 版選択: ${interaction.values[0]}`);
        session.step = 'mcid';
        // 元のメッセージは編集してコンポーネントを消す（ユーザーが再選択できないように）
        await interaction.message.delete();
        // その後、新しいメッセージを投稿
        await interaction.followUp({
          content: 'MCID又はゲームタグを入力してください。("BE_"を付ける必要はありません。)'
        });
        return
      }
      }
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "その操作にはまだ対応していません。",
        ephemeral: true,
      });
    }
        } catch (error) {
          // ── try ブロックをここで閉じる ↑↑↑
          console.error("❌ interactionCreate handler error:", error);
          // エラー通知は reply⇔followUp を振り分け
          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.followUp({
                content: "エラーが発生しました。",
                flags: 1 << 6, // Ephemeral
              });
            } else {
              await interaction.reply({
                content: "エラーが発生しました。",
                flags: 1 << 6,
              });
            }
            return true;
          } catch (notifyErr) {
            console.error("❌ Failed to send error notification:", notifyErr);
          }
        }
      });
// 国民台帳同期システム2
bot.on('guildMemberAdd', (m) => {
  syncMember(m).catch(e => console.error('[guildMemberAdd]', e.message));
});

bot.on('guildMemberUpdate', (oldM, newM) => {
  syncMember(newM).catch(e => console.error('[guildMemberUpdate]', e.message));
});

// ── メッセージ処理ハンドラ
bot.on('messageCreate', async m => {
  if (m.author.bot) return;

   if (embedPost.isActive(m.channel.id, m.author.id)) {
    const member = m.member;
     
  // ドロップダウンで保存された roleId を最優先
  let roleId = embedPost.getRoleId(m.channel.id, m.author.id);
  // state がなければ、メンバーのロール一覧からフォールバック
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
  console.log('parentId:', m.channel.parentId, '（型：', typeof m.channel.parentId, '）');
  console.log('TICKET_CAT:', TICKET_CAT, '（型：', typeof TICKET_CAT, '）');
  console.log('mentions.has(bot.user):', m.mentions.has(bot.user));
  console.log('authorId:', m.author?.id);
  console.log('channelId:', m.channel?.id, 'channelName:', m.channel?.name);
  console.log('content:', m.content);

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

  // －－メッセージハンドラ
  for (const session of sessions.values()) {
    if (session.channelId === m.channel.id && session.userId === m.author.id) {
      session.lastAction = Date.now();
      if (session.step === 'mcid') {
        session.data.mcid = m.content.trim();
        session.logs.push(`[${nowJST()}] MCID入力: ${session.data.mcid}`);
        session.step = 'nation';
        return m.reply('国籍を入力してください。');
      }
      if (session.step === 'nation') {
        const raw = m.content.trim();
        session.data.nation = raw;
        session.logs.push(`[${nowJST()}] 国籍入力: ${session.data.nation}`);
        session.step = 'period';
        return m.reply('一時入国期間と目的を入力してください。（例: 観光で10日間）');
}
      if (session.step === 'period') {
        session.data.period = m.content.trim();
        session.logs.push(`[${nowJST()}] 期間・目的入力: ${session.data.period}`);
        session.step = 'companions';  // ←ここでcompanionsに遷移！
        return m.reply('同じ国籍で同行者がいる場合、MCIDをカンマ区切りで入力してください（例:user1,BE_user2）。いなければ「なし」と入力してください。');
      }

      if (session.step === 'companions') {
        const comp = m.content.trim();
        if (comp === 'なし' || comp === 'ナシ' || comp.toLowerCase() === 'none') {
          session.data.companions = [];
        } else {
          session.data.companions = comp.split(',').map(x => x.trim()).filter(Boolean);
        }
        session.logs.push(`[${nowJST()}] 同行者入力: ${comp}`);
        session.step = 'joiner';
        return m.reply('コムザール連邦共和国に国籍を有する者で、入国後合流者がいる場合はお名前(MCID,DIscordID等)を、いなければ「なし」と入力してください。');
      }
      if (session.step === 'joiner') {
        session.data.joiner = m.content.trim() !== 'なし' ? m.content.trim() : null;
        session.logs.push(`[${nowJST()}] 合流者入力: ${session.data.joiner || 'なし'}`);
        session.step = 'confirm';
        const summary = [
          `ゲームバージョン: ${session.data.version}`,
          `MCID: ${session.data.mcid}`,
          `国籍: ${session.data.nation}`,
          `期間: ${session.data.period}`,
          `同行者: ${session.data.companions && session.data.companions.length > 0 ? session.data.companions.join(', ') : 'なし'}`,
          `合流者: ${session.data.joiner || 'なし'}`
        ].join('\n');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`confirm-${session.id}`).setLabel('確定').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`edit-${session.id}`).setLabel('修正').setStyle(ButtonStyle.Secondary)
        );
        return m.reply({ content: `以下の内容で審査を実行しますか？\n${summary}`, components: [row] });
      }      
    }
  }
});

// ── Bot 起動
bot.login(DISCORD_TOKEN);
