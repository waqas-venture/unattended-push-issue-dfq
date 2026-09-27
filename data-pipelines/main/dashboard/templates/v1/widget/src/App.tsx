import React from 'react';

// The root widget component — replace this starter with the real widget. Hooks work
// because the host renders the returned element as a function component. A widget reads
// its bound KPI's `data` (a host-injected global, typed in src/globals.d.ts) and nothing
// else — no kpiDefinitions, fetchKpiData, or opsAppObjects (build a custom view for those).
// Split the UI across sibling modules under src/ and import them with the `@/` alias as needed.
export function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Custom widget</h2>
      <p>Result type: {data.resultType}</p>
    </div>
  );
}
