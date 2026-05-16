/**
 * Global type declarations for the web app.
 *
 * Allows side-effect CSS imports in TS/TSX files without type errors.
 * Next.js handles the runtime import; this just satisfies the type system.
 */

declare module '*.css';
declare module '*.svg';
