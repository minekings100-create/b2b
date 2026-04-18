// Empty stub for `import "server-only"` marker so vitest can load pure
// server utilities (templates, transport) without throwing. Production
// builds resolve the real package via Next's React Server Components
// condition; vitest aliases to this file via vitest.config.ts.
export {};
