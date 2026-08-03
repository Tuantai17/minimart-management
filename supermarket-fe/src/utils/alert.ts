import * as Print from "expo-print";
import { router } from "expo-router";
import { Alert, Platform } from "react-native";

type ConfirmActionOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
};

type ShowMessageOptions = {
  title?: string;
  message: string;
};

type PrintHtmlOptions = {
  blockedMessage?: string;
  failedMessage?: string;
};

const canUseWindowConfirm =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  typeof window.confirm === "function";

const canUseWindowOpen =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  typeof window.open === "function";

export const showMessage = ({
  title = "Thông báo",
  message,
}: ShowMessageOptions) => {
  Alert.alert(title, message);
};

export const confirmAction = async ({
  title,
  message,
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  isDestructive = false,
}: ConfirmActionOptions): Promise<boolean> => {
  if (canUseWindowConfirm) {
    return window.confirm(`${title}\n\n${message}`);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      {
        text: cancelText,
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: confirmText,
        style: isDestructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
};

export const printHtmlContent = async (
  html: string,
  options: PrintHtmlOptions = {},
): Promise<void> => {
  const {
    blockedMessage = "Trình duyệt đã chặn popup. Vui lòng cho phép popup để in phiếu.",
    failedMessage = "Không thể in phiếu. Vui lòng thử lại.",
  } = options;

  try {
    if (canUseWindowOpen) {
      const printWindow = window.open("", "_blank", "width=800,height=900");

      if (!printWindow) {
        showMessage({ title: "Không thể in", message: blockedMessage });
        return;
      }

      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };

      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          // noop
        }
      }, 600);

      return;
    }

    await Print.printAsync({ html });
  } catch {
    showMessage({ title: "Không thể in", message: failedMessage });
  }
};

export const showLoginRequireAlert = async () => {
  const message = "Bạn cần đăng nhập để thêm sản phẩm vào giỏ hàng.";
  const shouldNavigate = await confirmAction({
    title: "Yêu cầu đăng nhập",
    message: `${message} Chuyển đến trang đăng nhập?`,
    confirmText: "Đăng nhập",
    cancelText: "Để sau",
  });

  if (shouldNavigate) {
    router.push("/(auth)/login" as any);
  }
};
