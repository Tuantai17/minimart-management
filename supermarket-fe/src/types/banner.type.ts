export interface Banner {
  id: number;
  title: string;
  image: string;
  link: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}
