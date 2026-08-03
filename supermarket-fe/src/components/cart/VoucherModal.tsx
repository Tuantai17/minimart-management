import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../constants";
import type { AppliedVoucherPreview, UserVoucher } from "../../types";
import { formatCurrency } from "../../utils";

type Props = {
  visible: boolean;
  voucherCode: string;
  onChangeVoucherCode: (value: string) => void;
  isApplying: boolean;
  isLoadingVouchers: boolean;
  voucherList: UserVoucher[];
  appliedVoucher: AppliedVoucherPreview | null;
  errorMessage: string | null;
  subtotal: number;
  onClose: () => void;
  onApply: (code?: string) => void;
  onRemove: () => void;
  onRefresh: () => void;
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

export default function VoucherModal({
  visible,
  voucherCode,
  onChangeVoucherCode,
  isApplying,
  isLoadingVouchers,
  voucherList,
  appliedVoucher,
  errorMessage,
  subtotal,
  onClose,
  onApply,
  onRemove,
  onRefresh,
}: Props) {
  const normalizedCode = voucherCode.trim().toUpperCase();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.bottomSheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Chọn Voucher</Text>
              <Text style={styles.headerSubtitle}>
                Danh sách voucher đang lấy từ ví voucher của tài khoản hiện tại.
                Backend sẽ kiểm tra lại điều kiện khi bạn áp dụng mã.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#1A1A2E" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryStrip}>
            <View>
              <Text style={styles.summaryStripLabel}>Tạm tính đơn hàng</Text>
              <Text style={styles.summaryStripValue}>
                {formatCurrency(subtotal)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.summaryStripChip}
              onPress={onRefresh}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={14} color={Colors.white} />
              <Text style={styles.summaryStripChipText}>
                {voucherList.length} voucher của bạn
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nhập mã voucher</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="VD: TET2026"
                placeholderTextColor={Colors.textLight}
                value={voucherCode}
                onChangeText={(value) =>
                  onChangeVoucherCode(value.toUpperCase())
                }
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isApplying}
                id="voucher-code-input"
              />
              <TouchableOpacity
                style={[
                  styles.applyBtn,
                  (!normalizedCode || isApplying) && styles.applyBtnDisabled,
                ]}
                disabled={!normalizedCode || isApplying}
                onPress={() => onApply()}
                activeOpacity={0.8}
                id="voucher-apply-button"
              >
                {isApplying ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.applyBtnText}>Áp dụng</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={Colors.error}
              />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Voucher của tôi</Text>
              <Text style={styles.sectionSubTitle}>
                Chọn nhanh để tự điền mã
              </Text>
            </View>

            {isLoadingVouchers ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Đang tải ví voucher...</Text>
              </View>
            ) : null}

            {!isLoadingVouchers && voucherList.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="wallet-outline" size={28} color="#F97316" />
                <Text style={styles.emptyTitle}>Ví voucher đang trống</Text>
                <Text style={styles.emptyText}>
                  Hãy vào Kho Voucher để nhận mã trước khi áp dụng khi checkout.
                </Text>
              </View>
            ) : null}

            {!isLoadingVouchers
              ? voucherList.map((voucher) => {
                  const isEligible = voucher.status === "active";
                  const isActive = normalizedCode === voucher.code;
                  const isApplied =
                    appliedVoucher?.voucher_code?.toUpperCase() ===
                    voucher.code;
                  const accentColor =
                    voucher.display?.accent_color || "#EE4D2D";
                  const highlight =
                    voucher.display?.highlight || "Sẵn sàng áp dụng";
                  const badge = voucher.display?.badge || "Voucher của bạn";
                  const minOrderValue = Number(voucher.min_order_value || 0);
                  const neededAmount = Math.max(minOrderValue - subtotal, 0);

                  return (
                    <View
                      key={voucher.id}
                      style={[
                        styles.voucherCard,
                        isActive && styles.voucherCardActive,
                        !isEligible && styles.voucherCardDisabled,
                      ]}
                    >
                      <View
                        style={[
                          styles.voucherBanner,
                          { backgroundColor: accentColor },
                        ]}
                      >
                        <Ionicons
                          name="pricetags"
                          size={24}
                          color={Colors.white}
                        />
                        <Text style={styles.voucherBannerText}>{badge}</Text>
                        <Text style={styles.voucherBannerCode}>
                          {voucher.code}
                        </Text>
                      </View>

                      <View style={styles.voucherContent}>
                        <View style={styles.voucherTopRow}>
                          <Text style={styles.voucherItemTitle}>
                            {buildVoucherTitle(voucher)}
                          </Text>
                          <View style={styles.voucherHighlightChip}>
                            <Text style={styles.voucherHighlightText}>
                              {highlight}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.voucherItemDescription}>
                          {voucher.description ||
                            voucher.apply_requirement_text}
                        </Text>

                        {isEligible ? (
                          <Text style={styles.voucherEligibleText}>
                            {neededAmount > 0
                              ? `Cần mua thêm ${formatCurrency(neededAmount)} để đủ điều kiện backend.`
                              : voucher.apply_requirement_text ||
                                "Có thể dùng ngay cho đơn hiện tại."}
                          </Text>
                        ) : (
                          <Text style={styles.voucherRequirementText}>
                            Voucher đang ở trạng thái {voucher.status}. Không
                            thể áp dụng.
                          </Text>
                        )}

                        <View style={styles.metaInfoRow}>
                          <Text style={styles.metaInfoText}>
                            HSD: {formatDate(voucher.expires_at)}
                          </Text>
                          {minOrderValue > 0 ? (
                            <Text style={styles.metaInfoText}>
                              Từ {formatCurrency(minOrderValue)}
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.voucherFooterRow}>
                          <TouchableOpacity
                            style={styles.voucherCopyButton}
                            activeOpacity={0.8}
                            onPress={() => onChangeVoucherCode(voucher.code)}
                            id={`voucher-fill-${voucher.code.toLowerCase()}`}
                          >
                            <Ionicons
                              name="copy-outline"
                              size={14}
                              color={accentColor}
                            />
                            <Text
                              style={[
                                styles.voucherCopyButtonText,
                                { color: accentColor },
                              ]}
                            >
                              Chọn mã
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.voucherUseButton,
                              {
                                backgroundColor: isEligible
                                  ? accentColor
                                  : "#D1D5DB",
                              },
                            ]}
                            activeOpacity={0.85}
                            disabled={!isEligible || isApplying}
                            onPress={() => onApply(voucher.code)}
                            id={`voucher-use-${voucher.code.toLowerCase()}`}
                          >
                            <Text style={styles.voucherUseButtonText}>
                              {isApplied ? "Đã áp dụng" : "Dùng ngay"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
              : null}

            {appliedVoucher ? (
              <View style={styles.appliedCard}>
                <View style={styles.appliedHeader}>
                  <View style={styles.appliedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.appliedCode}>
                      {appliedVoucher.voucher_code}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onRemove}
                    activeOpacity={0.7}
                    id="voucher-remove-button"
                  >
                    <Text style={styles.removeText}>Gỡ mã</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.appliedMessage}>
                  {appliedVoucher.message}
                </Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Giảm giá dự kiến</Text>
                  <Text style={styles.metaDiscount}>
                    -{formatCurrency(appliedVoucher.discount_amount)}
                  </Text>
                </View>

                {typeof appliedVoucher.shipping_discount_amount === "number" ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Giảm phí vận chuyển</Text>
                    <Text style={styles.metaStrong}>
                      -{formatCurrency(appliedVoucher.shipping_discount_amount)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Tạm tính sau giảm</Text>
                  <Text style={styles.metaStrong}>
                    {formatCurrency(appliedVoucher.final_subtotal)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.tipBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={Colors.primary}
                />
                <Text style={styles.tipText}>
                  Nếu bạn thay đổi số lượng sản phẩm sau khi áp dụng mã, hệ
                  thống sẽ yêu cầu áp dụng lại để backend tính đúng ưu đãi mới
                  nhất.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    backgroundColor: "#FFF6F3",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "86%",
    paddingTop: Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.large,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  closeBtn: {
    width: 34,
    height: 34,
    backgroundColor: "#FFF1EC",
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  summaryStrip: {
    backgroundColor: "#EE4D2D",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  summaryStripLabel: {
    fontSize: FontSize.sm,
    color: "rgba(255,255,255,0.82)",
  },
  summaryStripValue: {
    marginTop: 3,
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.white,
  },
  summaryStripChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryStripChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.white,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
  },
  input: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: "#FED7C3",
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  applyBtn: {
    minWidth: 110,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EE4D2D",
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  applyBtnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  applyBtnText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: FontSize.base,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFF1F2",
    borderRadius: 16,
    padding: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.error,
    lineHeight: 20,
    fontWeight: "500",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.md,
    paddingBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSubTitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 14,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  emptyBox: {
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.white,
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: "800",
    color: "#111827",
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: "center",
  },
  voucherCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FCE3D9",
    flexDirection: "row",
  },
  voucherCardActive: {
    borderColor: "#EE4D2D",
    transform: [{ scale: 1.01 }],
  },
  voucherCardDisabled: {
    opacity: 0.78,
  },
  voucherBanner: {
    width: 110,
    paddingHorizontal: 12,
    paddingVertical: 16,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  voucherBannerText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.92)",
    fontWeight: "700",
  },
  voucherBannerCode: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.white,
  },
  voucherContent: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  voucherTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  voucherItemTitle: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: "800",
    color: "#111827",
  },
  voucherHighlightChip: {
    backgroundColor: "#FFF1EC",
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  voucherHighlightText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#EE4D2D",
  },
  voucherItemDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  voucherEligibleText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: "700",
  },
  voucherRequirementText: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: "700",
  },
  metaInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  metaInfoText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  voucherFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  voucherCopyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  voucherCopyButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  voucherUseButton: {
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  voucherUseButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.white,
  },
  appliedCard: {
    backgroundColor: "#F4FBF6",
    borderRadius: 18,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#D9EFE0",
    gap: Spacing.sm,
  },
  appliedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.sm,
  },
  appliedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  appliedCode: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.primary,
  },
  removeText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.error,
  },
  appliedMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  metaDiscount: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.error,
  },
  metaStrong: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.primary,
  },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFF7ED",
    borderRadius: 18,
    padding: Spacing.md,
  },
  tipText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: "#C2410C",
    lineHeight: 20,
    fontWeight: "500",
  },
});
