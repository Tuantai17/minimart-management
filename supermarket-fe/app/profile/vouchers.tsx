import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors, Shadow } from "../../src/constants";
import { useVoucherStore } from "../../src/store";
import type { UserVoucher, UserVoucherStatus } from "../../src/types";
import { formatCurrency } from "../../src/utils";

const getStatusMeta = (status: UserVoucherStatus) => {
  switch (status) {
    case "active":
      return {
        chipLabel: "Sẵn sàng dùng",
        chipBg: "#DCFCE7",
        chipColor: "#047857",
      };
    case "used":
      return {
        chipLabel: "Đã dùng",
        chipBg: "#E5E7EB",
        chipColor: "#6B7280",
      };
    case "expired":
      return {
        chipLabel: "Hết hạn",
        chipBg: "#FEE2E2",
        chipColor: "#B91C1C",
      };
    default:
      return {
        chipLabel: "Không khả dụng",
        chipBg: "#FEF3C7",
        chipColor: "#B45309",
      };
  }
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "Không rõ hạn dùng";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("vi-VN");
};

const buildVoucherTitle = (voucher: UserVoucher) => {
  if (voucher.title) {
    return voucher.title;
  }

  if (voucher.discount_type === "FIXED") {
    return `Giảm ${formatCurrency(Number(voucher.discount_value || 0))}`;
  }

  if (voucher.discount_type === "PERCENT") {
    return `Giảm ${voucher.discount_value || 0}%`;
  }

  return voucher.code;
};

