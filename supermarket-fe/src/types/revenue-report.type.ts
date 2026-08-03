export interface RevenueSummaryMetric {
  revenue: number;
  order_count: number;
  label: string;
}

export interface RevenueSummaryPayload {
  last_24_hours: RevenueSummaryMetric;
  last_7_days: RevenueSummaryMetric;
  current_month: RevenueSummaryMetric;
  current_year: RevenueSummaryMetric;
}

export interface RevenueSummaryResponse {
  currency: string;
  timezone: string;
  statuses: string[];
  generated_at: string;
  summary: RevenueSummaryPayload;
}

export interface RevenueRangeMetric extends RevenueSummaryMetric {
  start_date: string;
  end_date: string;
}

export interface RevenueRangeResponse {
  currency: string;
  timezone: string;
  statuses: string[];
  generated_at: string;
  range: RevenueRangeMetric;
}

export const EMPTY_REVENUE_SUMMARY_METRIC: RevenueSummaryMetric = {
  revenue: 0,
  order_count: 0,
  label: "Chưa có dữ liệu",
};

export const EMPTY_REVENUE_SUMMARY_PAYLOAD: RevenueSummaryPayload = {
  last_24_hours: EMPTY_REVENUE_SUMMARY_METRIC,
  last_7_days: EMPTY_REVENUE_SUMMARY_METRIC,
  current_month: EMPTY_REVENUE_SUMMARY_METRIC,
  current_year: EMPTY_REVENUE_SUMMARY_METRIC,
};

export const EMPTY_REVENUE_RANGE_METRIC: RevenueRangeMetric = {
  start_date: "",
  end_date: "",
  revenue: 0,
  order_count: 0,
  label: "Chưa có dữ liệu",
};
