import { Client, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { BotConfig } from './infrastructure/config/BotConfig.js';
import { buildRoleConfig } from './infrastructure/config/RoleConfig.js';
import { ConsoleHooks } from './infrastructure/logger/ConsoleHooks.js';
import { DiscordWebhookLogSink } from './infrastructure/logger/DiscordWebhookLogSink.js';
import { GptExtractionClient } from './infrastructure/openai/GptExtractionClient.js';
import { MojangClient } from './infrastructure/minecraft/MojangClient.js';
import { PlayerDbClient } from './infrastructure/minecraft/PlayerDbClient.js';
import { BlacklistRepository } from './infrastructure/sheets/BlacklistRepository.js';
import { CzrBridgeClient } from './infrastructure/czrBridge/CzrBridgeClient.js';
import { JoinerMatchClient } from './infrastructure/czrBridge/JoinerMatchClient.js';
import { CitizenInfoClient } from './infrastructure/czrBridge/CitizenInfoClient.js';
import { WebhookManager } from './infrastructure/discord/WebhookManager.js';
import { KoyebClient } from './infrastructure/koyeb/KoyebClient.js';
import { InspectionOrchestrator } from './application/inspection/InspectionOrchestrator.js';
import { SessionLifecycleService } from './application/session/SessionLifecycleService.js';
import { BlacklistManagementService } from './application/blacklist/BlacklistManagementService.js';
import { RolePostService } from './application/rolepost/RolePostService.js';
import { MemberSyncService } from './application/citizenSync/MemberSyncService.js';
import { NotificationQueueService } from './application/notification/NotificationQueueService.js';
import { BotLifecycleService } from './application/ops/BotLifecycleService.js';
import { SelfCheckService } from './application/ops/SelfCheckService.js';
import { DebugModeState } from './application/ops/DebugModeState.js';
import { CommandRegistry } from './presentation/discord/commands/CommandRegistry.js';
import { RolepostCommand } from './presentation/discord/commands/RolepostCommand.js';
import { DeleteRolepostCommand } from './presentation/discord/commands/DeleteRolepostCommand.js';
import { InfoCommand } from './presentation/discord/commands/InfoCommand.js';
import { StatusCommand } from './presentation/discord/commands/StatusCommand.js';
import { DebugCommand } from './presentation/discord/commands/DebugCommand.js';
import { ShutdownCommand } from './presentation/discord/commands/ShutdownCommand.js';
import { StartCommand } from './presentation/discord/commands/StartCommand.js';
import { DeployCommand } from './presentation/discord/commands/DeployCommand.js';
import { AddCountryCommand } from './presentation/discord/commands/blacklist/AddCountryCommand.js';
import { RemoveCountryCommand } from './presentation/discord/commands/blacklist/RemoveCountryCommand.js';
import { AddPlayerCommand } from './presentation/discord/commands/blacklist/AddPlayerCommand.js';
import { RemovePlayerCommand } from './presentation/discord/commands/blacklist/RemovePlayerCommand.js';
import { ListBlacklistCommand } from './presentation/discord/commands/blacklist/ListBlacklistCommand.js';
import { SelectMenuHandler } from './presentation/discord/interactions/SelectMenuHandler.js';
import { ButtonInteractionHandler } from './presentation/discord/interactions/ButtonInteractionHandler.js';
import { ModalSubmitHandler } from './presentation/discord/interactions/ModalSubmitHandler.js';
import { JoinerResponseHandler } from './presentation/discord/interactions/JoinerResponseHandler.js';
import { MessageTriggerHandler } from './presentation/discord/interactions/MessageTriggerHandler.js';
import { InteractionRouter } from './presentation/discord/interactions/InteractionRouter.js';
import { EventRegistrar } from './presentation/discord/events/EventRegistrar.js';
import { NotifyApiRoute } from './presentation/http/NotifyApiRoute.js';
const config = new BotConfig();
const logSink = new DiscordWebhookLogSink(config);
new ConsoleHooks(logSink).initialize();
const gpt = new GptExtractionClient(config);
const mojang = new MojangClient();
const playerDb = new PlayerDbClient();
const blacklistRepo = new BlacklistRepository(config);
const czrBridge = new CzrBridgeClient(config);
const joinerMatch = new JoinerMatchClient(config);
const citizenInfo = new CitizenInfoClient(config);
const webhookManager = new WebhookManager();
const koyeb = new KoyebClient(config);
const inspection = new InspectionOrchestrator(gpt, mojang, playerDb, blacklistRepo, joinerMatch);
const sessions = new SessionLifecycleService(config);
const blacklistMgmt = new BlacklistManagementService(blacklistRepo, config);
const rolePost = new RolePostService();
const memberSync = new MemberSyncService(czrBridge, config);
const notificationQueue = new NotificationQueueService();
const lifecycle = new BotLifecycleService(koyeb);
const selfCheck = new SelfCheckService(czrBridge, blacklistRepo, mojang, playerDb);
const debugMode = new DebugModeState();
const registry = new CommandRegistry();
const rolepostCommand = new RolepostCommand(rolePost, config);
registry.register(rolepostCommand);
registry.register(new StatusCommand(selfCheck));
registry.register(new ShutdownCommand(lifecycle, config));
registry.register(new StartCommand(lifecycle, config));
registry.register(new InfoCommand(citizenInfo));
registry.register(new DebugCommand(debugMode));
registry.register(new DeleteRolepostCommand(config));
registry.register(new AddCountryCommand(blacklistMgmt));
registry.register(new RemoveCountryCommand(blacklistMgmt));
registry.register(new AddPlayerCommand(blacklistMgmt));
registry.register(new RemovePlayerCommand(blacklistMgmt));
registry.register(new ListBlacklistCommand(blacklistMgmt));
const deployCommand = new DeployCommand(registry, config);
registry.register(deployCommand);
const selectMenuHandler = new SelectMenuHandler(sessions);
const buttonHandler = new ButtonInteractionHandler(sessions);
const modalHandler = new ModalSubmitHandler(sessions, inspection, debugMode, config);
const joinerHandler = new JoinerResponseHandler(sessions, debugMode, config);
const messageTrigger = new MessageTriggerHandler(rolePost, sessions, webhookManager, config);
const interactionRouter = new InteractionRouter(registry, rolepostCommand, selectMenuHandler, buttonHandler, modalHandler, joinerHandler);
const eventRegistrar = new EventRegistrar(interactionRouter, messageTrigger, memberSync, sessions, selfCheck, config);
const notifyApiRoute = new NotifyApiRoute(notificationQueue, config);
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});
client.ROLE_CONFIG = buildRoleConfig(config);
eventRegistrar.register(client);
sessions.startTimeoutWatcher();
const app = express();
app.use(bodyParser.json());
notifyApiRoute.register(app, client);
app.get('/', (_req, res) => res.send('OK'));
app.listen(config.port, () => console.log(`Server listening on port ${config.port}`));
client.once('ready', async () => {
    try {
        await blacklistRepo.init();
        console.log('✅ Blacklist initialized');
    }
    catch (e) {
        console.error('[initBlacklist] 初期化失敗:', e);
    }
});
client.login(config.discordToken);
