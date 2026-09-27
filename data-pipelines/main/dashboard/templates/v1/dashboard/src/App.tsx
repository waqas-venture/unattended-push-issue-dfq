import React from 'react';

// The root view component — replace this starter with the real view. Hooks work
// because the host renders the returned element as a function component. A view has
// access to every `kpiDefinitions` entry and can `fetchKpiData(kpiId, filters?)` for
// any of them; it can also read and write team-scoped stateful objects via
// `opsAppObjects` (all host-injected globals, typed in src/globals.d.ts; the repo build
// generates TypeScript declarations for every object type, which the tsconfig includes).
// Split the UI across sibling modules under src/ and import them with the `@/` alias
// as needed.
export function App() {
  const kpiCount = kpiDefinitions.length;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Custom view</h2>
      <p>KPI definitions available: {kpiCount}</p>
    </div>
  );
}
