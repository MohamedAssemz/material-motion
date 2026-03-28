import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';

interface ShipmentData {
  id: string;
  shipment_code: string;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
}

interface OrderItemData {
  product_name: string;
  sku: string;
  size: string | null;
  quantity: number;
}

interface PackingInvoiceInput {
  orderId: string;
  orderNumber: string;
  customerName: string;
}

export async function generatePackingInvoice({ orderId, orderNumber, customerName }: PackingInvoiceInput) {
  // Fetch shipments for this order
  const { data: shipments, error: shipErr } = await supabase
    .from('shipments')
    .select('id, shipment_code, weight_kg, length_cm, width_cm, height_cm')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (shipErr) throw shipErr;
  if (!shipments || shipments.length === 0) throw new Error('No shipments found');

  // Fetch order items with product info
  const { data: orderItems, error: itemErr } = await supabase
    .from('order_items')
    .select('id, quantity, size, product:products(name_en, sku)')
    .eq('order_id', orderId);

  if (itemErr) throw itemErr;

  // Fetch shipped batches to know which product/size is in which shipment
  const { data: batches, error: batchErr } = await supabase
    .from('order_batches')
    .select('id, shipment_id, product_id, order_item_id, quantity, product:products(name_en, sku)')
    .eq('order_id', orderId)
    .eq('current_state', 'shipped')
    .not('shipment_id', 'is', null);

  if (batchErr) throw batchErr;

  // Build shipment-to-items mapping: each row = one shipment with its contents
  const shipmentMap = new Map<string, { shipment: ShipmentData; items: { name: string; sku: string; size: string; qty: number }[] }>();
  
  for (const s of shipments) {
    shipmentMap.set(s.id, { shipment: s as ShipmentData, items: [] });
  }

  // Get order item sizes
  const orderItemSizeMap = new Map<string, string>();
  if (orderItems) {
    for (const oi of orderItems) {
      orderItemSizeMap.set(oi.id, oi.size || '');
    }
  }

  if (batches) {
    for (const b of batches) {
      if (!b.shipment_id) continue;
      const entry = shipmentMap.get(b.shipment_id);
      if (!entry) continue;
      const product = b.product as any;
      const size = b.order_item_id ? (orderItemSizeMap.get(b.order_item_id) || '') : '';
      entry.items.push({
        name: product?.name_en || '',
        sku: product?.sku || '',
        size,
        qty: b.quantity,
      });
    }
  }

  const currentYear = new Date().getFullYear();
  const today = new Date();
  const dateStr = `Date ${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${currentYear}`;

  // Build carton size strings per shipment
  const getCartonSize = (s: ShipmentData) => {
    if (s.length_cm && s.width_cm && s.height_cm) {
      return `${s.length_cm}*${s.width_cm}*${s.height_cm}`;
    }
    return '';
  };

  // Unique carton sizes
  const uniqueCartonSizes = [...new Set(shipments.map(s => getCartonSize(s as ShipmentData)).filter(Boolean))];

  // Total weight
  const totalWeight = shipments.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);

  const wb = new ExcelJS.Workbook();

  // ====== PACKING LIST SHEET ======
  const plSheet = wb.addWorksheet('PACKING LIST');

  // Column widths
  plSheet.columns = [
    { width: 6 },   // A - no.
    { width: 35 },  // B - Product
    { width: 15 },  // C - Code
    { width: 10 },  // D - size
    { width: 10 },  // E - QTY
    { width: 12 },  // F - WEIGHT
    { width: 18 },  // G - CARTON SIZE
  ];

  const boldFont: Partial<ExcelJS.Font> = { bold: true, size: 11, name: 'Arial' };
  const normalFont: Partial<ExcelJS.Font> = { size: 11, name: 'Arial' };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 12, name: 'Arial' };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  };

  // Row 1: Headers
  plSheet.getCell('B1').value = 'Exporter ';
  plSheet.getCell('B1').font = headerFont;
  plSheet.getCell('C1').value = 'Importer ';
  plSheet.getCell('C1').font = headerFont;

  // Exporter info (rows 2-8)
  const exporterLines = [
    'Miracle',
    'Medical Industries',
    'NO.104- Industrial Zone ( B-C) El- Obour City ',
    'Cairo -- Egypt',
    'Tel : 002 02 228 34 7 42',
    'Fax : 002 02 228 44 6 55',
    'Mob : 002 0 100 533 00 34',
  ];

  for (let i = 0; i < exporterLines.length; i++) {
    const cell = plSheet.getCell(`B${2 + i}`);
    cell.value = exporterLines[i];
    cell.font = i < 2 ? boldFont : normalFont;
  }

  // Importer info
  plSheet.getCell('C2').value = customerName;
  plSheet.getCell('C2').font = boldFont;
  // Leave C3-C7 empty for manual editing
  for (let i = 3; i <= 7; i++) {
    plSheet.getCell(`C${i}`).value = '';
  }

  // Add borders to top section
  for (let r = 1; r <= 8; r++) {
    for (const col of ['B', 'C']) {
      plSheet.getCell(`${col}${r}`).border = thinBorder;
    }
  }

  // Row 10: Title
  plSheet.mergeCells('B10:C10');
  plSheet.getCell('B10').value = `packing list for Invoice ${orderNumber}/${currentYear}/${customerName}`;
  plSheet.getCell('B10').font = { bold: true, size: 13, name: 'Arial' };
  plSheet.getCell('F10').value = dateStr;
  plSheet.getCell('F10').font = boldFont;

  // Row 11: Table headers
  const headers = ['no.', 'Product', 'Code', 'size', 'QTY', 'WIEGHT', 'CARTON SIZE '];
  const headerCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  for (let i = 0; i < headers.length; i++) {
    const cell = plSheet.getCell(`${headerCols[i]}11`);
    cell.value = headers[i];
    cell.font = boldFont;
    cell.border = thinBorder;
  }

  // Data rows - one row per shipment
  let rowNum = 12;
  let itemNo = 1;
  
  // Group by shipment - each shipment is a row with its primary product info
  for (const [shipmentId, entry] of shipmentMap) {
    const cartonSize = getCartonSize(entry.shipment);
    
    if (entry.items.length === 0) {
      // Shipment with no batch details - still add a row
      const row = plSheet.getRow(rowNum);
      row.getCell(1).value = itemNo;
      row.getCell(2).value = '';
      row.getCell(3).value = '';
      row.getCell(4).value = '';
      row.getCell(5).value = '';
      row.getCell(6).value = Number(entry.shipment.weight_kg) || '';
      row.getCell(7).value = cartonSize;
      for (let c = 1; c <= 7; c++) {
        row.getCell(c).font = normalFont;
        row.getCell(c).border = thinBorder;
      }
      rowNum++;
      itemNo++;
    } else {
      // One row per item in the shipment
      for (const item of entry.items) {
        const row = plSheet.getRow(rowNum);
        row.getCell(1).value = itemNo;
        row.getCell(2).value = item.name;
        row.getCell(3).value = item.sku;
        row.getCell(4).value = item.size;
        row.getCell(5).value = item.qty;
        row.getCell(6).value = Number(entry.shipment.weight_kg) || '';
        row.getCell(7).value = cartonSize;
        for (let c = 1; c <= 7; c++) {
          row.getCell(c).font = normalFont;
          row.getCell(c).border = thinBorder;
        }
        rowNum++;
        itemNo++;
      }
    }
  }

  // Bottom section
  rowNum += 1;

  const addBottomRow = (label: string, value: string | number, isBold = true) => {
    const row = plSheet.getRow(rowNum);
    row.getCell(1).value = label;
    row.getCell(1).font = isBold ? boldFont : normalFont;
    if (value !== '') {
      row.getCell(4).value = value;
      row.getCell(4).font = boldFont;
    }
    for (let c = 1; c <= 7; c++) {
      row.getCell(c).border = thinBorder;
    }
    rowNum++;
  };

  addBottomRow(`CARTON SIZE :        ${uniqueCartonSizes.join('  CM & ')}  CM`, '');
  addBottomRow('Total No. of BALLET  :', '');  // empty - manual
  addBottomRow(`Total No. of Packages  :       ${shipments.length}       cartons`, '');
  addBottomRow('Total Weight WITH BALLET :', '');  // empty - manual
  addBottomRow(`Total Weight :          ${totalWeight}                KG`, '');
  addBottomRow('NET  Weight :', '');  // empty - manual
  addBottomRow('Origin : Made In Egypt', '');
  addBottomRow('Brand Name : Miracle', '');
  addBottomRow('Manufacturer :  Miracle Medical Industries', '');
  addBottomRow('Description Goods :', '');  // empty - manual

  rowNum += 2;
  plSheet.getCell(`F${rowNum}`).value = 'SAMEH LOUIS ';
  plSheet.getCell(`F${rowNum}`).font = boldFont;
  rowNum++;
  plSheet.getCell(`F${rowNum}`).value = 'VICE CHAIRMAN ';
  plSheet.getCell(`F${rowNum}`).font = boldFont;

  // ====== INVOICE SHEET ======
  const invSheet = wb.addWorksheet('invoice');

  invSheet.columns = [
    { width: 6 },   // A - Sr.
    { width: 35 },  // B - Product
    { width: 15 },  // C - Code
    { width: 10 },  // D - Unit
    { width: 12 },  // E - U/price $
    { width: 10 },  // F - QTY
    { width: 12 },  // G - TOTAL
  ];

  // Row 1: Headers
  invSheet.getCell('B1').value = 'Exporter ';
  invSheet.getCell('B1').font = headerFont;
  invSheet.getCell('C1').value = 'Importer ';
  invSheet.getCell('C1').font = headerFont;

  for (let i = 0; i < exporterLines.length; i++) {
    const cell = invSheet.getCell(`B${2 + i}`);
    cell.value = exporterLines[i];
    cell.font = i < 2 ? boldFont : normalFont;
  }

  invSheet.getCell('C2').value = customerName;
  invSheet.getCell('C2').font = boldFont;
  for (let i = 3; i <= 7; i++) {
    invSheet.getCell(`C${i}`).value = '';
  }

  for (let r = 1; r <= 8; r++) {
    for (const col of ['B', 'C']) {
      invSheet.getCell(`${col}${r}`).border = thinBorder;
    }
  }

  // Row 10: Title
  invSheet.mergeCells('B10:C10');
  invSheet.getCell('B10').value = ` Invoice CFR ${orderNumber}/${currentYear}/${customerName}`;
  invSheet.getCell('B10').font = { bold: true, size: 13, name: 'Arial' };
  invSheet.getCell('F10').value = dateStr;
  invSheet.getCell('F10').font = boldFont;

  // Row 11: Table headers
  const invHeaders = ['Sr.', 'Product', 'Code', 'Unit', 'U/price $', 'QTY', 'TOTAL'];
  for (let i = 0; i < invHeaders.length; i++) {
    const cell = invSheet.getCell(`${headerCols[i]}11`);
    cell.value = invHeaders[i];
    cell.font = boldFont;
    cell.border = thinBorder;
  }

  // Aggregate order items for invoice (one row per unique product)
  if (orderItems) {
    let invRow = 12;
    let sr = 1;
    for (const item of orderItems) {
      const product = item.product as any;
      const row = invSheet.getRow(invRow);
      row.getCell(1).value = sr;
      row.getCell(2).value = product?.name_en || '';
      row.getCell(3).value = product?.sku || '';
      row.getCell(4).value = '1PC';
      row.getCell(5).value = '';  // U/price - manual
      row.getCell(6).value = item.quantity;
      row.getCell(7).value = { formula: `F${invRow}*E${invRow}` };
      for (let c = 1; c <= 7; c++) {
        row.getCell(c).font = normalFont;
        row.getCell(c).border = thinBorder;
      }
      invRow++;
      sr++;
    }

    // Totals
    const totalRow = invRow;
    invSheet.getCell(`A${totalRow}`).value = sr;
    invSheet.getCell(`B${totalRow}`).value = 'TOTAL  Invoice FOB';
    invSheet.getCell(`B${totalRow}`).font = boldFont;
    invSheet.getCell(`G${totalRow}`).value = { formula: `SUM(G12:G${totalRow - 1})` };
    invSheet.getCell(`G${totalRow}`).font = boldFont;

    invRow++;
    invSheet.getCell(`B${invRow}`).value = 'Shipping Cost Approximately';
    invSheet.getCell(`G${invRow}`).value = '';
    invRow++;
    invSheet.getCell(`B${invRow}`).value = 'TOTAL  Invoice CFR';
    invSheet.getCell(`B${invRow}`).font = boldFont;
    invSheet.getCell(`G${invRow}`).value = { formula: `SUM(G${totalRow}:G${invRow - 1})` };

    invRow += 3;
    // Bottom section
    const bottomLines = [
      `Manufacturer       : Miracle Medical Industries`,
      `Brand Name : Miracle`,
      `Origin              : Made in Egypt`,
    ];
    for (const line of bottomLines) {
      invSheet.getCell(`B${invRow}`).value = line;
      invSheet.getCell(`B${invRow}`).font = normalFont;
      invRow++;
    }

    invRow += 4;
    invSheet.getCell(`B${invRow}`).value = 'SAMEH LOUIS ';
    invSheet.getCell(`B${invRow}`).font = boldFont;
    invRow++;
    invSheet.getCell(`B${invRow}`).value = 'VICE CHAIRMAN ';
    invSheet.getCell(`B${invRow}`).font = boldFont;
  }

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Packing_Invoice_${orderNumber}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
