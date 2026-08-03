export interface BestSellingProduct {
  product_id: number;
  name: string;
  category_id: number;
  category_name: string;
  image: string;
  unit: string;
  price: string | number;
  discount_price?: string | null;
  is_active: boolean;
  total_sold: number;
  order_count: number;
  revenue: string | number;
  rank: number;
}

export interface BestSellingProductFilter {
  limit?: number;
  start_date?: string;
  end_date?: string;
  category_id?: number;
  statuses?: string[];
  include_inactive?: boolean;
}
