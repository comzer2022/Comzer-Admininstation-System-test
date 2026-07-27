import type { RoleConfigMap } from '../config/roleConfig.js';
import type { BotCommand } from './commands.js';

declare module 'discord.js' {
  interface Client {
    /** config/roleConfig.js の ROLE_CONFIG。*/
    ROLE_CONFIG: RoleConfigMap;
    /** スラッシュコマンド名 → コマンドモジュールのマップ。 */
    commands: Map<string, BotCommand>;
  }
}
