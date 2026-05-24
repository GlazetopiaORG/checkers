/**
 * Startup permissions check.
 *
 * Called once when the bot connects to Discord. Verifies that role-grant
 * will actually work BEFORE players start passing levels — much better
 * than discovering at first grant time that the role isn't reachable.
 *
 * Checks (in order):
 *   1. DISCORD_LEVEL_PASSED_ROLE_ID is set
 *   2. Guild exists and the bot is in it
 *   3. Bot has Manage Roles permission
 *   4. The target role exists in the guild
 *   5. Bot's top role sits ABOVE the target role in the hierarchy
 *
 * Each failure logs a clear warning with the exact misconfiguration so
 * an operator can fix it. Returns a structured result the caller can act
 * on (e.g. degrade gracefully or fail the boot).
 *
 * IMPORTANT: this does NOT crash the bot if checks fail. The bot still
 * accepts gameplay commands; role grants just won't work until the
 * config is fixed. That's intentional — losing the bot entirely is worse
 * than losing role grants.
 */

import type { Client } from 'discord.js';

import { getEnv } from './env';

export type PermissionsCheckResult =
  | { ok: true }
  | {
      ok: false;
      issue:
        | 'role-id-not-set'
        | 'guild-fetch-failed'
        | 'missing-manage-roles'
        | 'role-not-found'
        | 'hierarchy-blocked'
        | 'bot-member-fetch-failed';
      detail?: string;
    };

export async function verifyRolePermissions(
  client: Client,
): Promise<PermissionsCheckResult> {
  const env = getEnv();

  if (!env.DISCORD_LEVEL_PASSED_ROLE_ID) {
    // eslint-disable-next-line no-console
    console.warn(
      '[phase5-bot] DISCORD_LEVEL_PASSED_ROLE_ID is not set. Role grants ' +
        'will be refused until you configure this env var with a snowflake.',
    );
    return { ok: false, issue: 'role-id-not-set' };
  }

  let guild;
  try {
    guild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[phase5-bot] Could not fetch guild ${env.DISCORD_GUILD_ID}: ${detail}`,
    );
    return { ok: false, issue: 'guild-fetch-failed', detail };
  }

  let botMember;
  try {
    botMember = await guild.members.fetch(client.user!.id);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[phase5-bot] Could not fetch bot's own guild member: ${detail}`,
    );
    return { ok: false, issue: 'bot-member-fetch-failed', detail };
  }

  // Check Manage Roles permission.
  // discord.js exposes this as `permissions.has('ManageRoles')`.
  if (!botMember.permissions.has('ManageRoles')) {
    // eslint-disable-next-line no-console
    console.error(
      `[phase5-bot] Bot LACKS Manage Roles permission in guild ${env.DISCORD_GUILD_ID}. ` +
        'Add the permission via Server Settings → Roles → <bot role>.',
    );
    return { ok: false, issue: 'missing-manage-roles' };
  }

  // Verify role exists.
  let targetRole;
  try {
    targetRole = await guild.roles.fetch(env.DISCORD_LEVEL_PASSED_ROLE_ID);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[phase5-bot] Could not fetch target role ${env.DISCORD_LEVEL_PASSED_ROLE_ID}: ${detail}`,
    );
    return { ok: false, issue: 'role-not-found', detail };
  }
  if (!targetRole) {
    // eslint-disable-next-line no-console
    console.error(
      `[phase5-bot] Target role ${env.DISCORD_LEVEL_PASSED_ROLE_ID} ` +
        `not found in guild ${env.DISCORD_GUILD_ID}. Check the snowflake.`,
    );
    return { ok: false, issue: 'role-not-found' };
  }

  // Verify role hierarchy. The bot's HIGHEST role must be ABOVE the target.
  if (botMember.roles.highest.position <= targetRole.position) {
    const detail =
      `bot top role "${botMember.roles.highest.name}" ` +
      `is at position ${botMember.roles.highest.position}; ` +
      `target role "${targetRole.name}" is at position ${targetRole.position}`;
    // eslint-disable-next-line no-console
    console.error(
      `[phase5-bot] Role hierarchy BLOCKS role grants. ${detail}. ` +
        "Move the bot's role above the target role in Server Settings → Roles.",
    );
    return { ok: false, issue: 'hierarchy-blocked', detail };
  }

  // eslint-disable-next-line no-console
  console.log(
    `[phase5-bot] Permissions check OK. ` +
      `Bot top role "${botMember.roles.highest.name}" (pos ${botMember.roles.highest.position}) ` +
      `> target role "${targetRole.name}" (pos ${targetRole.position}).`,
  );
  return { ok: true };
}
