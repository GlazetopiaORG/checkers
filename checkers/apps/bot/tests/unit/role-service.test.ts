/**
 * Phase 5: tests for the role-service (Discord interaction layer).
 *
 * The discord.js Client is completely mocked. We verify the LOGIC:
 *   - idempotency (already-has-role → no second add)
 *   - member-not-found handled cleanly
 *   - hierarchy check fires before the add (proactive guard)
 *   - successful path calls roles.add with an audit reason
 *   - errors don't escape — every failure path returns a structured result
 */

// Phase 5.0.2: belt-and-braces env bootstrap. See README for rationale.
import '../_test-env';

import { describe, expect, it, vi } from 'vitest';

import { grantLevelPassedRole } from '../../src/role-service';

interface MockMember {
  roles: {
    cache: { has: (id: string) => boolean };
    highest: { position: number; name: string };
    add: (id: string, reason?: string) => Promise<void>;
  };
  permissions: { has: (p: string) => boolean };
}

/**
 * Sentinel function used as the default `roles.add` on a MockMember.
 *
 * When `makeClient` walks the members, it replaces this sentinel with
 * a fresh success-mock (so tests that don't care about roles.add still
 * get a callable that resolves). Tests that DO care (e.g. simulating
 * permission-denied) set their own `vi.fn().mockRejectedValue(...)`
 * and `makeClient` leaves that alone.
 */
const DEFAULT_ROLES_ADD_SENTINEL: (id: string, reason?: string) => Promise<void> = () =>
  Promise.resolve();

interface MockRole {
  position: number;
  name: string;
}

function makeClient(opts: {
  /** map of memberId → mock member, or null to simulate not-in-guild */
  members: Record<string, MockMember | null>;
  /** bot's own member (used for hierarchy check) */
  botMember: MockMember;
  /** the target role (level-passed); null = role-not-found */
  targetRole: MockRole | null;
  /** id used by the client.user property */
  botUserId?: string;
  /** if set, throw this on guild.fetch (simulate Discord error) */
  guildFetchError?: Error;
}): {
  client: any;
  rolesAdd: ReturnType<typeof vi.fn>;
} {
  // Phase 5.0.1: when a test sets its own `roles.add` (e.g. a rejecting
  // mock for permission-denied), preserve it. Only inject a default
  // success-mock into members whose `roles.add` is the sentinel below.
  //
  // Previously the factory overwrote ALL `roles.add` slots with a
  // success mock, silently making rejection-mock tests pass with
  // granted=true. That bug masked real role-grant failure paths.
  const rolesAdd = vi.fn().mockResolvedValue(undefined);
  for (const m of Object.values(opts.members)) {
    if (m && m.roles.add === DEFAULT_ROLES_ADD_SENTINEL) {
      m.roles.add = rolesAdd;
    }
  }
  // Bot member's add is never the target of assertions; inject blindly.
  opts.botMember.roles.add = vi.fn();

  const guild = {
    members: {
      fetch: vi.fn((id: string) => {
        if (id === (opts.botUserId ?? 'bot-id')) {
          return Promise.resolve(opts.botMember);
        }
        const m = opts.members[id];
        if (m === null) {
          // Mimic discord.js DiscordAPIError shape loosely
          return Promise.reject(
            Object.assign(new Error('Unknown Member'), { code: 10007 }),
          );
        }
        if (m === undefined) {
          return Promise.reject(new Error('arbitrary discord error'));
        }
        return Promise.resolve(m);
      }),
    },
    roles: {
      fetch: vi.fn(() => Promise.resolve(opts.targetRole)),
    },
  };

  const client = {
    user: { id: opts.botUserId ?? 'bot-id' },
    guilds: {
      fetch: vi.fn(() => {
        if (opts.guildFetchError) return Promise.reject(opts.guildFetchError);
        return Promise.resolve(guild);
      }),
    },
  };

  return { client, rolesAdd };
}

const DEFAULT_BOT_MEMBER: MockMember = {
  roles: {
    cache: { has: () => false },
    highest: { position: 10, name: 'Glazetopia Bot' },
    add: vi.fn(),
  },
  permissions: { has: () => true },
};

const DEFAULT_TARGET_ROLE: MockRole = {
  position: 5,
  name: 'Level Passed',
};

// ---------------------------------------------------------------------------

