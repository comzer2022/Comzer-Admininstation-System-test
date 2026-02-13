// index.js - エントリーポイント
import './utils/logger/index.js';
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { ROLE_CONFIG } from './config/roleConfig.js';
import { setupNotificationAPI } from './services/notificationQueue.js';
import { registerEventHandlers } from './handlers/eventHandlers.js';
import { initBlacklist } from './utils/blacklistManager.js';
import * as embedPost from './commands/embedPost.js';
import * as statusCommand from './commands/status.js';
import * as debugCommand from './commands/debug.js';
import { data as shutdownData, execute as shutdownExec } from './commands/shutdown.js';
import { data as infoData, execute as infoExecute } from './commands/info.js';
import { data as deleteRolepostData, execute as deleteRolepostExec } from './commands/deleteRolepost.js';

// Discord client 初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: ['CHANNEL']
});

// ROLE_CONFIGをclientに追加
client.ROLE_CONFIG = ROLE_CONFIG;

// コマンド登録
client.commands = new Map([
  [embedPost.data.name, embedPost],
  [statusCommand.data.name, statusCommand],
  [shutdownData.name, { data: shutdownData, execute: shutdownExec }],
  [infoData.name, { data: infoData, execute: infoExecute }],
  [debugCommand.data.name, debugCommand],
  [deleteRolepostData.name, { data: deleteRolepostData, execute: deleteRolepostExec }],
]);

// イベントハンドラー登録
registerEventHandlers(client);

// Express API セットアップ
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

// 通知API設定
setupNotificationAPI(app, client);

// ヘルスチェック
app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Bot起動
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await initBlacklist();
  console.log('✅ Bot ready & blacklist initialized');
});

client.login(process.env.DISCORD_TOKEN);
