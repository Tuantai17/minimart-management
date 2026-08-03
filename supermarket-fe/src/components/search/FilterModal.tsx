import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, FontSize, Radius, Spacing } from "../../constants";
import {
  createProductSearchFilters,
  DEFAULT_PRODUCT_SEARCH_FILTERS,
  PRICE_FILTER_OPTIONS,
  SORT_FILTER_OPTIONS,
} from "../../types/search";
import type {
  ProductOrderingValue,
  ProductPriceRangeKey,
  ProductSearchFilters,
} from "../../types/search";

interface FilterModalProps {
  visible: boolean;
  value: ProductSearchFilters;
  productCount?: number;
  onClose: () => void;
  onApply: (filters: ProductSearchFilters) => void;
}

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function FilterModal({
  visible,
  value,
  productCount = 0,
  onClose,
  onApply,
}: FilterModalProps) {
  const insets = useSafeAreaInsets();
  const [draftFilters, setDraftFilters] = useState<ProductSearchFilters>(
    createProductSearchFilters(value),
  );

  useEffect(() => {
    if (visible) {
      setDraftFilters(createProductSearchFilters(value));
    }
  }, [value, visible]);

  const safeProductCount =
    typeof productCount === "number" && Number.isFinite(productCount) && productCount >= 0
      ? productCount
      : 0;

  const applyLabel = useMemo(() => {
    return `Áp dụng (${safeProductCount} sản phẩm)`;
  }, [safeProductCount]);

  const toggleOrdering = (ordering: ProductOrderingValue) => {
    setDraftFilters((currentFilters) =>
      createProductSearchFilters({
        ...currentFilters,
        ordering: currentFilters.ordering === ordering ? null : ordering,
      }),
    );
  };

  const togglePriceRange = (priceRange: ProductPriceRangeKey) => {
    setDraftFilters((currentFilters) =>
      createProductSearchFilters({
        ...currentFilters,
        priceRange: currentFilters.priceRange === priceRange ? null : priceRange,
      }),
    );
  };

  const handleReset = () => {
    setDraftFilters(DEFAULT_PRODUCT_SEARCH_FILTERS);
  };

  const handleApply = () => {
    onApply(createProductSearchFilters(draftFilters));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.overlay} onPress={onClose} />

        <Pressable
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, Spacing.base),
            },
          ]}
          onPress={() => undefined}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Bộ lọc nâng cao</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sắp xếp sản phẩm</Text>
              <View style={styles.optionsWrap}>
                {SORT_FILTER_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    selected={draftFilters.ordering === option.value}
                    onPress={() => toggleOrdering(option.value)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Khoảng giá</Text>
              <View style={styles.optionsWrap}>
                {PRICE_FILTER_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    selected={draftFilters.priceRange === option.value}
                    onPress={() => togglePriceRange(option.value)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Chọn lại</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyButtonText}>{applyLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 24, 39, 0.42)",
  },
  sheet: {
    maxHeight: "82%",
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2E7",
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: "700",
  },
  closeButton: {
    position: "absolute",
    right: Spacing.base,
    top: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6F0",
  },
  content: {
    flexGrow: 0,
  },
  contentContainer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: "700",
  },
  optionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    minWidth: "46%",
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#D7E0CF",
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#ECFDF3",
  },
  chipPressed: {
    opacity: 0.9,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
    textAlign: "center",
  },
  chipTextSelected: {
    color: Colors.primary,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: "#EEF2E7",
  },
  resetButton: {
    flex: 0.92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    paddingVertical: 14,
  },
  resetButtonText: {
    color: Colors.primary,
    fontSize: FontSize.base,
    fontWeight: "600",
  },
  applyButton: {
    flex: 1.4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
  },
  applyButtonText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontWeight: "700",
  },
});
