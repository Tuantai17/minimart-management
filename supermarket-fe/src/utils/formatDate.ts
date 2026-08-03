/** Format ngày tháng */
export const formatDate = (dateString?: string | null): string => {
  if (!dateString) return "---";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "---";
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
};

export const formatDateTime = (dateString?: string | null): string => {
  if (!dateString) return "---";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "---";
  return `${formatDate(dateString)} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

export const formatCurrency = (amount: number): string => {
  if (!amount && amount !== 0) return "0đ";
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "đ";
};
