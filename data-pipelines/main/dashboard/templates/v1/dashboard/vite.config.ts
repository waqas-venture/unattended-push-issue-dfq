import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Builds the multi-file source under src/ into a single minified `dist/index.js` — the build
// output the repo-root `npm run build` embeds in the pipeline-config artifact the platform reads.
// `dist/` is gitignored; this folder never holds a committed index.js.
// The output conforms to the view-code contract (see
// the dashboard-source-code skill).
//
// The contract: the host runs index.js as a *function body* invoked with seven
// arguments — (React, kpiDefinitions, fetchKpiData, opsAppObjects, opsAppDocuments,
// TeamRole, userContext) — and the body must `return` a React element. So:
//   - `react` is marked external and mapped to the global `React`, which at runtime
//     resolves to the `React` function argument the host passes in.
//   - `kpiDefinitions` / `fetchKpiData` / `opsAppObjects` / `opsAppDocuments` /
//     `TeamRole` / `userContext` are referenced as ambient globals (see
//     src/globals.d.ts); inside the generated function body they resolve to the
//     host-provided arguments via the scope chain.
//   - We build an IIFE whose value is the view's root element (the entry's default
//     export), then append `return <name>;` via the output footer so the whole file
//     is a valid function body.
export default defineConfig({
  // Use the classic JSX runtime so JSX compiles to `React.createElement(...)` and
  // depends only on the external `React` global — no `react/jsx-runtime` import.
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
      // React is provided by the host as a function argument, not bundled.
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        },
        // Turn `var DataFabriqView = (function(React){...})(React);`
        // into a valid function body by returning the produced element.
        footer: 'return DataFabriqView;'
      }
    }
  }
});
