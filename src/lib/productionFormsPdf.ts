import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AMIRI_REGULAR_BASE64 } from "@/assets/amiriFont";

/**
 * Production forms PDF generators.
 * Mirrors the Miracle Medical Industries paper templates (forms 01, 02, 04, 05, 06, 07).
 *
 * Font note: Arabic labels are rendered using the embedded Amiri TTF. jsPDF does not
 * perform Arabic shaping, so labels appear as isolated glyphs. English remains the
 * primary printed label; Arabic captions are shown alongside as visual reference,
 * matching the bilingual style of the originals.
 */

const PAGE_W = 210; // A4 width mm
const PAGE_H = 297;
const MARGIN = 12;

let amiriRegistered = false;
function ensureAmiri(doc: jsPDF) {
  if (amiriRegistered) {
    doc.addFileToVFS("Amiri-Regular.ttf", AMIRI_REGULAR_BASE64);
    doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
    return;
  }
  doc.addFileToVFS("Amiri-Regular.ttf", AMIRI_REGULAR_BASE64);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  amiriRegistered = true;
}

function drawHeader(doc: jsPDF, titleEn: string, titleAr: string) {
  const headerH = 22;
  // Outer border
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, MARGIN, PAGE_W - MARGIN * 2, headerH);

  // Logo cell (left)
  const logoW = 38;
  doc.line(MARGIN + logoW, MARGIN, MARGIN + logoW, MARGIN + headerH);

  // Logo text placeholder (Miracle wordmark)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 80, 140);
  doc.text("Miracle", MARGIN + logoW / 2, MARGIN + 9, { align: "center" });
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("MEDICAL INDUSTRIES", MARGIN + logoW / 2, MARGIN + 14, { align: "center" });
  doc.setTextColor(0);

  // Title cell
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(titleEn, MARGIN + logoW + (PAGE_W - MARGIN * 2 - logoW) / 2, MARGIN + 10, {
    align: "center",
  });
  ensureAmiri(doc);
  doc.setFont("Amiri", "normal");
  doc.setFontSize(12);
  doc.text(titleAr, MARGIN + logoW + (PAGE_W - MARGIN * 2 - logoW) / 2, MARGIN + 17, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
}

