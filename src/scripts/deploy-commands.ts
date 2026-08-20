import { REST, Routes } from 'discord.js';
import { APP_CONFIG } from '../infrastructure/config/AppConfigLoader.js';
import { BotConfig } from '../infrastructure/config/BotConfig.js';
import { RolepostCommand } from '../presentation/discord/commands/RolepostCommand.js';
import { StatusCommand } from '../presentation/discord/commands/StatusCommand.js';
import { ShutdownCommand } from '../presentation/discord/commands/ShutdownCommand.js';
import { StartCommand } from '../presentation/discord/commands/StartCommand.js';
import { InfoCommand } from '../presentation/discord/commands/InfoCommand.js';
import { DebugCommand } from '../presentation/discord/commands/DebugCommand.js';
import { DeleteRolepostCommand } from '../presentation/discord/commands/DeleteRolepostCommand.js';
import { DeployCommand } from '../presentation/discord/commands/DeployCommand.js';
import { CommandRegistry } from '../presentation/discord/commands/CommandRegistry.js';
import { AddCountryCommand } from '../presentation/discord/commands/blacklist/AddCountryCommand.js';
import { RemoveCountryCommand } from '../presentation/discord/commands/blacklist/RemoveCountryCommand.js';
import { AddPlayerCommand } from '../presentation/discord/commands/blacklist/AddPlayerCommand.js';
import { RemovePlayerCommand } from '../presentation/discord/commands/blacklist/RemovePlayerCommand.js';
import { ListBlacklistCommand } from '../presentation/discord/commands/blacklist/ListBlacklistCommand.js';
const config = new BotConfig();
const rest = new REST({ version: '10' }).setToken(config.discordToken as string);
const { clientId } = APP_CONFIG;
const registry = new CommandRegistry();
registry.register(new RolepostCommand(undefined as any, config));
registry.register(new StatusCommand(undefined as any));
registry.register(new ShutdownCommand(undefined as any, config));
registry.register(new StartCommand(undefined as any, config));
registry.register(new InfoCommand(undefined as any));
registry.register(new DebugCommand(undefined as any));
registry.register(new DeleteRolepostCommand(config));
registry.register(new AddCountryCommand(undefined as any));
registry.register(new RemoveCountryCommand(undefined as any));
registry.register(new AddPlayerCommand(undefined as any));
registry.register(new RemovePlayerCommand(undefined as any));
registry.register(new ListBlacklistCommand(undefined as any));
registry.register(new DeployCommand(registry, config));
(async () => {
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        const globalBody = registry.toDeployBody();
        console.log(`🔄 グローバルコマンドを登録中…`);
        const registered = (await rest.put(Routes.applicationCommands(clientId), {
            body: globalBody,
        })) as unknown[];
        console.log(`✅ グローバルコマンド登録完了: ${registered.length} 件`);
    }
    catch (err) {
        console.error('❌ コマンド登録エラー:', err);
    }
    finally {
        process.exit(0);
    }
})();
