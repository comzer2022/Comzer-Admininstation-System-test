import type { Interaction } from 'discord.js';
import * as addCountry from './addCountry.js';
import * as removeCountry from './removeCountry.js';
import * as addPlayer from './addPlayer.js';
import * as removePlayer from './removePlayer.js';
import * as listBlacklist from './listBlacklist.js';
import type { SlashCommandLike } from '../../types/commands.js';

export const commands: SlashCommandLike[] = [
  addCountry.data,
  removeCountry.data,
  addPlayer.data,
  removePlayer.data,
  listBlacklist.data,
];

export async function handleCommands(interaction: Interaction): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;

  const commandName = interaction.commandName;

  switch (commandName) {
    case 'add_country':
      await addCountry.execute(interaction);
      return true;
    case 'remove_country':
      await removeCountry.execute(interaction);
      return true;
    case 'add_player':
      await addPlayer.execute(interaction);
      return true;
    case 'remove_player':
      await removePlayer.execute(interaction);
      return true;
    case 'list_blacklist':
      await listBlacklist.execute(interaction);
      return true;
    default:
      return false;
  }
}
