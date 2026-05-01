import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, '../src'),
            'flappa-doormal': resolve(__dirname, '../src/index.ts'),
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
    server: {
        open: true,
        port: 3000,
    },
});
