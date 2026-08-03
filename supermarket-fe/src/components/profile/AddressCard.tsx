import { Ionicons } from "@expo/vector-icons";
import {
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors } from "../../constants";
import type { Address } from "../../types";
import { confirmAction } from "../../utils";

interface AddressCardProps {
  address: Address;
  isDeleting?: boolean;
  isDefaulting?: boolean;
  onEdit: (address: Address) => void;
  onDelete: (address: Address) => void;
  onSetDefault: (address: Address) => void;
}

/**
 * Double-Bezel Architecture for Address Cards
 */
const BezelShell = ({
  children,
  outerRadius = 32,
}: {
  children: React.ReactNode;
  outerRadius?: number;
}) => (
  <View style={[styles.outerBezel, { borderRadius: outerRadius }]}>
    <View style={[styles.innerCore, { borderRadius: outerRadius - 6 }]}>
      {children}
    </View>
  </View>
);

export default function AddressCard({
  address,
  isDeleting = false,
  isDefaulting = false,
  onEdit,
  onDelete,
  onSetDefault,
}: AddressCardProps) {
  const handleDelete = async () => {
    const confirmed = await confirmAction({
      title: "Xác nhận xóa",
      message:
        "Địa chỉ này sẽ bị gỡ bỏ khỏi danh sách của bạn. Bạn có chắc chắn muốn xóa địa chỉ này không?",
      confirmText: "Xóa địa chỉ",
      cancelText: "Bỏ qua",
      isDestructive: true,
    });

    if (confirmed) {
      onDelete(address);
    }
  };

  return (
    <BezelShell>
      <View style={styles.cardContent}>
        {/* Header with Type Badge */}
        <View style={styles.header}>
          <View style={styles.typeBadge}>
            <Ionicons
              name="location-outline"
              size={14}
              color={Colors.primary}
            />
            <Text style={styles.typeText}>ĐỊA CHỈ NHẬN HÀNG</Text>
          </View>
          {address.is_default ? (
            <View style={styles.defaultPill}>
              <Text style={styles.defaultText}>Mặc định</Text>
            </View>
          ) : null}
        </View>

        {/* User Info */}
        <View style={styles.mainInfo}>
          <Text style={styles.fullName}>{address.full_name}</Text>
          <View style={styles.phoneStack}>
            <Ionicons name="call-outline" size={12} color="#9CA3AF" />
            <Text style={styles.phone}>{address.phone}</Text>
          </View>
        </View>

        {/* Address Lines */}
        <View style={styles.addressContainer}>
          <Text style={styles.addressLine} numberOfLines={2}>
            {address.street}, {address.district}, {address.province}
          </Text>
          {address.note ? (
            <View style={styles.noteBox}>
              <Ionicons
                name="chatbox-ellipses-outline"
                size={12}
                color="#9CA3AF"
              />
              <Text style={styles.noteText}>{address.note}</Text>
            </View>
          ) : null}
        </View>

        {/* High-End Action Bar */}
        <View style={styles.divider} />
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => onEdit(address)}
            activeOpacity={0.6}
          >
            <View style={styles.actionIconCircle}>
              <Ionicons name="create-outline" size={16} color="#4B5563" />
            </View>
            <Text style={styles.actionText}>Sửa</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => void handleDelete()}
            activeOpacity={0.6}
            disabled={isDeleting}
          >
            <View
              style={[styles.actionIconCircle, { backgroundColor: "#FEF2F2" }]}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </View>
            <Text style={[styles.actionText, { color: "#EF4444" }]}>
              {isDeleting ? "..." : "Xóa"}
            </Text>
          </TouchableOpacity>

          {!address.is_default ? (
            <TouchableOpacity
              style={styles.defaultToggle}
              onPress={() => onSetDefault(address)}
              disabled={isDefaulting}
            >
              <Text style={styles.defaultToggleText}>
                {isDefaulting ? "Đang đặt..." : "Thiết lập mặc định"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </BezelShell>
  );
}

const styles = StyleSheet.create({
  outerBezel: {
    backgroundColor: "rgba(0,0,0,0.025)",
    padding: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 10px 30px -10px rgba(0,0,0,0.05)",
      },
    }),
  },
  innerCore: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  cardContent: {
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  defaultPill: {
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  defaultText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
  },
  mainInfo: {
    marginBottom: 12,
  },
  fullName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  phoneStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  phone: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
  },
  addressContainer: {
    marginBottom: 20,
  },
  addressLine: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    fontWeight: "500",
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    backgroundColor: "#F9FAFB",
    padding: 8,
    borderRadius: 10,
    gap: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4B5563",
  },
  defaultToggle: {
    marginLeft: "auto",
  },
  defaultToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
    textDecorationLine: "underline",
  },
});
