import { Ionicons } from "@expo/vector-icons";
import { memo, type RefObject } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants";

interface SearchHeaderProps {
  value: string;
  loading: boolean;
  cartCount?: number;
  inputRef?: RefObject<TextInput | null>;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onBack: () => void;
  onCart: () => void;
  onSubmit: () => void;
}

function SearchHeaderComponent({
  value,
  loading,
  cartCount = 0,
  inputRef,
  onChangeText,
  onClear,
  onBack,
  onCart,
  onSubmit,
}: SearchHeaderProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onBack}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-back" size={20} color={Colors.white} />
      </TouchableOpacity>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={Colors.textLight} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder="Bạn tìm gì?"
          placeholderTextColor={Colors.textLight}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          editable
        />
        {loading ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : value.trim() ? (
          <TouchableOpacity onPress={onClear} hitSlop={8} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={18} color={Colors.textLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.iconButton}
        onPress={onCart}
        activeOpacity={0.8}
      >
        <Ionicons name="cart-outline" size={20} color={Colors.white} />
        {cartCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {cartCount > 99 ? "99+" : cartCount}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

export const SearchHeader = memo(SearchHeaderComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: "#79BF2A",
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flex: 1,
    height: 42,
    borderRadius: Radius.sm,
    backgroundColor: Colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingVertical: 0,
  },
  badge: {
    position: "absolute",
    top: 3,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: "700",
  },
});