function drawFooter(doc: jsPDF, refNo: string, revNo: string = "01") {
  const y = PAGE_H - MARGIN - 8;
  const w = PAGE_W - MARGIN * 2;
  const colW = w / 3;
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, w, 8);
  doc.line(MARGIN + colW, y, MARGIN + colW, y + 8);
  doc.line(MARGIN + colW * 2, y, MARGIN + colW * 2, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Ref. no.: ${refNo}`, MARGIN + 2, y + 5);
  doc.text("Page 1 of 1", MARGIN + colW + colW / 2, y + 5, { align: "center" });
  doc.text(`Rev. no.: ${revNo}`, MARGIN + colW * 2 + 2, y + 5);
}

function fmtDate(d?: string | Date | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function downloadDoc(doc: jsPDF, filename: string) {
  doc.save(filename);
}

// ──────────────────────────────────────────────────────────────────────────────
// 01 — Weekly Production Plan
// ──────────────────────────────────────────────────────────────────────────────

export type WeeklyPlanRow = {
  workOrderNo: string;
  productName: string;
  sat: number; sun: number; mon: number; tue: number; wed: number; thu: number;
  total: number;
};

export type WeeklyPlanData = {
  weekFrom: string;
  weekTo: string;
  rows: WeeklyPlanRow[];
};

export function generateWeeklyProductionPlanPDF(data: WeeklyPlanData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawHeader(doc, "Weekly Production Plan", "خطة الإنتاج الأسبوعية");

  const y0 = MARGIN + 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Week: ${fmtDate(data.weekFrom)}  →  ${fmtDate(data.weekTo)}`, MARGIN, y0);

  autoTable(doc, {
    startY: y0 + 4,
    head: [["Work Order No.", "Product", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Total"]],
    body: data.rows.map((r) => [
      r.workOrderNo, r.productName, r.sat, r.sun, r.mon, r.tue, r.wed, r.thu, r.total,
    ]),
    styles: { fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2, halign: "center" },
    headStyles: { fillColor: [220, 230, 241], textColor: 0, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "left", cellWidth: 25 },
      1: { halign: "left", cellWidth: 50 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // Signatures
  const sigY = PAGE_H - MARGIN - 30;
  doc.setFontSize(10);
  doc.text("Prepared by: ____________________", MARGIN, sigY);
  doc.text("Approved by: ____________________", PAGE_W - MARGIN, sigY, { align: "right" });

  drawFooter(doc, "02/01/01/01");
  downloadDoc(doc, `01_WPP_${fmtDate(data.weekFrom).replace(/\//g, "")}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 02 — Production Order Form
// ──────────────────────────────────────────────────────────────────────────────

export type ProductionOrderItem = {
  productName: string;
  quantity: number;
  unit: string;
  remarks: string;
};

export type ProductionOrderData = {
  orderNumber: string;
  customer: string;
  issueDate: string;
  deliveryDate?: string | null;
  items: ProductionOrderItem[];
};

export function generateProductionOrderPDF(data: ProductionOrderData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawHeader(doc, "Production Order Form", "أمر الإنتاج");

  const y0 = MARGIN + 26;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const labelVal = (label: string, val: string, x: number, y: number, w: number) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    const lw = doc.getTextWidth(label) + 2;
    doc.text(val, x + lw, y);
    doc.line(x + lw, y + 1, x + w, y + 1);
  };

  labelVal("Order No.:", data.orderNumber, MARGIN, y0, MARGIN + 80);
  labelVal("Issue Date:", fmtDate(data.issueDate), PAGE_W / 2, y0, PAGE_W - MARGIN);
  labelVal("Customer:", data.customer, MARGIN, y0 + 8, MARGIN + 80);
  labelVal("Delivery Date:", fmtDate(data.deliveryDate), PAGE_W / 2, y0 + 8, PAGE_W - MARGIN);

  autoTable(doc, {
    startY: y0 + 16,
    head: [["#", "Product", "Quantity", "Unit", "Remarks"]],
    body: data.items.map((it, i) => [i + 1, it.productName, it.quantity, it.unit, it.remarks]),
    styles: { fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
    headStyles: { fillColor: [220, 230, 241], textColor: 0, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      2: { halign: "center", cellWidth: 25 },
      3: { halign: "center", cellWidth: 20 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  const sigY = PAGE_H - MARGIN - 30;
  doc.setFontSize(10);
  doc.text("Issued by: ____________________", MARGIN, sigY);
  doc.text("Production Mgr: ____________________", PAGE_W - MARGIN, sigY, { align: "right" });

  drawFooter(doc, "02/01/01/02");
  downloadDoc(doc, `02_PO_${data.orderNumber}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 04 — Accepted Items / Products Identification Tag
// ──────────────────────────────────────────────────────────────────────────────

export type AcceptedTagData = {
  productName: string;
  workOrderNo: string;
  deliveryDate?: string | null;
  quantity: number;
  unit: string;
  source: string;
  lotNo: string;
  date: string;
  inspectorName?: string;
};

export function generateAcceptedItemsTagPDF(data: AcceptedTagData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawHeader(doc, "Accepted Items / Products Identification Tag", "علامة تعريف المنتجات المقبولة");

  // Big "ACCEPTED" stamp
  const y0 = MARGIN + 30;
  doc.setDrawColor(0, 130, 50);
  doc.setLineWidth(0.8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(0, 130, 50);
  doc.text("ACCEPTED", PAGE_W / 2, y0 + 6, { align: "center" });
  doc.setLineWidth(0.5);
  doc.rect(PAGE_W / 2 - 35, y0 - 3, 70, 14);
  doc.setTextColor(0);
  doc.setDrawColor(0);

  const rows: [string, string][] = [
    ["Product / Item", data.productName],
    ["Work Order No.", data.workOrderNo],
    ["Delivery Date", fmtDate(data.deliveryDate)],
    ["Quantity", `${data.quantity} ${data.unit}`],
    ["Source", data.source],
    ["Lot No. / Box", data.lotNo],
    ["Date", fmtDate(data.date)],
    ["Inspector", data.inspectorName || ""],
  ];

  autoTable(doc, {
    startY: y0 + 22,
    body: rows,
    styles: { fontSize: 11, lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60, fillColor: [240, 244, 250] },
      1: { cellWidth: PAGE_W - MARGIN * 2 - 60 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  drawFooter(doc, "02/01/01/04");
  downloadDoc(doc, `04_AcceptedTag_${data.lotNo}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 05 — Hold Items / Products Identification Tag
// ──────────────────────────────────────────────────────────────────────────────

export type HoldTagData = {
  productName: string;
  orderNumber: string;
  quantity: number;
  unit: string;
  reason: string;
  additionalInfo: string;
  date: string;
  reportedBy?: string;
};

export function generateHoldItemsTagPDF(data: HoldTagData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawHeader(doc, "Hold Items / Products Identification Tag", "بطاقة تعريف المنتجات المحجوزة");

  // Big "HOLD" stamp
  const y0 = MARGIN + 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(190, 30, 30);
  doc.text("HOLD", PAGE_W / 2, y0 + 6, { align: "center" });
  doc.setDrawColor(190, 30, 30);
  doc.setLineWidth(0.8);
  doc.rect(PAGE_W / 2 - 25, y0 - 3, 50, 14);
  doc.setTextColor(0);
  doc.setDrawColor(0);

  const rows: [string, string][] = [
    ["Product / Item", data.productName],
    ["Order No.", data.orderNumber],
    ["Quantity", `${data.quantity} ${data.unit}`],
    ["Reason", data.reason],
    ["Additional Information", data.additionalInfo],
    ["Date", fmtDate(data.date)],
    ["Reported By", data.reportedBy || ""],
  ];

  autoTable(doc, {
    startY: y0 + 22,
    body: rows,
    styles: { fontSize: 11, lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60, fillColor: [253, 235, 235] },
      1: { cellWidth: PAGE_W - MARGIN * 2 - 60 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  drawFooter(doc, "02/01/01/05");
  downloadDoc(doc, `05_HoldTag_${data.orderNumber}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 06 — Delivery Order
// ──────────────────────────────────────────────────────────────────────────────

export type DeliveryOrderRow = {
  description: string;
  lot: string;
  unit: string;
  quantity: number;
};

export type DeliveryOrderData = {
  invoiceNumber: string;
  deliveryOrderNumber: string;
  vehicleNumber: string;
  orderNumber: string;
  customer: string;
  deliveryLocation: string;
  date: string;
  rows: DeliveryOrderRow[];
};

export function generateDeliveryOrderPDF(data: DeliveryOrderData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawHeader(doc, "Delivery Order", "أمر التوصيل");

  const y0 = MARGIN + 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const labelVal = (label: string, val: string, x: number, y: number, w: number) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    const lw = doc.getTextWidth(label) + 2;
    doc.text(val, x + lw, y);
    doc.line(x + lw, y + 1, x + w, y + 1);
  };

  labelVal("Invoice No.:", data.invoiceNumber, MARGIN, y0, PAGE_W / 2 - 4);
  labelVal("Date:", fmtDate(data.date), PAGE_W / 2, y0, PAGE_W - MARGIN);
  labelVal("Delivery Order No.:", data.deliveryOrderNumber, MARGIN, y0 + 8, PAGE_W / 2 - 4);
  labelVal("Order No.:", data.orderNumber, PAGE_W / 2, y0 + 8, PAGE_W - MARGIN);
  labelVal("Vehicle No.:", data.vehicleNumber, MARGIN, y0 + 16, PAGE_W / 2 - 4);
  labelVal("To:", data.customer, PAGE_W / 2, y0 + 16, PAGE_W - MARGIN);
  labelVal("Delivery Location:", data.deliveryLocation, MARGIN, y0 + 24, PAGE_W - MARGIN);

  const total = data.rows.reduce((s, r) => s + r.quantity, 0);

  autoTable(doc, {
    startY: y0 + 32,
    head: [["#", "Description", "Lot No.", "Unit", "Quantity"]],
    body: [
      ...data.rows.map((r, i) => [i + 1, r.description, r.lot, r.unit, r.quantity]),
      [{ content: "Total", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } }, total],
    ],
    styles: { fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
    headStyles: { fillColor: [220, 230, 241], textColor: 0, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      2: { halign: "center", cellWidth: 35 },
      3: { halign: "center", cellWidth: 20 },
      4: { halign: "center", cellWidth: 25 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // Acknowledgement block after table
  const finalY = (doc as any).lastAutoTable?.finalY ?? y0 + 60;
  let ay = finalY + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("I have received the above-mentioned goods after inspection and acceptance", MARGIN, ay);
  ensureAmiri(doc);
  doc.setFont("Amiri", "normal");
  doc.setFontSize(11);
  doc.text("لقد استلمت البضاعة المذكورة اعلاه بعد المعاينة والقبول", PAGE_W - MARGIN, ay + 6, { align: "right" });
  doc.setFont("helvetica", "normal");

  ay += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Receiver", MARGIN, ay);
  ensureAmiri(doc);
  doc.setFont("Amiri", "normal");
  doc.text("المستلم", MARGIN + 28, ay);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  ay += 8;
  doc.text("Name", MARGIN, ay);
  ensureAmiri(doc);
  doc.setFont("Amiri", "normal");
  doc.text("اسم", MARGIN + 14, ay);
  doc.setFont("helvetica", "normal");
  doc.text(": ........................................................................", MARGIN + 24, ay);

  ay += 8;
  doc.text("Signature", MARGIN, ay);
  ensureAmiri(doc);
  doc.setFont("Amiri", "normal");
  doc.text("التوقيع", MARGIN + 22, ay);
  doc.setFont("helvetica", "normal");
  doc.text(": ........................................................................", MARGIN + 36, ay);

  ay += 12;
  doc.setFont("helvetica", "bold");
  doc.text("Accounts Department", MARGIN, ay);
  ensureAmiri(doc);
  doc.setFont("Amiri", "normal");
  doc.text("قسم الحسابات", MARGIN + 48, ay);
  doc.setFont("helvetica", "bold");
  doc.text("Approved", PAGE_W - MARGIN - 40, ay);
  ensureAmiri(doc);
  doc.setFont("Amiri", "normal");
  doc.text("معتمد", PAGE_W - MARGIN - 18, ay);
  doc.setFont("helvetica", "normal");

  drawFooter(doc, "02/01/01/06");
  downloadDoc(doc, `06_DO_${data.deliveryOrderNumber}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 07 — Release Order Form
// ──────────────────────────────────────────────────────────────────────────────

export type ReleaseOrderRow = {
  description: string;
  unit: string;
  quantity: number;
  lot: string;
  notes: string;
};

export type ReleaseOrderData = {
  reference: string; // order or shipment code
  customer: string;
  date: string;
  rows: ReleaseOrderRow[];
};

export function generateReleaseOrderPDF(data: ReleaseOrderData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawHeader(doc, "Release Order Form", "طلب الإصدار");

  const y0 = MARGIN + 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const labelVal = (label: string, val: string, x: number, y: number, w: number) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    const lw = doc.getTextWidth(label) + 2;
    doc.text(val, x + lw, y);
    doc.line(x + lw, y + 1, x + w, y + 1);
  };

  labelVal("Reference:", data.reference, MARGIN, y0, PAGE_W / 2 - 4);
  labelVal("Date:", fmtDate(data.date), PAGE_W / 2, y0, PAGE_W - MARGIN);
  labelVal("Customer:", data.customer, MARGIN, y0 + 8, PAGE_W - MARGIN);

  autoTable(doc, {
    startY: y0 + 16,
    head: [["#", "Description", "Unit", "Quantity", "Lot No.", "Notes"]],
    body: data.rows.map((r, i) => [i + 1, r.description, r.unit, r.quantity, r.lot, r.notes]),
    styles: { fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.2 },
    headStyles: { fillColor: [220, 230, 241], textColor: 0, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      2: { halign: "center", cellWidth: 18 },
      3: { halign: "center", cellWidth: 22 },
      4: { halign: "center", cellWidth: 32 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  const sigY = PAGE_H - MARGIN - 30;
  doc.setFontSize(10);
  doc.text("Released by: ____________________", MARGIN, sigY);
  doc.text("Authorized by: ____________________", PAGE_W - MARGIN, sigY, { align: "right" });

  drawFooter(doc, "02/01/01/07");
  downloadDoc(doc, `07_RO_${data.reference}.pdf`);
}