describe('grantLevelPassedRole', () => {
  it('grants the role when member does not have it', async () => {
    const target: MockMember = {
      roles: {
        cache: { has: () => false },
        highest: { position: 1, name: 'Member' },
        add: DEFAULT_ROLES_ADD_SENTINEL,
      },
      permissions: { has: () => false },
    };
    const { client, rolesAdd } = makeClient({
      members: { 'u1': target },
      botMember: DEFAULT_BOT_MEMBER,
      targetRole: DEFAULT_TARGET_ROLE,
    });

    const result = await grantLevelPassedRole({
      client,
      guildId: 'g1',
      roleId: 'r1',
      discordId: 'u1',
      opponentType: 'sheriff',
      marksTotal: 5,
      marksRequired: 5,
    });

    expect(result).toEqual({ granted: true, reason: 'newly-added' });
    expect(rolesAdd).toHaveBeenCalledOnce();
    const [calledRoleId, auditReason] = rolesAdd.mock.calls[0]!;
    expect(calledRoleId).toBe('r1');
    expect(auditReason).toContain('sheriff');
    expect(auditReason).toContain('5/5');
  });

  it('is idempotent: returns already-has-role when member already has it', async () => {
    const target: MockMember = {
      roles: {
        cache: { has: (id: string) => id === 'r1' },
        highest: { position: 1, name: 'Member' },
        add: DEFAULT_ROLES_ADD_SENTINEL,
      },
      permissions: { has: () => false },
    };
    const { client, rolesAdd } = makeClient({
      members: { 'u1': target },
      botMember: DEFAULT_BOT_MEMBER,
      targetRole: DEFAULT_TARGET_ROLE,
    });

    const result = await grantLevelPassedRole({
      client,
      guildId: 'g1',
      roleId: 'r1',
      discordId: 'u1',
      opponentType: 'unbaked',
      marksTotal: 3,
      marksRequired: 3,
    });

    expect(result).toEqual({ granted: false, reason: 'already-has-role' });
    expect(rolesAdd).not.toHaveBeenCalled();
  });

  it('returns member-not-found when user is not in the guild', async () => {
    const { client, rolesAdd } = makeClient({
      members: { 'u1': null }, // explicit "Unknown Member"
      botMember: DEFAULT_BOT_MEMBER,
      targetRole: DEFAULT_TARGET_ROLE,
    });

    const result = await grantLevelPassedRole({
      client,
      guildId: 'g1',
      roleId: 'r1',
      discordId: 'u1',
      opponentType: 'sheriff',
      marksTotal: 5,
      marksRequired: 5,
    });

    expect(result).toEqual({ granted: false, reason: 'member-not-found' });
    expect(rolesAdd).not.toHaveBeenCalled();
  });

  it('returns role-not-found when role does not exist', async () => {
    const target: MockMember = {
      roles: {
        cache: { has: () => false },
        highest: { position: 1, name: 'Member' },
        add: DEFAULT_ROLES_ADD_SENTINEL,
      },
      permissions: { has: () => false },
    };
    const { client, rolesAdd } = makeClient({
      members: { 'u1': target },
      botMember: DEFAULT_BOT_MEMBER,
      targetRole: null, // ← guild has no such role
    });

    const result = await grantLevelPassedRole({
      client,
      guildId: 'g1',
      roleId: 'r1',
      discordId: 'u1',
      opponentType: 'sheriff',
      marksTotal: 5,
      marksRequired: 5,
    });

    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe('role-not-found');
    expect(rolesAdd).not.toHaveBeenCalled();
  });

  it('returns hierarchy-blocked when bot top role does not outrank target', async () => {
    const target: MockMember = {
      roles: {
        cache: { has: () => false },
        highest: { position: 1, name: 'Member' },
        add: DEFAULT_ROLES_ADD_SENTINEL,
      },
      permissions: { has: () => false },
    };
    const botBelow: MockMember = {
      roles: {
        cache: { has: () => false },
        highest: { position: 2, name: 'Low Bot' },
        add: DEFAULT_ROLES_ADD_SENTINEL,
      },
      permissions: { has: () => true },
    };
    const { client, rolesAdd } = makeClient({
      members: { 'u1': target },
      botMember: botBelow,
      targetRole: { position: 5, name: 'Level Passed' }, // higher than bot
    });

    const result = await grantLevelPassedRole({
      client,
      guildId: 'g1',
      roleId: 'r1',
      discordId: 'u1',
      opponentType: 'sheriff',
      marksTotal: 5,
      marksRequired: 5,
    });

    expect(result.granted).toBe(false);
    if (!result.granted && result.reason !== 'already-has-role') {
      expect(result.reason).toBe('hierarchy-blocked');
      expect(result.detail).toContain('position');
    }
    expect(rolesAdd).not.toHaveBeenCalled();
  });

  it('returns permission-denied when roles.add throws 50013', async () => {
    const target: MockMember = {
      roles: {
        cache: { has: () => false },
        highest: { position: 1, name: 'Member' },
        add: vi.fn().mockRejectedValue(new Error('Missing Permissions (50013)')),
      },
      permissions: { has: () => false },
    };
    const { client } = makeClient({
      members: { 'u1': target },
      botMember: DEFAULT_BOT_MEMBER,
      targetRole: DEFAULT_TARGET_ROLE,
    });

    const result = await grantLevelPassedRole({
      client,
      guildId: 'g1',
      roleId: 'r1',
      discordId: 'u1',
      opponentType: 'unbaked',
      marksTotal: 3,
      marksRequired: 3,
    });

    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe('permission-denied');
  });

  it('returns discord-error on unrecognized errors', async () => {
    const target: MockMember = {
      roles: {
        cache: { has: () => false },
        highest: { position: 1, name: 'Member' },
        add: vi.fn().mockRejectedValue(new Error('something odd 12345')),
      },
      permissions: { has: () => false },
    };
    const { client } = makeClient({
      members: { 'u1': target },
      botMember: DEFAULT_BOT_MEMBER,
      targetRole: DEFAULT_TARGET_ROLE,
    });

    const result = await grantLevelPassedRole({
      client,
      guildId: 'g1',
      roleId: 'r1',
      discordId: 'u1',
      opponentType: 'sheriff',
      marksTotal: 5,
      marksRequired: 5,
    });

    expect(result.granted).toBe(false);
    if (!result.granted && result.reason !== 'already-has-role') {
      expect(result.reason).toBe('discord-error');
      expect(result.detail).toContain('something odd');
    }
  });

  it('handles guild fetch failure cleanly', async () => {
    const { client } = makeClient({
      members: {},
      botMember: DEFAULT_BOT_MEMBER,
      targetRole: DEFAULT_TARGET_ROLE,
      guildFetchError: new Error('connection refused'),
    });

    const result = await grantLevelPassedRole({
      client,
      guildId: 'g1',
      roleId: 'r1',
      discordId: 'u1',
      opponentType: 'sheriff',
      marksTotal: 5,
      marksRequired: 5,
    });

    expect(result.granted).toBe(false);
    if (!result.granted && result.reason !== 'already-has-role') {
      expect(result.reason).toBe('discord-error');
      expect(result.detail).toContain('connection refused');
    }
  });
});
