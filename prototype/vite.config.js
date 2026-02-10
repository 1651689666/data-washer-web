import { defineConfig } from 'vite';

export default defineConfig({
    // 核心修复：GitHub Pages 在二级目录下运行，必须指定仓库名作为基础路径
    base: '/data-washer-web/',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
