export function buildInvoiceAnnouncement(total: number): string {
  return `تم حفظ الفاتورة. إجمالي الفاتورة ${Number(total).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} جنيه`;
}
