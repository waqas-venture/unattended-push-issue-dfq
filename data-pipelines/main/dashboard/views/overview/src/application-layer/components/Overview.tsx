import React from 'react';
import { theme } from '@/application-layer/theme';
import { listKpis } from '@/services/kpiClient';
import { KpiCard } from '@/application-layer/components/KpiCard';
import { EmptyState } from '@/application-layer/components/EmptyState';

export function Overview() {
  const kpis = listKpis();

  return (
    <div
      style={{
        background: theme.bg,
        minHeight: '100%',
        padding: 24,
        fontFamily: theme.fontFamily,
        boxSizing: 'border-box'
      }}
    >
      <h1 style={{ color: theme.text, fontSize: 22, fontWeight: 700, margin: 0 }}>Overview</h1>
      <p style={{ color: theme.textMuted, marginTop: 4, fontSize: 14 }}>
        {kpis.length} KPI{kpis.length === 1 ? '' : 's'} available
      </p>

      {kpis.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: theme.gap,
            marginTop: 16
          }}
        >
          {kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      )}
    </div>
  );
}
