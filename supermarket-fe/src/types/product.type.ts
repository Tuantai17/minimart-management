/**
 * ============================
 * PRODUCT TYPES
 * ============================
 */

export interface Product {
  id: number;
  category: number;
  category_id?: number;
  category_name: string;
  name: string;
  price: string | number;
  discount_price?: string | null;
  stock_quantity: number;
  unit: string;
  description: string;
  image: string;
  is_active: boolean;
  
  // Các field UI tạm thời nếu API chưa có
  rating?: number;
  reviewCount?: number;
  isFlashSale?: boolean;

  // Các field mở rộng từ API best-selling
  total_sold?: number;
  order_count?: number;
  revenue?: string | number;
  rank?: number;
}

export interface ProductFilter {
  category?: number;
  category_id?: number;
  search?: string;
  flash_sale?: boolean;
  min_price?: number;
  max_price?: number;
  sort_by?: "price_asc" | "price_desc" | "rating" | "newest";
  page?: number;
  limit?: number;
}
