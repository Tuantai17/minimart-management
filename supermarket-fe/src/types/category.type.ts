/**
 * ============================
 * CATEGORY TYPES
 * ============================
 */

import type { Product } from "./product.type";

export interface Category {
  id: number;
  name: string;
  image: string; // The URL of the image
  icon?: string | null;
  color?: string | null;
  parent?: number | null;
  children?: Category[];
  products?: Product[];
}
