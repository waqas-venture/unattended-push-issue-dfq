import React from 'react';
import { App } from '@/App';

// Entry point. The contract requires the widget code to *return* a React element
// (e.g. `return React.createElement(App)`). In this harness, the entry's default
// export becomes the bundled IIFE's value, and vite.config.ts's output footer
// appends `return DataFabriqView;` so the whole file is a valid function body.
export default <App />;
