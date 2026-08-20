import type { RoleConfigMap } from '../../../infrastructure/config/RoleConfig.js';
import type { BotCommand } from './BotCommand.js';
declare module 'discord.js' {
    interface Client {
        ROLE_CONFIG: RoleConfigMap;
        commands: Map<string, BotCommand>;
    }
}
