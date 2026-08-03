import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import EmptyState from "../common/EmptyState";
import Loading from "../common/Loading";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../constants";
import { formatAddressFull } from "../../utils";
import type { Address } from "../../types";

interface DeliveryAddressSelectorProps {
  visible: boolean;
  addresses: Address[];
  selectedAddressId: number | null;
  isLoading: boolean;
  onClose: () => void;
  onSelect: (address: Address) => void;
  onManageAddresses: () => void;
  onAddAddress: () => void;
}

export default function DeliveryAddressSelector({
  visible,
  addresses,
  selectedAddressId,
  isLoading,
  onClose,
  onSelect,
  onManageAddresses,
  onAddAddress,
}: DeliveryAddressSelectorProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable>
            <View style={styles.sheet}>
              <View style={styles.header}>
                <Text style={styles.title}>Chọn địa chỉ giao đến</Text>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {isLoading ? (
                <View style={styles.stateWrapper}>
                  <Loading text="Đang tải địa chỉ giao hàng..." />
                </View>
              ) : addresses.length === 0 ? (
                <View style={styles.stateWrapper}>
                  <EmptyState
                    icon="location-outline"
                    title="Chưa có địa chỉ giao hàng"
                    message="Thêm địa chỉ để chúng tôi giao hàng nhanh hơn."
                    actionText="Thêm địa chỉ ngay"
                    onAction={onAddAddress}
                  />
                </View>
              ) : (
                <ScrollView
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                >
                  {addresses.map((address) => {
                    const isSelected = address.id === selectedAddressId;

                    return (
                      <TouchableOpacity
                        key={address.id}
                        style={[
                          styles.addressCard,
                          isSelected ? styles.addressCardSelected : null,
                        ]}
                        activeOpacity={0.85}
                        onPress={() => onSelect(address)}
                      >
                        <View style={styles.addressHeader}>
                          <View style={styles.radioWrapper}>
                            <Ionicons
                              name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                              size={24}
                              color={isSelected ? Colors.primary : "#D1D5DB"}
                            />
                          </View>
                          <View style={styles.addressInfo}>
                            <View style={styles.nameRow}>
                              <Text style={styles.name}>{address.full_name}</Text>
                              {address.is_default && (
                                <View style={styles.defaultBadge}>
                                  <Text style={styles.defaultBadgeText}>Mặc định</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.phone}>{address.phone}</Text>
                            <Text style={styles.addressText}>{formatAddressFull(address)}</Text>
                            {!!address.note && (
                              <View style={styles.noteBox}>
                                <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
                                <Text style={styles.note}>Ghi chú: {address.note}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.footerBtn, styles.footerBtnOutline]}
                  onPress={onManageAddresses}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.footerBtnText, styles.footerBtnOutlineText]}>
                    Quản lý địa chỉ
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.footerBtn} 
                  onPress={onAddAddress}
                  activeOpacity={0.8}
                >
                  <Text style={styles.footerBtnText}>Thêm địa chỉ mới</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#F9FAFB", // Nền tổng thể sáng hơn
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: "85%",
    minHeight: 400,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    ...Shadow.large,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  stateWrapper: {
    minHeight: 260,
    justifyContent: "center",
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 16,
    paddingBottom: 24,
    paddingHorizontal: 2,
  },
  addressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...Shadow.small,
    shadowColor: "#000",
    shadowOpacity: 0.04,
  },
  addressCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4", // Lục nhạt tinh tế
    ...Shadow.medium,
    shadowColor: Colors.primary,
    shadowOpacity: 0.08,
  },
  addressHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  radioWrapper: {
    marginRight: 14,
    marginTop: 2,
  },
  addressInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
    flex: 1,
    marginRight: 10,
  },
  phone: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
  },
  addressText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#4B5563",
    fontWeight: "500",
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  note: {
    fontSize: 13,
    color: "#6B7280",
    flex: 1,
  },
  defaultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: "#E0E7FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4F46E5",
    textTransform: "uppercase",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },
  footerBtn: {
    flex: 1,
    height: 52,
    borderRadius: 100,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnOutline: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  footerBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  footerBtnOutlineText: {
    color: "#374151",
  },
});
