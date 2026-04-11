import { defineConfig } from 'vite';

export default defineConfig({
  // 子路径部署：所有资源路径前缀为 /rival-map/
  base: '/rival-map/',
  server: {
    proxy: {
      '/rival-map/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rival-map/, ''),
      },
    },
  },
});
