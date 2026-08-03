import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants";
import AppButton from "../common/AppButton";

type EmptyStateVariant = "empty" | "error" | "no-keyword";

interface EmptySearchStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  message?: string;
  actionText?: string;
  onAction?: () => void;
}

const variantConfig: Record<
  EmptyStateVariant,
  {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    message: string;
  }
> = {
  empty: {
    icon: "search-outline",
    title: "Không tìm thấy sản phẩm",
    message: "Không có kết quả phù hợp với từ khóa hoặc bộ lọc hiện tại.",
  },
  error: {
    icon: "alert-circle-outline",
    title: "Không thể tải kết quả",
    message: "Đã có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.",
  },
  "no-keyword": {
    icon: "search-circle-outline",
    title: "Nhập từ khóa để tìm kiếm",
    message: "Gõ tên sản phẩm hoặc nhóm hàng để xem kết quả theo danh mục.",
  },
};

export function EmptySearchState({
  variant = "empty",
  title,
  message,
  actionText,
  onAction,
}: EmptySearchStateProps) {
  const config = variantConfig[variant];

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={config.icon} size={34} color={Colors.primary} />
      </View>
      <Text style={styles.title}>{title ?? config.title}</Text>
      <Text style={styles.message}>{message ?? config.message}</Text>
      {actionText && onAction ? (
        <AppButton
          title={actionText}
          onPress={onAction}
          size="small"
          fullWidth={false}
          style={styles.actionButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: "#E7EFD8",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F8E9",
  },
  title: {
    marginTop: Spacing.md,
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  message: {
    marginTop: Spacing.sm,
    fontSize: FontSize.base,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  actionButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
});
