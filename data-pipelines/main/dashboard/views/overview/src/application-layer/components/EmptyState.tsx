import React from 'react';
import { theme } from '@/application-layer/theme';

export function EmptyState() {
  return (
    <div
      style={{
        marginTop: 24,
        padding: 32,
        textAlign: 'center',
        background: theme.surface,
        border: `1px dashed ${theme.border}`,
        borderRadius: theme.radius
      }}
    >
      <div style={{ color: theme.text, fontSize: 16, fontWeight: 600 }}>No KPIs configured yet</div>
      <div style={{ color: theme.textMuted, marginTop: 8, fontSize: 14 }}>
        Add KPI definitions to this team&apos;s dashboard and they will appear here.
      </div>
    </div>
  );
}
