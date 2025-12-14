import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Printer, Box } from 'lucide-react';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';
import { format } from 'date-fns';

interface BatchCardPrintableProps {
  batchCode: string;
  orderNumber?: string;
  productName: string;
  productSku: string;
  state: UnitState;
  quantity: number;
  eta?: string;
  batchType: 'ORDER' | 'EXTRA';
  boxCode?: string;
}

export function BatchCardPrintable({
  batchCode,
  orderNumber,
  productName,
  productSku,
  state,
  quantity,
  eta,
  batchType,
  boxCode,
}: BatchCardPrintableProps) {
  const baseUrl = window.location.origin;
  const scanUrl = `${baseUrl}/batch/${batchCode}`;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const isExtra = batchType === 'EXTRA';
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Batch Card - ${batchCode}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: Arial, sans-serif; 
                padding: 15px;
                width: 4in;
                height: 3in;
              }
              .card {
                border: 2px solid ${isExtra ? '#f59e0b' : '#3b82f6'};
                border-radius: 8px;
                padding: 12px;
                height: 100%;
                display: flex;
                flex-direction: column;
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #e5e7eb;
              }
              .batch-code {
                font-size: 18px;
                font-weight: bold;
                font-family: monospace;
              }
              .badge {
                background: ${isExtra ? '#fef3c7' : '#dbeafe'};
                color: ${isExtra ? '#92400e' : '#1e40af'};
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
              }
              .content {
                display: flex;
                gap: 12px;
                flex: 1;
              }
              .qr-section {
                flex-shrink: 0;
              }
              .info-section {
                flex: 1;
                font-size: 11px;
              }
              .info-row {
                margin-bottom: 4px;
              }
              .label {
                color: #6b7280;
                font-size: 9px;
                text-transform: uppercase;
              }
              .value {
                font-weight: 600;
              }
              .product-name {
                font-size: 13px;
                font-weight: bold;
                margin-bottom: 2px;
              }
              .quantity {
                font-size: 20px;
                font-weight: bold;
                color: ${isExtra ? '#f59e0b' : '#3b82f6'};
              }
              .box-code {
                margin-top: 8px;
                padding: 4px 8px;
                background: #f3f4f6;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12px;
              }
              .footer {
                margin-top: auto;
                padding-top: 8px;
                border-top: 1px solid #e5e7eb;
                font-size: 9px;
                color: #9ca3af;
                text-align: center;
              }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div>
                  <div class="batch-code">${batchCode}</div>
                  ${orderNumber ? `<div style="font-size: 10px; color: #6b7280;">Order: ${orderNumber}</div>` : ''}
                </div>
                <span class="badge">${isExtra ? 'EXTRA INVENTORY' : 'ORDER'}</span>
              </div>
              <div class="content">
                <div class="qr-section">
                  <div id="qr" style="background: white; padding: 4px; border-radius: 4px;"></div>
                </div>
                <div class="info-section">
                  <div class="product-name">${productName}</div>
                  <div class="info-row">
                    <span class="label">SKU:</span>
                    <span class="value">${productSku}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">State:</span>
                    <span class="value">${getStateLabel(state)}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Quantity:</span>
                    <span class="quantity">${quantity}</span>
                  </div>
                  ${eta ? `
                  <div class="info-row">
                    <span class="label">ETA:</span>
                    <span class="value">${format(new Date(eta), 'PP')}</span>
                  </div>
                  ` : ''}
                  ${boxCode ? `<div class="box-code">📦 ${boxCode}</div>` : ''}
                </div>
              </div>
              <div class="footer">
                Scan QR code to view batch details • ${format(new Date(), 'PP p')}
              </div>
            </div>
            <script src="https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js"><\/script>
            <script>
              QRCode.toCanvas(document.createElement('canvas'), '${scanUrl}', { width: 80 }, function(err, canvas) {
                if (!err) {
                  document.getElementById('qr').appendChild(canvas);
                  setTimeout(() => window.print(), 300);
                }
              });
            <\/script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Printer className="h-4 w-4 mr-2" />
          Print Card
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Batch Card Preview</DialogTitle>
        </DialogHeader>
        <Card className={`border-2 ${batchType === 'EXTRA' ? 'border-amber-500' : 'border-primary'}`}>
          <CardContent className="p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-mono text-xl font-bold">{batchCode}</p>
                {orderNumber && (
                  <p className="text-sm text-muted-foreground">Order: {orderNumber}</p>
                )}
              </div>
              <Badge variant={batchType === 'EXTRA' ? 'secondary' : 'default'}>
                {batchType === 'EXTRA' ? 'EXTRA INVENTORY' : 'ORDER'}
              </Badge>
            </div>

            <div className="flex gap-4">
              <div className="bg-white p-2 rounded-lg border">
                <QRCodeSVG value={scanUrl} size={80} />
              </div>
              <div className="flex-1 space-y-1 text-sm">
                <p className="font-semibold">{productName}</p>
                <p className="text-muted-foreground">SKU: {productSku}</p>
                <p>State: <span className="font-medium">{getStateLabel(state)}</span></p>
                <p className={`text-xl font-bold ${batchType === 'EXTRA' ? 'text-amber-600' : 'text-primary'}`}>
                  Qty: {quantity}
                </p>
                {eta && (
                  <p className="text-muted-foreground">ETA: {format(new Date(eta), 'PP')}</p>
                )}
              </div>
            </div>

            {boxCode && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                <Box className="h-4 w-4" />
                <span className="font-mono">{boxCode}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={handlePrint} className="w-full">
          <Printer className="h-4 w-4 mr-2" />
          Print Batch Card
        </Button>
      </DialogContent>
    </Dialog>
  );
}
