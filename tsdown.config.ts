import { defineConfig } from 'tsdown';

export default defineConfig({
    clean: true,
    dts: true,
    entry: ['src/index.ts', 'src/mcp/server.ts'],
    format: ['esm'],
    sourcemap: true,
});
