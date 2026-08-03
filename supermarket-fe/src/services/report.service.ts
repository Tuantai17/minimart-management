import type {
    RevenueRangeMetric,
    RevenueRangeResponse,
    RevenueSummaryMetric,
    RevenueSummaryPayload,
    RevenueSummaryResponse,
} from "../types";
import {
    EMPTY_REVENUE_RANGE_METRIC,
    EMPTY_REVENUE_SUMMARY_PAYLOAD,
} from "../types/revenue-report.type";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

type RevenueSummaryCacheEntry = {
  data: RevenueSummaryResponse;
  fetchedAt: number;
};

type RevenueRangeCacheEntry = {
  data: RevenueRangeResponse;
  fetchedAt: number;
};

type GetRevenueSummaryOptions = {
  force?: boolean;
};

type GetRevenueRangeParams = {
  startDate: string;
  endDate: string;
  force?: boolean;
};

const REVENUE_SUMMARY_STALE_TIME_MS = 60 * 1000;

let revenueSummaryCache: RevenueSummaryCacheEntry | null = null;
let revenueRangeCache = new Map<string, RevenueRangeCacheEntry>();

const normalizeMetric = (
  metric?: Partial<RevenueSummaryMetric> | null,
): RevenueSummaryMetric => ({
  revenue: Number(metric?.revenue ?? 0),
  order_count: Number(metric?.order_count ?? 0),
  label:
    typeof metric?.label === "string" && metric.label.trim().length > 0
      ? metric.label
      : "Chưa có dữ liệu",
});

const normalizeRangeMetric = (
  metric?: Partial<RevenueRangeMetric> | null,
  fallback?: Pick<RevenueRangeMetric, "start_date" | "end_date">,
): RevenueRangeMetric => ({
  start_date:
    typeof metric?.start_date === "string" &&
    metric.start_date.trim().length > 0
      ? metric.start_date
      : (fallback?.start_date ?? ""),
  end_date:
    typeof metric?.end_date === "string" && metric.end_date.trim().length > 0
      ? metric.end_date
      : (fallback?.end_date ?? ""),
  ...normalizeMetric(metric),
});

const normalizePayload = (
  payload?: Partial<RevenueSummaryPayload> | null,
): RevenueSummaryPayload => ({
  last_24_hours: normalizeMetric(payload?.last_24_hours),
  last_7_days: normalizeMetric(payload?.last_7_days),
  current_month: normalizeMetric(payload?.current_month),
  current_year: normalizeMetric(payload?.current_year),
});

const createFallbackSummaryResponse = (): RevenueSummaryResponse => ({
  currency: "VND",
  timezone: "Asia/Ho_Chi_Minh",
  statuses: ["COMPLETED"],
  generated_at: new Date().toISOString(),
  summary: EMPTY_REVENUE_SUMMARY_PAYLOAD,
});

const createFallbackRangeResponse = (
  startDate: string,
  endDate: string,
): RevenueRangeResponse => ({
  currency: "VND",
  timezone: "Asia/Ho_Chi_Minh",
  statuses: ["COMPLETED"],
  generated_at: new Date().toISOString(),
  range: {
    ...EMPTY_REVENUE_RANGE_METRIC,
    start_date: startDate,
    end_date: endDate,
  },
});

export const reportService = {
  getRevenueSummary: async (
    options: GetRevenueSummaryOptions = {},
  ): Promise<RevenueSummaryResponse> => {
    const { force = false } = options;
    const now = Date.now();

    if (
      !force &&
      revenueSummaryCache &&
      now - revenueSummaryCache.fetchedAt < REVENUE_SUMMARY_STALE_TIME_MS
    ) {
      return revenueSummaryCache.data;
    }

    const response = await client.get<Partial<RevenueSummaryResponse>>(
      Endpoints.REVENUE_SUMMARY,
    );

    const data = response.data ?? createFallbackSummaryResponse();
    const normalized: RevenueSummaryResponse = {
      currency:
        typeof data.currency === "string" && data.currency.trim().length > 0
          ? data.currency
          : "VND",
      timezone:
        typeof data.timezone === "string" && data.timezone.trim().length > 0
          ? data.timezone
          : "Asia/Ho_Chi_Minh",
      statuses: Array.isArray(data.statuses)
        ? data.statuses.filter(
            (status): status is string => typeof status === "string",
          )
        : ["COMPLETED"],
      generated_at:
        typeof data.generated_at === "string" &&
        data.generated_at.trim().length > 0
          ? data.generated_at
          : new Date().toISOString(),
      summary: normalizePayload(data.summary),
    };

    revenueSummaryCache = {
      data: normalized,
      fetchedAt: now,
    };

    return normalized;
  },
  getRevenueRange: async ({
    startDate,
    endDate,
    force = false,
  }: GetRevenueRangeParams): Promise<RevenueRangeResponse> => {
    const cacheKey = `${startDate}_${endDate}`;
    const now = Date.now();
    const cached = revenueRangeCache.get(cacheKey);

    if (
      !force &&
      cached &&
      now - cached.fetchedAt < REVENUE_SUMMARY_STALE_TIME_MS
    ) {
      return cached.data;
    }

    const response = await client.get<Partial<RevenueRangeResponse>>(
      Endpoints.REVENUE_RANGE,
      {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
      },
    );

    const data =
      response.data ?? createFallbackRangeResponse(startDate, endDate);
    const normalized: RevenueRangeResponse = {
      currency:
        typeof data.currency === "string" && data.currency.trim().length > 0
          ? data.currency
          : "VND",
      timezone:
        typeof data.timezone === "string" && data.timezone.trim().length > 0
          ? data.timezone
          : "Asia/Ho_Chi_Minh",
      statuses: Array.isArray(data.statuses)
        ? data.statuses.filter(
            (status): status is string => typeof status === "string",
          )
        : ["COMPLETED"],
      generated_at:
        typeof data.generated_at === "string" &&
        data.generated_at.trim().length > 0
          ? data.generated_at
          : new Date().toISOString(),
      range: normalizeRangeMetric(data.range, {
        start_date: startDate,
        end_date: endDate,
      }),
    };

    revenueRangeCache.set(cacheKey, {
      data: normalized,
      fetchedAt: now,
    });

    return normalized;
  },
  clearRevenueSummaryCache: () => {
    revenueSummaryCache = null;
  },
  clearRevenueRangeCache: () => {
    revenueRangeCache = new Map<string, RevenueRangeCacheEntry>();
  },
};
