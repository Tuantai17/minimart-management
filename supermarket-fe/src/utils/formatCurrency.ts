/** Format số tiền sang VNĐ: 150000 → "150.000đ" */
export const formatCurrency = (amount: number | string): string => {
  // Ép kiểu an toàn — backend có thể trả string "47900.00" hoặc number 47900.00
  const num = Math.round(Number(amount));
  if (!Number.isFinite(num)) return "0đ";
  return num.toLocaleString("vi-VN") + "đ";
};
