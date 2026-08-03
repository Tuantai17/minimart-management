import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { reportService } from "../../src/services/report.service";
import { useAuthStore } from "../../src/store/auth.store";
import type {
    RevenueRangeResponse,
    RevenueSummaryResponse,
} from "../../src/types";
import { EMPTY_REVENUE_SUMMARY_PAYLOAD } from "../../src/types/revenue-report.type";
import { formatCurrency } from "../../src/utils";

const DATE_INPUT_PLACEHOLDER = "YYYY-MM-DD";
const CALENDAR_WEEK_DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

type PickerTarget = "start" | "end" | null;

type CalendarDay = {
  key: string;
  dayNumber: number;
  isoDate: string;
  isCurrentMonth: boolean;
};

const formatGeneratedAt = (value?: string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const formatDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (value: string) => {
  if (!isValidDateInput(value)) {
    return DATE_INPUT_PLACEHOLDER;
  }

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
};

const getMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
  }).format(date);

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const buildCalendarDays = (monthDate: Date): CalendarDay[] => {
  const firstDayOfMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth(),
    1,
  );
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstDayOfMonth);
  gridStart.setDate(firstDayOfMonth.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);

    return {
      key: `${current.getFullYear()}-${current.getMonth()}-${current.getDate()}`,
      dayNumber: current.getDate(),
      isoDate: formatDateValue(current),
      isCurrentMonth: current.getMonth() === monthDate.getMonth(),
    };
  });
};

const isValidDateInput = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toDateOnly = (value: string) => new Date(`${value}T00:00:00+07:00`);

const buildRangeLabel = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) {
    return "Chưa có dữ liệu";
  }

  const [startYear, startMonth, startDay] = startDate.split("-");
  const [endYear, endMonth, endDay] = endDate.split("-");

  if (
    !startYear ||
    !startMonth ||
    !startDay ||
    !endYear ||
    !endMonth ||
    !endDay
  ) {
    return "Chưa có dữ liệu";
  }

  return `Từ ${startDay}/${startMonth} - ${endDay}/${endMonth}`;
};

const normalizeDateInput = (value: string) =>
  value.replace(/[^0-9-]/g, "").slice(0, 10);

