import { defineConfig } from 'vite';

export default defineConfig({
  base: '/smartframe-web-transcoder/',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        entryFileNames: 'smartframe-transcoder.js',
        assetFileNames: (asset) => asset.names.some((name) => name.endsWith('.css'))
          ? 'smartframe-transcoder.css'
          : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
