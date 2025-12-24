import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
    server: {
        open: true,
        port: 3000,
    },
});