export default function MyVoucherScreen() {
  const router = useRouter();
  const {
    myVouchers,
    isLoadingMyVouchers,
    voucherError,
    fetchMyVouchers,
    clearVoucherError,
  } = useVoucherStore();

  useEffect(() => {
    void fetchMyVouchers().catch(() => undefined);
  }, [fetchMyVouchers]);

  const summary = useMemo(() => {
    const activeCount = myVouchers.filter(
      (voucher) => voucher.status === "active",
    ).length;
    const usedCount = myVouchers.filter(
      (voucher) => voucher.status === "used",
    ).length;

    return {
      total: myVouchers.length,
      active: activeCount,
      used: usedCount,
    };
  }, [myVouchers]);

  const handleRefresh = async () => {
    clearVoucherError();
    try {
      await fetchMyVouchers();
    } catch {
      // Lỗi đã hiển thị từ store.
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerWrap}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.white} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Voucher của tôi</Text>
          <Text style={styles.headerSubtitle}>
            Chỉ hiển thị các voucher bạn đã nhận
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => void handleRefresh()}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons name="wallet-outline" size={16} color="#FFE7E0" />
            <Text style={styles.heroBadgeText}>Ví voucher cá nhân</Text>
          </View>

          <Text style={styles.heroTitle}>Quản lý voucher đã nhận</Text>
          <Text style={styles.heroDescription}>
            Đây là danh sách voucher đã nằm trong ví của bạn. Bạn có thể áp dụng
            ở checkout khi đơn hàng đáp ứng đủ điều kiện từ backend.
          </Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{summary.total}</Text>
              <Text style={styles.heroStatLabel}>Tổng voucher</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{summary.active}</Text>
              <Text style={styles.heroStatLabel}>Có thể dùng</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{summary.used}</Text>
              <Text style={styles.heroStatLabel}>Đã dùng</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.exploreButton}
            activeOpacity={0.88}
            onPress={() => router.push("/vouchers" as any)}
          >
            <Ionicons name="gift-outline" size={16} color="#EE4D2D" />
            <Text style={styles.exploreButtonText}>Đi đến Kho Voucher</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Danh sách voucher đã nhận</Text>
          <Text style={styles.sectionSubtitle}>
            Các voucher ở đây mới xuất hiện sau khi bạn nhận từ Kho Voucher
          </Text>
        </View>

        {voucherError ? (
          <View style={styles.noticeCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
            <Text style={styles.noticeText}>{voucherError}</Text>
          </View>
        ) : null}

        {isLoadingMyVouchers ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tải ví voucher...</Text>
          </View>
        ) : null}

        {!isLoadingMyVouchers && myVouchers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="ticket-outline" size={42} color="#F97316" />
            <Text style={styles.emptyTitle}>Bạn chưa nhận voucher nào</Text>
            <Text style={styles.emptyText}>
              Hãy vào Kho Voucher để nhận mã trước. Sau khi nhận thành công,
              voucher sẽ xuất hiện tại đây.
            </Text>
            <TouchableOpacity
              style={styles.emptyActionButton}
              activeOpacity={0.88}
              onPress={() => router.push("/vouchers" as any)}
            >
              <Text style={styles.emptyActionText}>Mở Kho Voucher</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isLoadingMyVouchers
          ? myVouchers.map((voucher) => {
              const statusMeta = getStatusMeta(voucher.status);
              const accentColor = voucher.display?.accent_color || "#EE4D2D";
              const highlight =
                voucher.display?.highlight || "Sẵn sàng áp dụng";
              const badge = voucher.display?.badge || "Voucher của bạn";
              const minOrderValue = Number(voucher.min_order_value || 0);

              return (
                <View key={voucher.id} style={styles.voucherCard}>
                  <View
                    style={[
                      styles.voucherRail,
                      { backgroundColor: accentColor },
                    ]}
                  >
                    <Ionicons name="pricetags" size={26} color={Colors.white} />
                    <Text style={styles.voucherRailCode}>{voucher.code}</Text>
                    <Text style={styles.voucherRailCaption}>{badge}</Text>
                  </View>

                  <View style={styles.voucherBody}>
                    <View style={styles.voucherTopRow}>
                      <View style={styles.voucherTextWrap}>
                        <Text style={styles.voucherRewardText}>
                          {buildVoucherTitle(voucher)}
                        </Text>
                        <Text style={styles.voucherTitle}>{voucher.title}</Text>
                        <Text style={styles.voucherDescription}>
                          {voucher.description ||
                            voucher.apply_requirement_text}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.statusChip,
                          { backgroundColor: statusMeta.chipBg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusChipText,
                            { color: statusMeta.chipColor },
                          ]}
                        >
                          {statusMeta.chipLabel}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.conditionBox}>
                      <View style={styles.conditionRow}>
                        <Ionicons
                          name="shield-checkmark-outline"
                          size={15}
                          color="#F97316"
                        />
                        <Text style={styles.conditionText}>
                          {voucher.apply_requirement_text ||
                            "Áp dụng theo điều kiện backend"}
                        </Text>
                      </View>
                      <View style={styles.conditionRow}>
                        <Ionicons
                          name="time-outline"
                          size={15}
                          color="#64748B"
                        />
                        <Text style={styles.conditionText}>
                          HSD: {formatDate(voucher.expires_at)}
                        </Text>
                      </View>
                      <View style={styles.conditionRow}>
                        <Ionicons
                          name="sparkles-outline"
                          size={15}
                          color="#64748B"
                        />
                        <Text style={styles.conditionText}>{highlight}</Text>
                      </View>
                    </View>

                    <View style={styles.voucherFooter}>
                      <View>
                        <Text style={styles.minimumLabel}>
                          Điều kiện đơn hàng
                        </Text>
                        <Text style={styles.minimumValue}>
                          {minOrderValue > 0
                            ? `Từ ${formatCurrency(minOrderValue)}`
                            : "Mọi giá trị đơn hàng"}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.useNowButton}
                        activeOpacity={0.88}
                        onPress={() => router.push("/checkout" as any)}
                      >
                        <Text style={styles.useNowButtonText}>
                          Dùng ở checkout
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFF7F3",
  },
  headerWrap: {
    paddingTop: Platform.OS === "ios" ? 56 : 24,
    paddingHorizontal: 18,
    paddingBottom: 18,
    backgroundColor: "#EE4D2D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.white,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 14,
  },
  heroCard: {
    backgroundColor: "#EE4D2D",
    borderRadius: 28,
    padding: 18,
    ...Shadow.large,
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  heroBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: "800",
    color: Colors.white,
    lineHeight: 30,
  },
  heroDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "rgba(255,255,255,0.86)",
  },
  heroStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  heroStatCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  heroStatValue: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.white,
  },
  heroStatLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
  },
  exploreButton: {
    marginTop: 16,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  exploreButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#EE4D2D",
  },
  sectionHeader: {
    marginTop: 6,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
    color: "#991B1B",
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  emptyCard: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: Colors.white,
    ...Shadow.medium,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
  },
  emptyActionButton: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: "#EE4D2D",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.white,
  },
  voucherCard: {
    flexDirection: "row",
    backgroundColor: Colors.white,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FDE2D7",
    ...Shadow.medium,
  },
  voucherRail: {
    width: 96,
    paddingHorizontal: 10,
    paddingVertical: 16,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  voucherRailCode: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.white,
  },
  voucherRailCaption: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
  },
  voucherBody: {
    flex: 1,
    padding: 14,
    gap: 12,
  },
  voucherTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  voucherTextWrap: {
    flex: 1,
  },
  voucherRewardText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#EE4D2D",
  },
  voucherTitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  voucherDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#6B7280",
  },
  statusChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  conditionBox: {
    gap: 8,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#FFF7ED",
  },
  conditionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  conditionText: {
    flex: 1,
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 18,
  },
  voucherFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  minimumLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
  },
  minimumValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  useNowButton: {
    minWidth: 118,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EE4D2D",
  },
  useNowButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.white,
  },
});
