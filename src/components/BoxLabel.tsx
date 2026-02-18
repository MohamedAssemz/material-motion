import { QRCodeSVG } from 'qrcode.react';
import { generateBarcodeSVG } from '@/lib/barcodeGenerator';

interface BoxLabelProps {
  boxCode: string;
  boxType: 'order' | 'extra' | 'shipment';
  baseUrl?: string;
}

/**
 * Printable box label component with QR code and barcode
 */
export function BoxLabel({ boxCode, boxType, baseUrl }: BoxLabelProps) {
  // Generate the URL for QR code
  const lookupUrl = baseUrl 
    ? `${baseUrl}/box/${boxCode}`
    : `/box/${boxCode}`;

  // Generate barcode SVG
  const barcodeSvg = generateBarcodeSVG(boxCode, {
    width: 180,
    height: 50,
    showText: false,
  });

  return (
    <div className="box-label flex flex-col items-center justify-center p-4 bg-white border border-gray-300 rounded-lg w-[240px]">
      {/* QR Code */}
      <div className="qr-code mb-3">
        <QRCodeSVG
          value={lookupUrl}
          size={140}
          level="M"
          includeMargin={false}
        />
      </div>

      {/* Box Code Text */}
      <div className="box-code text-center mb-3">
        <span className="font-mono text-xl font-bold tracking-wider">
          {boxCode}
        </span>
      </div>

      {/* Barcode */}
      <div 
        className="barcode"
        dangerouslySetInnerHTML={{ __html: barcodeSvg }}
      />
    </div>
  );
}

/**
 * Generate printable HTML for box labels
 */
export function generateBoxLabelHTML(
  boxes: Array<{ boxCode: string; boxType: 'order' | 'extra' | 'shipment' }>,
  baseUrl: string
): string {
  const labelsHtml = boxes.map(({ boxCode }) => {
    const lookupUrl = `${baseUrl}/box/${boxCode}`;
    const barcodeSvg = generateBarcodeSVG(boxCode, {
      width: 180,
      height: 50,
      showText: false,
    });

    return `
      <div class="label">
        <div class="qr-container">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(lookupUrl)}" alt="QR Code" />
        </div>
        <div class="box-code">${boxCode.replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c] || c))}</div>
        <div class="barcode">${barcodeSvg}</div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Box Labels</title>
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
          }
          .labels-container {
          }
          .label {
            width: 240px;
            padding: 16px;
            border: 1px solid #ddd;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            page-break-after: always;
            page-break-inside: avoid;
            margin: 0 auto;
          }
          .label:last-child {
            page-break-after: avoid;
          }
          .qr-container {
            margin-bottom: 12px;
          }
          .qr-container img {
            width: 140px;
            height: 140px;
          }
          .box-code {
            font-family: monospace;
            font-size: 20px;
            font-weight: bold;
            letter-spacing: 2px;
            margin-bottom: 12px;
            text-align: center;
          }
          .barcode {
            display: flex;
            justify-content: center;
          }
          .barcode svg {
            max-width: 180px;
          }
          @media print {
            body {
              padding: 0;
            }
            .label {
              border: 1px solid #ccc;
            }
          }
        </style>
      </head>
      <body>
        <div class="labels-container">
          ${labelsHtml}
        </div>
        <script>
          setTimeout(function() {
            window.print();
          }, 500);
        </script>
      </body>
    </html>
  `;
}
