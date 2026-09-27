// Ambient declarations for the values the host injects as function arguments when
// it runs the built index.js (see the dashboard-source-code skill).
//
// React itself is imported normally (and marked external in vite.config.ts), but
// `data` is not a module import — it is an argument in scope at runtime. Declaring it
// here lets source files reference it with full type-checking. A widget receives ONLY
// `data`; kpiDefinitions, fetchKpiData, and opsAppObjects are view-only.

interface KpiAxisValue {
  type: string;
  text: string | null;
  number: number | null;
}

/** The raw API response for the widget's bound KPI definition. */
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

/** The bound KPI's data for this widget. */
declare const data: WidgetDataResponse;
