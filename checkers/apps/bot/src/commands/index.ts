/**
 * Command registry.
 *
 * Exports:
 *   - commandPayloads:  JSON definitions for Discord registration
 *   - dispatch():       routes incoming interactions to the right handler
 */

import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

import { CooldownTracker } from '../lib/cooldown';
import { getEnv } from '../env';
import {
  checkersCommandData,
  makeCheckersHandler,
} from './checkers';
import {
  checkersStatusCommandData,
  handleCheckersStatus,
} from './checkers-status';

/**
 * JSON definitions exported for the register-commands script.
 * This is the only place that decides what commands the bot offers.
 */
export function commandPayloads(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [
    checkersCommandData.toJSON(),
    checkersStatusCommandData.toJSON(),
  ];
}

/**
 * Build a dispatcher closed over the shared cooldown tracker.
 * The bot's index.ts calls this once at startup and routes every
 * incoming ChatInputCommandInteraction through the returned function.
 */
export function makeDispatcher() {
  const env = getEnv();
  const cooldown = new CooldownTracker(env.BOT_COMMAND_COOLDOWN_SECONDS);
  const handleCheckers = makeCheckersHandler(cooldown);

  return async function dispatch(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    switch (interaction.commandName) {
      case 'checkers':
        await handleCheckers(interaction);
        return;
      case 'checkers-status':
        await handleCheckersStatus(interaction);
        return;
      default:
        // Unknown command — quietly reply with a generic message.
        await interaction.reply({
          content: 'Unknown command.',
          ephemeral: true,
        });
    }
  };
}
