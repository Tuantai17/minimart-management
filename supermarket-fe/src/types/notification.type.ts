export interface AppNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  type?: "success" | "error" | "info" | "order_update";
}

export interface FCMDataPayload {
  order_code?: string;
  status?: string;
  [key: string]: string | undefined;
}
