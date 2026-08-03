import { Ionicons } from "@expo/vector-icons";
import { memo, type RefObject } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants";

interface SearchBarProps {
  value: string;
  placeholder?: string;
  showBackButton?: boolean;
  showCartButton?: boolean;
  cartCount?: number;
  inputRef?: RefObject<TextInput | null>;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  onPressBack?: () => void;
  onPressCart?: () => void;
  onClear: () => void;
}

function SearchBarComponent({
  value,
  placeholder = "Bạn tìm gì?",
  showBackButton = true,
  showCartButton = true,
  cartCount = 0,
  inputRef,
  onChangeText,
  onSubmitEditing,
  onPressBack,
  onPressCart,
  onClear,
}: SearchBarProps) {
  return (
    <View style={styles.container}>
      {showBackButton && (
        <TouchableOpacity style={styles.iconButton} onPress={onPressBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
        </TouchableOpacity>
      )}

      <View style={styles.searchInputWrap}>
        <Ionicons name="search-outline" size={18} color={Colors.textLight} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={Colors.textLight}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {!!value.trim() && (
          <TouchableOpacity onPress={onClear} hitSlop={8} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={18} color={Colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {showCartButton && (
        <TouchableOpacity style={styles.iconButton} onPress={onPressCart} activeOpacity={0.8}>
          <Ionicons name="cart-outline" size={20} color={Colors.white} />
          {cartCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

export const SearchBar = memo(SearchBarComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#77B729",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInputWrap: {
    flex: 1,
    height: 42,
    borderRadius: Radius.sm,
    backgroundColor: Colors.white,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 1,
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
