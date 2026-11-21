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
    // Node 25+ ships its own global localStorage, which hides jsdom's and breaks every
    // component test that touches storage. Off, jsdom's is the one tests see. The flag
    // exists from Node 22; older versions would refuse it.
    execArgv: Number(process.versions.node.split('.')[0]) >= 22 ? ['--no-experimental-webstorage'] : [],
  },
});
