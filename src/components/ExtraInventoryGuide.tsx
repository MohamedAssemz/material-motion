import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

interface ExtraItem {
  product_name: string;
  product_sku: string;
  quantity: number;
  box_code: string;
}

interface ExtraInventoryGuideProps {
  phase: string;
  items: ExtraItem[];
}

export function ExtraInventoryGuide({ phase, items }: ExtraInventoryGuideProps) {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Group by box
    const boxGroups = new Map<string, ExtraItem[]>();
    items.forEach(item => {
      if (!boxGroups.has(item.box_code)) {
        boxGroups.set(item.box_code, []);
      }
      boxGroups.get(item.box_code)!.push(item);
    });

    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Extra ${phase} Guide</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; }
            .box-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }
            .box-header { font-weight: bold; font-size: 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; background: #f5f5f5; padding: 8px; border-radius: 4px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; }
            .total { font-weight: bold; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
            .checkbox { width: 20px; height: 20px; border: 2px solid #333; display: inline-block; margin-right: 8px; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Extra ${phase} - Picking Guide</div>
            <div>Generated: ${new Date().toLocaleString()}</div>
          </div>
          
          ${Array.from(boxGroups.entries()).map(([boxCode, boxItems]) => `
            <div class="box-section">
              <div class="box-header">📦 ${boxCode}</div>
              <table>
                <tr><th style="width: 40px;">✓</th><th>Product</th><th>SKU</th><th>Quantity</th></tr>
                ${boxItems.map(item => `
                  <tr>
                    <td><span class="checkbox"></span></td>
                    <td>${item.product_name}</td>
                    <td>${item.product_sku}</td>
                    <td><strong>${item.quantity}</strong></td>
                  </tr>
                `).join('')}
              </table>
            </div>
          `).join('')}
          
          <div class="total">Total Extra Items: ${totalItems}</div>
          
          <script>
            setTimeout(function() {
              window.print();
            }, 100);
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (items.length === 0) return null;

  return (
    <Button variant="outline" size="sm" onClick={handlePrint}>
      <Printer className="h-4 w-4 mr-1" />
      Print Guide ({items.length})
    </Button>
  );
}
