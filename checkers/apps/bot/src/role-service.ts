/**
 * Role service — grants the level-passed role on Discord.
 *
 * This is the only module that calls discord.js role-modification APIs.
 * Keeping it isolated makes testing easier (mock the Client) and makes
 * the security boundary explicit: only this file can change roles, and
 * only via the function below.
 *
 * Behavior:
 *   - Fetches the guild member by Discord ID
 *   - Checks whether they already have the role (idempotent)
 *   - If not, adds the role with an audit-log reason
 *   - Returns a structured result; the HTTP server logs it
 *
 * The function does NOT throw on Discord errors — it catches and
 * returns a failure result. The HTTP server can then respond 200 with
 * `{ granted: false, reason: ... }` and the web backend logs.
 *
 * Failure modes covered:
 *   - Member not in guild (left server, never joined)
 *   - Bot lacks Manage Roles
 *   - Role hierarchy: bot's top role isn't above the target role
 *   - Network / discord.js exception
 */

import type { Client } from 'discord.js';

export type GrantResult =
  | { granted: true; reason: 'newly-added' }
  | { granted: false; reason: 'already-has-role' }
  | {
      granted: false;
      reason:
        | 'member-not-found'
        | 'role-not-found'
        | 'permission-denied'
        | 'hierarchy-blocked'
        | 'discord-error';
      detail?: string;
    };

export interface GrantParams {
  client: Client;
  guildId: string;
  roleId: string;
  discordId: string;
  /** Included in the Discord audit-log "reason" string. */
  opponentType: 'sheriff' | 'unbaked';
  marksTotal: number;
  marksRequired: number;
}

export async function grantLevelPassedRole(
  params: GrantParams,
): Promise<GrantResult> {
  const { client, guildId, roleId, discordId, opponentType, marksTotal, marksRequired } = params;

  // --- Fetch the guild ----------------------------------------------------
  let guild;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch (err) {
    return {
      granted: false,
      reason: 'discord-error',
      detail: `guild fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // --- Fetch the member ---------------------------------------------------
  let member;
  try {
    member = await guild.members.fetch(discordId);
  } catch (err) {
    // discord.js throws a DiscordAPIError with code 10007 ("Unknown Member")
    // when the user isn't in the guild. We catch broadly because the
    // exact error shape varies between discord.js versions.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('10007') || msg.toLowerCase().includes('unknown member')) {
      return { granted: false, reason: 'member-not-found' };
    }
    return {
      granted: false,
      reason: 'discord-error',
      detail: `member fetch failed: ${msg}`,
    };
  }

  // --- Resolve the role to verify it exists --------------------------------
  let targetRole;
  try {
    targetRole = await guild.roles.fetch(roleId);
  } catch (err) {
    return {
      granted: false,
      reason: 'discord-error',
      detail: `role fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!targetRole) {
    return { granted: false, reason: 'role-not-found' };
  }

  // --- Idempotency: already has it? ---------------------------------------
  if (member.roles.cache.has(roleId)) {
    return { granted: false, reason: 'already-has-role' };
  }

  // --- Hierarchy check: bot's top role must outrank the target ------------
  // We do this proactively to give a clear log instead of a generic
  // 50013 "missing permissions" error from Discord.
  try {
    const botMember = await guild.members.fetch(client.user!.id);
    if (botMember.roles.highest.position <= targetRole.position) {
      return {
        granted: false,
        reason: 'hierarchy-blocked',
        detail: `bot top role position=${botMember.roles.highest.position} ` +
          `target=${targetRole.position}`,
      };
    }
  } catch (err) {
    // If we can't fetch the bot's own member, surface as discord-error
    // rather than silently letting roles.add() fail later.
    return {
      granted: false,
      reason: 'discord-error',
      detail: `bot member fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // --- The actual grant ---------------------------------------------------
  // The audit-log reason makes the Phase 5 origin obvious to server admins
  // when they review role-change history in Discord.
  const auditReason =
    `[Glazetopia Checkers] ${opponentType} path passed (${marksTotal}/${marksRequired})`;
  try {
    await member.roles.add(roleId, auditReason);
    return { granted: true, reason: 'newly-added' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 50013 = Missing Permissions, 50001 = Missing Access
    if (msg.includes('50013') || msg.toLowerCase().includes('missing permissions')) {
      return { granted: false, reason: 'permission-denied', detail: msg };
    }
    return { granted: false, reason: 'discord-error', detail: msg };
  }
}
