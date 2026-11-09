import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1',proxy:{'/api':{target:'http://127.0.0.1:3000',changeOrigin:false}} },
  preview: { host: '127.0.0.1' },
});
