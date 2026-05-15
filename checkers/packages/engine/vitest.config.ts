import { defineConfig } from 'vitest/config';

/**
 * Engine test config.
 *
 * Explicitly restricts test discovery to `.test.ts` under `tests/`. This
 * prevents Vitest from picking up any stale compiled `.js` artifacts that
 * might exist from an older build configuration. The `exclude` is belt-
 * and-braces — `include` already enforces `.ts`-only matching.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.js',
      '**/*.d.ts',
    ],
  },
});