export default function RevenueReportScreen() {
  const { user, role, isStaff } = useAuthStore();

  const [report, setReport] = useState<RevenueSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] =
    useState<RevenueRangeResponse | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());

  const canAccess =
    role === "admin" || role === "staff" || isStaff || user?.is_staff;

  const fetchRevenueSummary = useCallback(
    async (isRefresh = false) => {
      if (!canAccess) {
        setLoading(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const data = await reportService.getRevenueSummary({
          force: isRefresh,
        });
        setReport(data);
      } catch (err: any) {
        setError(
          err?.response?.data?.detail ??
            err?.message ??
            "Không thể tải báo cáo doanh thu.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canAccess],
  );

  useFocusEffect(
    useCallback(() => {
      fetchRevenueSummary();
      return undefined;
    }, [fetchRevenueSummary]),
  );

  const handleApplyRange = useCallback(async () => {
    const normalizedStart = startDate.trim();
    const normalizedEnd = endDate.trim();

    setRangeError(null);

    if (!normalizedStart || !normalizedEnd) {
      setSelectedRange(null);
      setRangeError("Vui lòng nhập đầy đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (
      !isValidDateInput(normalizedStart) ||
      !isValidDateInput(normalizedEnd)
    ) {
      setSelectedRange(null);
      setRangeError("Ngày phải đúng định dạng YYYY-MM-DD.");
      return;
    }

    const start = toDateOnly(normalizedStart);
    const end = toDateOnly(normalizedEnd);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setSelectedRange(null);
      setRangeError("Ngày không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }

    if (start.getTime() > end.getTime()) {
      setSelectedRange(null);
      setRangeError("Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.");
      return;
    }

    setRangeLoading(true);

    try {
      const data = await reportService.getRevenueRange({
        startDate: normalizedStart,
        endDate: normalizedEnd,
        force: true,
      });
      setSelectedRange(data);
    } catch (err: any) {
      setSelectedRange(null);
      setRangeError(
        err?.response?.data?.detail ??
          err?.message ??
          "Không thể tải báo cáo theo khoảng ngày.",
      );
    } finally {
      setRangeLoading(false);
    }
  }, [endDate, startDate]);

  const openPicker = useCallback(
    (target: PickerTarget) => {
      if (!target) {
        return;
      }

      const currentValue = target === "start" ? startDate : endDate;
      const nextMonth = isValidDateInput(currentValue)
        ? toDateOnly(currentValue)
        : new Date();

      setPickerTarget(target);
      setPickerMonth(
        new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1),
      );
      setPickerVisible(true);
    },
    [endDate, startDate],
  );

  const closePicker = useCallback(() => {
    setPickerVisible(false);
    setPickerTarget(null);
  }, []);

  const handlePickDate = useCallback(
    (isoDate: string) => {
      if (pickerTarget === "start") {
        setStartDate(isoDate);
      }

      if (pickerTarget === "end") {
        setEndDate(isoDate);
      }

      setRangeError(null);
      closePicker();
    },
    [closePicker, pickerTarget],
  );

  const summary = report?.summary ?? EMPTY_REVENUE_SUMMARY_PAYLOAD;
  const generatedAtText = formatGeneratedAt(report?.generated_at);
  const rangeMetric = selectedRange?.range ?? null;
  const rangeGeneratedAtText = formatGeneratedAt(selectedRange?.generated_at);
  const calendarDays = useMemo(
    () => buildCalendarDays(pickerMonth),
    [pickerMonth],
  );
  const activePickerValue = pickerTarget === "start" ? startDate : endDate;

  const cards = useMemo(
    () => [
      {
        key: "last_24_hours",
        title: "Doanh thu 24h qua",
        metric: summary.last_24_hours,
        icon: "today" as const,
        iconColor: "#10B981",
        iconBackground: "#ECFDF5",
      },
      {
        key: "last_7_days",
        title: "Doanh thu 7 ngày qua",
        metric: summary.last_7_days,
        icon: "calendar-outline" as const,
        iconColor: "#3B82F6",
        iconBackground: "#EFF6FF",
      },
      {
        key: "current_month",
        title: "Doanh thu tháng này",
        metric: summary.current_month,
        icon: "podium-outline" as const,
        iconColor: "#8B5CF6",
        iconBackground: "#F5F3FF",
      },
      {
        key: "current_year",
        title: "Doanh thu năm nay",
        metric: summary.current_year,
        icon: "stats-chart-outline" as const,
        iconColor: "#F59E0B",
        iconBackground: "#FEF3C7",
      },
    ],
    [summary],
  );

  if (!canAccess) {
    return (
      <View style={styles.container}>
        <AppHeader title="Báo cáo doanh thu" showBack />
        <View style={styles.centerWrap}>
          <Text style={styles.blockTitle}>Bạn không có quyền truy cập</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title="Báo cáo doanh thu" showBack />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchRevenueSummary(true)}
          />
        }
      >
        <View style={styles.reportHeader}>
          <Text style={styles.reportTitle}>Tổng quan kinh doanh</Text>
          <Text style={styles.reportSubtitle}>
            Thống kê từ các đơn hàng hoàn thành trên hệ thống
          </Text>
          {generatedAtText ? (
            <Text style={styles.generatedAtText}>
              Cập nhật lúc {generatedAtText}
            </Text>
          ) : null}
        </View>

        <View style={styles.filterCard}>
          <View style={styles.filterHeader}>
            <View style={styles.filterHeaderIcon}>
              <Ionicons
                name="calendar-clear-outline"
                size={18}
                color={Colors.primary}
              />
            </View>
            <View style={styles.filterHeaderContent}>
              <Text style={styles.filterTitle}>Khoảng ngày tùy chọn</Text>
              <Text style={styles.filterSubtitle}>
                Nhập ngày theo định dạng YYYY-MM-DD để chuẩn bị lọc doanh thu.
              </Text>
            </View>
          </View>

          <View style={styles.filterGrid}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Từ ngày</Text>
              <Pressable
                style={styles.datePickerField}
                onPress={() => openPicker("start")}
              >
                <View>
                  <Text style={styles.datePickerFieldLabel}>
                    Chọn trên lịch
                  </Text>
                  <Text
                    style={[
                      styles.datePickerFieldValue,
                      !startDate && styles.datePickerPlaceholder,
                    ]}
                  >
                    {formatDisplayDate(startDate)}
                  </Text>
                </View>
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={Colors.primary}
                />
              </Pressable>
              <TextInput
                value={startDate}
                onChangeText={(value) =>
                  setStartDate(normalizeDateInput(value))
                }
                placeholder={DATE_INPUT_PLACEHOLDER}
                placeholderTextColor={Colors.textLight}
                style={styles.dateInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Đến ngày</Text>
              <Pressable
                style={styles.datePickerField}
                onPress={() => openPicker("end")}
              >
                <View>
                  <Text style={styles.datePickerFieldLabel}>
                    Chọn trên lịch
                  </Text>
                  <Text
                    style={[
                      styles.datePickerFieldValue,
                      !endDate && styles.datePickerPlaceholder,
                    ]}
                  >
                    {formatDisplayDate(endDate)}
                  </Text>
                </View>
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={Colors.primary}
                />
              </Pressable>
              <TextInput
                value={endDate}
                onChangeText={(value) => setEndDate(normalizeDateInput(value))}
                placeholder={DATE_INPUT_PLACEHOLDER}
                placeholderTextColor={Colors.textLight}
                style={styles.dateInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.applyBtn}
            onPress={handleApplyRange}
            activeOpacity={0.85}
            disabled={rangeLoading}
          >
            {rangeLoading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons
                name="sparkles-outline"
                size={18}
                color={Colors.white}
              />
            )}
            <Text style={styles.applyBtnText}>
              {rangeLoading ? "Đang tải khoảng ngày..." : "Áp dụng khoảng ngày"}
            </Text>
          </TouchableOpacity>

          {rangeError ? (
            <Text style={styles.rangeErrorText}>{rangeError}</Text>
          ) : null}

          {rangeMetric ? (
            <View style={styles.rangePreviewCard}>
              <View style={[styles.cardIconWrap, styles.rangePreviewIconWrap]}>
                <Ionicons name="analytics-outline" size={24} color="#EC4899" />
              </View>

              <View style={styles.cardInfo}>
                <Text style={styles.cardLabel}>Doanh thu theo khoảng chọn</Text>
                <Text style={styles.cardValue}>
                  {formatCurrency(rangeMetric.revenue)}
                </Text>
                <Text style={styles.cardSubValue}>
                  {rangeMetric.order_count} đơn hàng | {rangeMetric.label}
                </Text>
                <Text style={styles.previewMetaText}>
                  Khoảng đã chọn: {rangeMetric.start_date} →{" "}
                  {rangeMetric.end_date}
                </Text>
                {rangeGeneratedAtText ? (
                  <Text style={styles.previewMetaText}>
                    Cập nhật lúc {rangeGeneratedAtText}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.centerWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchRevenueSummary(true)}
            >
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cardsContainer}>
            {cards.map((card) => (
              <View key={card.key} style={styles.reportCard}>
                <View
                  style={[
                    styles.cardIconWrap,
                    { backgroundColor: card.iconBackground },
                  ]}
                >
                  <Ionicons name={card.icon} size={24} color={card.iconColor} />
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.cardLabel}>{card.title}</Text>
                  <Text style={styles.cardValue}>
                    {formatCurrency(card.metric.revenue)}
                  </Text>
                  <Text style={styles.cardSubValue}>
                    {card.metric.order_count} đơn hàng | {card.metric.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={closePicker}
      >
        <Pressable style={styles.modalOverlay} onPress={closePicker}>
          <Pressable style={styles.calendarModalCard} onPress={() => undefined}>
            <View style={styles.calendarModalHeader}>
              <View>
                <Text style={styles.calendarModalTitle}>
                  {pickerTarget === "start"
                    ? "Chọn ngày bắt đầu"
                    : "Chọn ngày kết thúc"}
                </Text>
                <Text style={styles.calendarModalSubtitle}>
                  {activePickerValue
                    ? `Đang chọn: ${formatDisplayDate(activePickerValue)}`
                    : "Chưa chọn ngày"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closePicker}
                style={styles.calendarCloseButton}
              >
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarMonthRow}>
              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() =>
                  setPickerMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() - 1,
                        1,
                      ),
                  )
                }
              >
                <Ionicons
                  name="chevron-back"
                  size={18}
                  color={Colors.textPrimary}
                />
              </TouchableOpacity>

              <Text style={styles.calendarMonthLabel}>
                {getMonthLabel(pickerMonth)}
              </Text>

              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() =>
                  setPickerMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() + 1,
                        1,
                      ),
                  )
                }
              >
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Colors.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {CALENDAR_WEEK_DAYS.map((day) => (
                <Text key={day} style={styles.calendarWeekLabel}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day) => {
                const dayDate = toDateOnly(day.isoDate);
                const isSelected =
                  isValidDateInput(activePickerValue) &&
                  isSameDay(dayDate, toDateOnly(activePickerValue));
                const isToday = isSameDay(dayDate, new Date());

                return (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.calendarDayButton,
                      isSelected && styles.calendarDayButtonActive,
                    ]}
                    onPress={() => handlePickDate(day.isoDate)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        !day.isCurrentMonth && styles.calendarDayTextMuted,
                        isSelected && styles.calendarDayTextActive,
                        isToday && !isSelected && styles.calendarTodayText,
                      ]}
                    >
                      {day.dayNumber}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  centerWrap: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  blockTitle: {
    fontSize: FontSize.lg,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  reportHeader: {
    marginBottom: Spacing.lg,
  },
  reportTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  reportSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textLight,
  },
  generatedAtText: {
    marginTop: 6,
    fontSize: FontSize.xs,
    color: Colors.textLight,
  },
  filterCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadow.small,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  filterHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    marginRight: 12,
  },
  filterHeaderContent: {
    flex: 1,
  },
  filterTitle: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  filterSubtitle: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  filterGrid: {
    gap: Spacing.md,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  datePickerField: {
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  datePickerFieldLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  datePickerFieldValue: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  datePickerPlaceholder: {
    color: Colors.textLight,
    fontWeight: "500",
  },
  dateInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    backgroundColor: "#F8FAFC",
  },
  applyBtn: {
    marginTop: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
  },
  applyBtnText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  rangeErrorText: {
    marginTop: 10,
    fontSize: FontSize.sm,
    color: Colors.error,
    lineHeight: 20,
  },
  rangePreviewCard: {
    marginTop: Spacing.md,
    backgroundColor: "#FFF7ED",
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  rangePreviewIconWrap: {
    backgroundColor: "#FCE7F3",
  },
  previewMetaText: {
    marginTop: 6,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  cardsContainer: {
    gap: Spacing.md,
  },
  reportCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    ...Shadow.small,
  },
  cardIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  cardInfo: {
    flex: 1,
  },
  cardLabel: {
    fontSize: FontSize.sm,
    color: Colors.textLight,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  cardSubValue: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: "600",
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  retryText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  calendarModalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadow.small,
  },
  calendarModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    gap: 12,
  },
  calendarModalTitle: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  calendarModalSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  calendarCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  calendarMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  calendarNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  calendarMonthLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrimary,
    textTransform: "capitalize",
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  calendarWeekLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textLight,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  calendarDayButton: {
    width: "14.2857%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  calendarDayButtonActive: {
    backgroundColor: Colors.primary,
  },
  calendarDayText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  calendarDayTextMuted: {
    color: Colors.textLight,
  },
  calendarDayTextActive: {
    color: Colors.white,
  },
  calendarTodayText: {
    color: Colors.primary,
  },
});
