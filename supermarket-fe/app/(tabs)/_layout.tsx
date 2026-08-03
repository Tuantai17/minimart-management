import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Colors, FontSize } from "../../src/constants";
import { useAuthStore } from "../../src/store";

export default function TabsLayout() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);

  const displayName =
    user?.first_name ||
    user?.name ||
    user?.full_name ||
    user?.username ||
    profile?.name ||
    user?.email ||
    "Tài khoản";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: "Trang chủ",
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="category"
        options={{
          tabBarLabel: "Danh mục",
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons
                name={focused ? "grid" : "grid-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: "Đơn hàng",
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons
                name={focused ? "receipt" : "receipt-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: ({ color }) => (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.tabLabel, { color, paddingHorizontal: 4 }]}
            >
              {displayName}
            </Text>
          ),
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingBottom: 6,
    paddingTop: 6,
    height: 64,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px -2px 12px rgba(0, 0, 0, 0.06)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 8,
        }),
  },
  tabLabel: {
    fontSize: FontSize.xs,
    fontWeight: "600",
    marginTop: 2,
  },
  tabItem: {
    paddingBottom: 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrapActive: {
    backgroundColor: Colors.primarySurface,
  },
});
