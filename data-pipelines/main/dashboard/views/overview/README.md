# Overview (custom dashboard view)

Self-contained React view for the **Overview** dashboard view, built to a single
`index.js` the platform serves. Follows the v1 custom-view architecture:

- `src/main.tsx` — default-exports `<App/>` (the element the built function body returns)
- `src/App.tsx` — root component
- `src/application-layer/` — presentation (theme + components)
- `src/services/kpiClient.ts` — access layer over the host-injected `kpiDefinitions` / `fetchKpiData` globals

## Build

```bash
npm install
npm run build      # tsc && vite build -> dist/index.js
cp dist/index.js index.js
```

`react` / `react-dom` are external (provided by the host). Do not commit `dist/` or `node_modules/`.
