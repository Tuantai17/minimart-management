import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    buildShadow,
    Colors,
    FontSize,
    Radius,
    Spacing,
} from "../../src/constants";
import { categoryService } from "../../src/services/category.service";
import type { Category } from "../../src/types";

function CategoryHeader({
  onHome,
  onPressSearch,
}: {
  onHome: () => void;
  onPressSearch: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onHome} style={styles.headerBtn}>
            <View style={styles.headerIconCircle}>
              <Ionicons name="home" size={14} color={Colors.primary} />
            </View>
            <Text style={styles.headerBtnText}>Trang chủ</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <TouchableOpacity
            style={styles.searchPressable}
            activeOpacity={0.85}
            onPress={onPressSearch}
          >
            <Ionicons name="search" size={18} color="#999" />
            <Text style={styles.searchPlaceholder}>
              Tìm nhanh trong nhóm hàng...
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function CategoryGridItem({
  item,
  onPress,
}: {
  item: Category;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.gridItem}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={styles.gridImageBox}>
        <Image
          source={{ uri: item.image }}
          style={styles.gridImage}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.gridName} numberOfLines={2}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );
}

export default function CategoryScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        setError(null);

        const treeCategories = await categoryService.getTree();
        const rootCategories = Array.isArray(treeCategories)
          ? treeCategories
          : [];

        setCategories(rootCategories);
        setSelectedId((currentId) => {
          if (
            typeof currentId === "number" &&
            rootCategories.some((category) => category.id === currentId)
          ) {
            return currentId;
          }

          return rootCategories[0]?.id ?? null;
        });
      } catch (serviceError) {
        console.error(
          "[Category Screen] failed to load categories:",
          serviceError,
        );
        setCategories([]);
        setSelectedId(null);
        setError("Không thể tải danh mục. Vui lòng thử lại.");
      } finally {
        setLoading(false);
      }
    };

    void fetchCategories();
  }, []);

  const safeCategories = Array.isArray(categories) ? categories : [];

  const selectedCategory = useMemo(
    () => safeCategories.find((category) => category.id === selectedId) ?? null,
    [safeCategories, selectedId],
  );

  const displayedSubCategories = useMemo(
    () =>
      Array.isArray(selectedCategory?.children)
        ? selectedCategory.children
        : [],
    [selectedCategory],
  );

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    categoryService
      .getTree(true)
      .then((treeCategories) => {
        const rootCategories = Array.isArray(treeCategories)
          ? treeCategories
          : [];

        setCategories(rootCategories);
        setSelectedId(rootCategories[0]?.id ?? null);
      })
      .catch((serviceError) => {
        console.error("[Category Screen] retry failed:", serviceError);
        setError("Không thể tải danh mục. Vui lòng thử lại.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <View style={styles.container}>
      <CategoryHeader
        onHome={() => router.push("/(tabs)/home" as any)}
        onPressSearch={() =>
          router.push({
            pathname: "/search",
            params: selectedCategory
              ? {
                  source: "category",
                  categoryId: selectedCategory.id,
                  categoryName: selectedCategory.name,
                }
              : undefined,
          } as any)
        }
      />

      <View style={styles.body}>
        <View style={styles.sidebar}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.centerState}>
              <Ionicons name="alert-circle-outline" size={28} color="#E53935" />
              <Text style={styles.stateText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={handleRetry}
              >
                <Text style={styles.retryButtonText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : safeCategories.length === 0 ? (
            <View style={styles.centerState}>
              <Ionicons name="grid-outline" size={28} color="#B0B7C3" />
              <Text style={styles.stateText}>Chưa có danh mục</Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sidebarScroll}
            >
              {safeCategories.map((category) => {
                const isActive = selectedId === category.id;

                return (
                  <TouchableOpacity
                    key={`category-root-${category.id}`}
                    style={[
                      styles.sidebarItem,
                      isActive && styles.sidebarItemActive,
                    ]}
                    onPress={() => {
                      setSelectedId(category.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{ uri: category.image }}
                      style={styles.sidebarImage}
                      resizeMode="contain"
                    />
                    <Text
                      style={[
                        styles.sidebarText,
                        isActive && styles.sidebarTextActive,
                      ]}
                    >
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={styles.contentContainer}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.centerState}>
              <Ionicons name="folder-open-outline" size={48} color="#B0B7C3" />
              <Text style={styles.stateText}>
                Không thể hiển thị danh mục con
              </Text>
            </View>
          ) : displayedSubCategories.length === 0 ? (
            <View style={styles.centerState}>
              <Ionicons name="cube-outline" size={48} color="#B0B7C3" />
              <Text style={styles.stateText}>Chưa có danh mục con</Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.contentScroll}
            >
              <View style={styles.gridContainer}>
                {displayedSubCategories.map((subCategory) => (
                  <CategoryGridItem
                    key={`category-child-${subCategory.id}`}
                    item={subCategory}
                    onPress={() =>
                      router.push(
                        `/category/${selectedId}?level2Id=${subCategory.id}` as any,
                      )
                    }
                  />
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    backgroundColor: "#2E7D32",
    paddingTop: 50,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 12,
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  headerBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  headerBtnText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  searchBar: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    height: 40,
  },
  searchPressable: {
    flex: 1,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  searchPlaceholder: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: "#999",
  },
  body: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: "30%",
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderRightColor: "#EAEAEA",
  },
  sidebarScroll: {
    paddingBottom: 40,
  },
  sidebarItem: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
    borderStyle: "dashed",
    backgroundColor: "#fff",
  },
  sidebarItemActive: {
    backgroundColor: "#F0FDF4",
    borderStyle: "solid",
    borderBottomColor: "#F0FDF4",
  },
  sidebarImage: {
    width: 45,
    height: 45,
    marginBottom: 8,
  },
  sidebarText: {
    fontSize: 12,
    color: "#555",
    textAlign: "center",
    lineHeight: 16,
  },
  sidebarTextActive: {
    color: "#2E7D32",
    fontWeight: "700",
  },
  contentContainer: {
    width: "70%",
    backgroundColor: "#F9FAFB",
  },
  contentScroll: {
    padding: 12,
    paddingBottom: 40,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: "4.5%",
  },
  gridItem: {
    width: "30.3%",
    alignItems: "center",
    marginBottom: 16,
  },
  gridImageBox: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    padding: 8,
    ...buildShadow(0, 1, 0.05, 3),
  },
  gridImage: {
    width: "80%",
    height: "80%",
  },
  gridName: {
    fontSize: 11,
    color: "#333",
    textAlign: "center",
    lineHeight: 16,
    fontWeight: "500",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
  },
  stateText: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  retryButtonText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
});
