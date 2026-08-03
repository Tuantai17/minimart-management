import { create } from "zustand";

interface ToastState {
  visible: boolean;
  message: string;
  type: "success" | "error" | "info";
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  hideToast: () => void;
}

export const useUIStore = create<ToastState>((set) => ({
  visible: false,
  message: "",
  type: "info",
  showToast: (message, type = "info") => {
    set({ visible: true, message, type });
    // Tự động ẩn sau 3 giây
    setTimeout(() => {
      set({ visible: false });
    }, 3000);
  },
  hideToast: () => set({ visible: false }),
}));
