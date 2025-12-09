import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { QrCode, Download, Printer } from 'lucide-react';
import { getStateLabel } from '@/lib/stateMachine';

interface BatchQRCodeProps {
  batchCode: string;
  orderNumber: string;
  productName: string;
  state: string;
  quantity: number;
  eta?: string;
}

export function BatchQRCode({ 
  batchCode, 
  orderNumber, 
  productName, 
  state, 
  quantity, 
  eta 
}: BatchQRCodeProps) {
  const qrData = JSON.stringify({
    code: batchCode,
    order: orderNumber,
    product: productName,
    state: state,
    qty: quantity,
    eta: eta,
  });

  const baseUrl = window.location.origin;
  const scanUrl = `${baseUrl}/batch/${batchCode}`;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Batch ${batchCode}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
              .info { margin: 10px 0; }
              .label { color: #666; font-size: 12px; }
              .value { font-weight: bold; font-size: 16px; }
              .code { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="code">${batchCode}</div>
            <div id="qr"></div>
            <div class="info"><span class="label">Order:</span> <span class="value">${orderNumber}</span></div>
            <div class="info"><span class="label">Product:</span> <span class="value">${productName}</span></div>
            <div class="info"><span class="label">State:</span> <span class="value">${getStateLabel(state as any)}</span></div>
            <div class="info"><span class="label">Quantity:</span> <span class="value">${quantity}</span></div>
            ${eta ? `<div class="info"><span class="label">ETA:</span> <span class="value">${new Date(eta).toLocaleDateString()}</span></div>` : ''}
            <script>window.print();</script>
          </body>
        </html>
      `);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <QrCode className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Batch QR Code</DialogTitle>
        </DialogHeader>
        <Card>
          <CardContent className="p-6 flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG value={scanUrl} size={200} />
            </div>
            <p className="text-2xl font-mono font-bold">{batchCode}</p>
            <div className="text-sm text-muted-foreground space-y-1 text-center">
              <p><strong>Order:</strong> {orderNumber}</p>
              <p><strong>Product:</strong> {productName}</p>
              <p><strong>State:</strong> {getStateLabel(state as any)}</p>
              <p><strong>Units:</strong> {quantity}</p>
              {eta && <p><strong>ETA:</strong> {new Date(eta).toLocaleDateString()}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}