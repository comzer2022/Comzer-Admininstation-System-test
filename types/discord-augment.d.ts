import type { RoleConfigMap } from '../config/roleConfig.js';
import type { BotCommand } from './commands.js';

declare module 'discord.js' {
  interface Client {
    /** config/roleConfig.js の ROLE_CONFIG。index.js で client にアタッチされる */
    ROLE_CONFIG: RoleConfigMap;
    /** スラッシュコマンド名 → コマンドモジュールのマップ。index.js で client にアタッチされる */
    commands: Map<string, BotCommand>;
  }
}
