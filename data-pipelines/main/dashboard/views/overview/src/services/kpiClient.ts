// Thin access layer over the host-injected KPI globals. Keeping host-contract
// access in one place keeps the application layer free of ambient globals.

export function listKpis(): ReadonlyArray<KpiDefinition> {
  return kpiDefinitions;
}

export function findKpi(name: string): KpiDefinition | undefined {
  return kpiDefinitions.find((k) => k.name === name);
}

export async function fetchKpi(
  kpiId: string,
  filters?: Record<string, string>
): Promise<WidgetDataResponse> {
  return fetchKpiData(kpiId, filters);
}
