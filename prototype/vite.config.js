import { defineConfig } from 'vite';

export default defineConfig({
    // GitHub Pages 基础路径配置
    // 如果你的仓库名是 data-washer，则设为 /data-washer/
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
