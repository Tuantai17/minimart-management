import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors, Shadow } from "../src/constants";
import { useAuthStore, useVoucherStore } from "../src/store";
import type { VoucherCatalogItem, VoucherClaimStatus } from "../src/types";
import { formatCurrency } from "../src/utils";

const getStatusMeta = (status: VoucherClaimStatus) => {
  switch (status) {
    case "claimable":
      return {
        chipLabel: "Có thể nhận",
        chipBg: "#DCFCE7",
        chipColor: "#047857",
        buttonLabel: "Nhận ngay",
        buttonBg: "#EE4D2D",
        buttonTextColor: "#FFFFFF",
      };
    case "claimed":
      return {
        chipLabel: "Đã nhận",
        chipBg: "#E0E7FF",
        chipColor: "#4338CA",
        buttonLabel: "Đã lưu",
        buttonBg: "#E5E7EB",
        buttonTextColor: "#6B7280",
      };
    case "out_of_stock":
      return {
        chipLabel: "Đã hết",
        chipBg: "#FEE2E2",
        chipColor: "#B91C1C",
        buttonLabel: "Hết lượt",
        buttonBg: "#E5E7EB",
        buttonTextColor: "#9CA3AF",
      };
    case "expired":
      return {
        chipLabel: "Hết hạn",
        chipBg: "#F3F4F6",
        chipColor: "#6B7280",
        buttonLabel: "Hết hạn",
        buttonBg: "#E5E7EB",
        buttonTextColor: "#9CA3AF",
      };
    default:
      return {
        chipLabel: "Cần điều kiện",
        chipBg: "#FEF3C7",
        chipColor: "#B45309",
        buttonLabel: "Chưa đủ điều kiện",
        buttonBg: "#F3F4F6",
        buttonTextColor: "#9CA3AF",
      };
  }
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "Không giới hạn";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("vi-VN");
};

const buildVoucherRewardText = (voucher: VoucherCatalogItem) => {
  if (voucher.discount_type === "FIXED") {
    return `Giảm ${formatCurrency(Number(voucher.discount_value || 0))}`;
  }

  if (voucher.discount_type === "PERCENT") {
    const maxDiscount = voucher.max_discount_amount
      ? ` tối đa ${formatCurrency(Number(voucher.max_discount_amount))}`
      : "";

    return `Giảm ${voucher.discount_value}%${maxDiscount}`;
  }

  return "Ưu đãi vận chuyển";
};

const buildClaimHint = (voucher: VoucherCatalogItem) => {
  const conditions = voucher.claim_conditions;
  const pieces: string[] = [];

  if (conditions.requires_login) {
    pieces.push("Cần đăng nhập");
  }

  if (conditions.requires_phone_verified) {
    pieces.push("Cần xác thực số điện thoại");
  }

  if (conditions.min_completed_orders > 0) {
    pieces.push(`Tối thiểu ${conditions.min_completed_orders} đơn hoàn tất`);
  }

  if (Number(conditions.min_lifetime_spend) > 0) {
    pieces.push(
      `Tổng chi tiêu từ ${formatCurrency(Number(conditions.min_lifetime_spend))}`,
    );
  }

  if (conditions.required_membership_tier) {
    pieces.push(`Hạng ${conditions.required_membership_tier}`);
  }

  return pieces.length > 0
    ? pieces.join(" • ")
    : "Không có điều kiện nhận thêm";
};

