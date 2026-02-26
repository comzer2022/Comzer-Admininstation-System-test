import './utils/logger/index.js';
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { ROLE_CONFIG } from './config/roleConfig.js';
import { setupNotificationAPI } from './services/notificationqueue.js';
import { registerEventHandlers } from './handlers/eventhandlers.js'; 
import { initBlacklist } from './utils/blacklistManager.js';
import * as embedPost from './commands/embedPost.js';
import * as statusCommand from './commands/status.js';
import * as debugCommand from './commands/debug.js';
import { data as shutdownData, execute as shutdownExec } from './commands/shutdown.js';
import { data as startData, execute as startExec } from './commands/start.js';
import { data as infoData, execute as infoExecute } from './commands/info.js';
import { data as deleteRolepostData, execute as deleteRolepostExec } from './commands/deleteRolepost.js';
import * as deployCommand from './commands/deploy.js';

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

client.ROLE_CONFIG = ROLE_CONFIG;

client.commands = new Map([
  [embedPost.data.name,          embedPost],
  [statusCommand.data.name,      statusCommand],
  [shutdownData.name,            { data: shutdownData, execute: shutdownExec }],
  [startData.name,               { data: startData, execute: startExec }],
  [infoData.name,                { data: infoData, execute: infoExecute }],
  [debugCommand.data.name,       debugCommand],
  [deleteRolepostData.name,      { data: deleteRolepostData, execute: deleteRolepostExec }],
  [deployCommand.data.name,      deployCommand],
]);

registerEventHandlers(client);

const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

setupNotificationAPI(app, client);

app.get('/', (req, res) => res.send('OK'));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// initBlacklist を ready イベントで実行（eventHandlers.js の ready と共存）
client.once('ready', async () => {
  try {
    await initBlacklist();
    console.log('✅ Blacklist initialized');
  } catch (e) {
    console.error('[initBlacklist] 初期化失敗:', e);
  }
});

client.login(process.env.DISCORD_TOKEN);
