import React from 'react';
import { theme } from '@/application-layer/theme';

export function KpiCard({ kpi }: { kpi: KpiDefinition }) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        padding: 16
      }}
    >
      <div style={{ color: theme.text, fontSize: 16, fontWeight: 600 }}>{kpi.name}</div>
      {kpi.description ? (
        <div style={{ color: theme.textMuted, marginTop: 6, fontSize: 14, lineHeight: 1.4 }}>
          {kpi.description}
        </div>
      ) : null}
      {kpi.targetValue !== null ? (
        <div style={{ color: theme.accent, marginTop: 10, fontSize: 13 }}>
          Target: {kpi.targetValue}
        </div>
      ) : null}
    </div>
  );
}
