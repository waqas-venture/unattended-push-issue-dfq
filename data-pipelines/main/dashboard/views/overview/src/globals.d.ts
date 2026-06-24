// Ambient declarations for host-injected values (view-code contract).

interface KpiDefinition {
  id: string;
  name: string;
  description: string;
  targetValue: number | null;
  metadata: Record<string, string>;
  resultType: number;
  baseQuery: string;
  liveQuery: string;
  parameters: Array<{
    name: string;
    dataType: string;
    defaultValue: string | null;
    required: boolean;
    description: string;
    allowedValues: string[] | null;
  }>;
  drilldownQuery: string | null;
}

interface KpiAxisValue {
  type: string;
  text: string | null;
  number: number | null;
}

interface WidgetDataResponse {
  widgetId: string;
  resultType: number;
  scalarValue: number | null;
  dataPoints: Array<{ x: KpiAxisValue; y: number }> | null;
  series: Array<{
    kpiDefinition: { name: string };
    dataPoints: Array<{ x: KpiAxisValue; y: number }>;
  }> | null;
  tabularColumns: Array<{ name: string }> | null;
  tabularRows: Array<{ values: string[] }> | null;
}

declare const kpiDefinitions: ReadonlyArray<KpiDefinition>;
declare function fetchKpiData(
  kpiId: string,
  filters?: Record<string, string>
): Promise<WidgetDataResponse>;
