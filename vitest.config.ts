import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Component tests opt into jsdom with a `// @vitest-environment jsdom`
    // docblock (Vitest 4 has no environmentMatchGlobs).
    environment: 'node',
    // Tests run with the live preview flag on, so the code behind it stays
    // covered even where a deployment hides it.
    env: { NEXT_PUBLIC_LIVE_PREVIEW: 'on' },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
