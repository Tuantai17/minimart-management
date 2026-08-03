import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants";

interface Props extends TextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  helperText?: string;
}

export default function AppInput({
  label,
  icon,
  error,
  helperText,
  secureTextEntry,
  style,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const isDisabled = rest.editable === false;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.container,
          focused && !isDisabled ? styles.focused : null,
          isDisabled ? styles.disabled : null,
          error ? styles.error : null,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={
              isDisabled
                ? Colors.textSecondary
                : focused
                  ? Colors.primary
                  : Colors.textLight
            }
            style={styles.icon}
          />
        ) : null}
        <TextInput
          {...rest}
          style={[styles.input, isDisabled ? styles.inputDisabled : null, style]}
          secureTextEntry={secureTextEntry && !showPwd}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={Colors.textLight}
        />
        {secureTextEntry ? (
          <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={styles.eyeBtn}>
            <Ionicons
              name={showPwd ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={Colors.textLight}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {!error && helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.base },
  label: {
    fontSize: FontSize.base,
    fontWeight: "500",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 50,
  },
  focused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  disabled: {
    backgroundColor: "#F3F4F6",
    borderColor: Colors.divider,
  },
  error: { borderColor: Colors.error },
  icon: { marginRight: Spacing.sm },
  input: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  inputDisabled: {
    color: Colors.textSecondary,
  },
  eyeBtn: { padding: Spacing.xs },
  helperText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
});