export default function VoucherCatalogScreen() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const {
    catalog,
    isLoadingCatalog,
    isClaimingVoucher,
    voucherError,
    fetchVoucherCatalog,
    claimVoucher,
    clearVoucherError,
  } = useVoucherStore();

  useEffect(() => {
    void fetchVoucherCatalog().catch(() => undefined);
  }, [fetchVoucherCatalog]);

  const summary = useMemo(() => {
    const claimableCount = catalog.filter(
      (voucher) => voucher.claim_status === "claimable",
    ).length;
    const claimedCount = catalog.filter(
      (voucher) => voucher.claim_status === "claimed",
    ).length;

    return {
      total: catalog.length,
      claimable: claimableCount,
      claimed: claimedCount,
    };
  }, [catalog]);

  const handleRefresh = async () => {
    clearVoucherError();
    try {
      await fetchVoucherCatalog();
    } catch {
      // Lỗi đã được giữ trong store để hiển thị ở UI.
    }
  };

  const handleClaimVoucher = async (voucher: VoucherCatalogItem) => {
    if (!isLoggedIn) {
      Alert.alert(
        "Cần đăng nhập",
        "Bạn cần đăng nhập để nhận voucher vào ví của mình.",
        [
          { text: "Để sau", style: "cancel" },
          {
            text: "Đăng nhập",
            onPress: () => router.push("/(auth)/login" as any),
          },
        ],
      );
      return;
    }

    try {
      await claimVoucher(voucher.id);
      Alert.alert("Thành công", "Voucher đã được lưu vào ví của bạn.");
    } catch {
      // Lỗi đã được giữ trong store.
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
          <Text style={styles.headerTitle}>Kho Voucher</Text>
          <Text style={styles.headerSubtitle}>Nơi nhận thêm voucher mới</Text>
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
            <Ionicons name="gift-outline" size={16} color="#FFE7E0" />
            <Text style={styles.heroBadgeText}>Kho nhận voucher</Text>
          </View>

          <Text style={styles.heroTitle}>Khám phá voucher mới</Text>
          <Text style={styles.heroDescription}>
            Đây là khu vực để bạn nhận voucher. Sau khi nhận thành công, voucher
            sẽ xuất hiện trong trang “Mã giảm giá của tôi”.
          </Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{summary.total}</Text>
              <Text style={styles.heroStatLabel}>Tổng voucher</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{summary.claimable}</Text>
              <Text style={styles.heroStatLabel}>Có thể nhận</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{summary.claimed}</Text>
              <Text style={styles.heroStatLabel}>Đã nhận</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.walletButton}
            activeOpacity={0.88}
            onPress={() => router.push("/profile/vouchers" as any)}
          >
            <Ionicons name="wallet-outline" size={16} color="#EE4D2D" />
            <Text style={styles.walletButtonText}>Mở ví voucher của tôi</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Voucher đang mở nhận</Text>
          <Text style={styles.sectionSubtitle}>
            Nhận voucher tại đây trước, sau đó xem lại trong ví voucher cá nhân
          </Text>
        </View>

        {voucherError ? (
          <View style={styles.noticeCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
            <Text style={styles.noticeText}>{voucherError}</Text>
          </View>
        ) : null}

        {isLoadingCatalog ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tải kho voucher...</Text>
          </View>
        ) : null}

        {!isLoadingCatalog && catalog.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="file-tray-outline" size={42} color="#F97316" />
            <Text style={styles.emptyTitle}>Chưa có voucher khả dụng</Text>
            <Text style={styles.emptyText}>
              Hiện tại chưa có voucher nào đang mở cho người dùng nhận.
            </Text>
          </View>
        ) : null}

        {!isLoadingCatalog
          ? catalog.map((voucher) => {
              const statusMeta = getStatusMeta(voucher.claim_status);
              const canClaim = voucher.claim_status === "claimable";
              const isClaimed = voucher.claim_status === "claimed";
              const accentColor = voucher.display?.accent_color || "#EE4D2D";
              const rewardText = buildVoucherRewardText(voucher);
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
                    <Text style={styles.voucherRailCaption}>MiniMart</Text>
                  </View>

                  <View style={styles.voucherBody}>
                    <View style={styles.voucherTopRow}>
                      <View style={styles.voucherTextWrap}>
                        <Text style={styles.voucherRewardText}>
                          {rewardText}
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
                          {voucher.claim_requirement_text ||
                            buildClaimHint(voucher)}
                        </Text>
                      </View>
                      <View style={styles.conditionRow}>
                        <Ionicons
                          name="time-outline"
                          size={15}
                          color="#64748B"
                        />
                        <Text style={styles.conditionText}>
                          HSD: {formatDate(voucher.end_at)}
                        </Text>
                      </View>
                      <View style={styles.conditionRow}>
                        <Ionicons
                          name="albums-outline"
                          size={15}
                          color="#64748B"
                        />
                        <Text style={styles.conditionText}>
                          {voucher.apply_requirement_text}
                        </Text>
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
                        style={[
                          styles.claimButton,
                          { backgroundColor: statusMeta.buttonBg },
                        ]}
                        activeOpacity={0.88}
                        disabled={!canClaim || isClaimingVoucher}
                        onPress={() => void handleClaimVoucher(voucher)}
                        id={`claim-voucher-${voucher.code.toLowerCase()}`}
                      >
                        {isClaimingVoucher ? (
                          <ActivityIndicator
                            size="small"
                            color={statusMeta.buttonTextColor}
                          />
                        ) : (
                          <Text
                            style={[
                              styles.claimButtonText,
                              { color: statusMeta.buttonTextColor },
                            ]}
                          >
                            {statusMeta.buttonLabel}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    {isClaimed ? (
                      <View style={styles.claimedHintBox}>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={Colors.primary}
                        />
                        <Text style={styles.claimedHintText}>
                          Voucher đã được lưu. Hãy mở trang “Mã giảm giá của
                          tôi” để xem lại ví voucher cá nhân.
                        </Text>
                      </View>
                    ) : null}
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
  walletButton: {
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
  walletButtonText: {
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
  claimButton: {
    minWidth: 118,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  claimButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  claimedHintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    padding: 12,
  },
  claimedHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#166534",
    fontWeight: "500",
  },
});
