import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Builds the view as a single IIFE index.js whose value is the <App/> element.
// react / react-dom are external (provided by the host); the footer turns the
// built file into a function body that returns the view element.
export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' })],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,
    target: 'esnext',
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      name: 'DataFabriqView',
      formats: ['iife'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        exports: 'default',
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        },
        footer: 'return DataFabriqView;'
      }
    }
  }
});
