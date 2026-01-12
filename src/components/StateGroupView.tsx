import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Box, Package, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import { getStateLabel, isInState, isReadyForState, type UnitState } from '@/lib/stateMachine';

interface ProductItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_packing: boolean;
  quantity: number;
  batches: Array<{
    id: string;
    batch_code: string;
    quantity: number;
  }>;
}

interface BoxItem {
  box_id: string;
  box_code: string;
  batches: Array<{
    id: string;
    batch_code: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
  }>;
  total_quantity: number;
}

interface StateGroupViewProps {
  state: UnitState;
  products: ProductItem[];
  boxes: BoxItem[];
  onSelectProducts: (selections: Array<{ product_id: string; quantity: number; needs_packing: boolean; batches: Array<{ id: string; quantity: number }> }>) => void;
  onSelectBoxes: (boxIds: string[]) => void;
  canUpdate: boolean;
}

export function StateGroupView({
  state,
  products,
  boxes,
  onSelectProducts,
  onSelectBoxes,
  canUpdate,
}: StateGroupViewProps) {
  const [expanded, setExpanded] = useState(true);
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());

  const isIn = isInState(state);
  const isReady = isReadyForState(state);
  const totalItems = isIn 
    ? products.reduce((sum, p) => sum + p.quantity, 0)
    : boxes.reduce((sum, b) => sum + b.total_quantity, 0);

  if (totalItems === 0) return null;

  const handleProductQuantityChange = (productId: string, qty: number, maxQty: number) => {
    setProductSelections(prev => {
      const newMap = new Map(prev);
      if (qty > 0 && qty <= maxQty) {
        newMap.set(productId, qty);
      } else if (qty === 0) {
        newMap.delete(productId);
      }
      return newMap;
    });
  };

  const handleBoxToggle = (boxId: string) => {
    setSelectedBoxes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(boxId)) {
        newSet.delete(boxId);
      } else {
        newSet.add(boxId);
      }
      return newSet;
    });
  };

  const handleConfirmProductSelection = () => {
    const selections: Array<{ product_id: string; quantity: number; needs_packing: boolean; batches: Array<{ id: string; quantity: number }> }> = [];
    
    productSelections.forEach((qty, productId) => {
      const product = products.find(p => p.product_id === productId);
      if (product && qty > 0) {
        // Distribute quantity across batches
        let remaining = qty;
        const batchAllocs: Array<{ id: string; quantity: number }> = [];
        
        for (const batch of product.batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, batch.quantity);
          batchAllocs.push({ id: batch.id, quantity: take });
          remaining -= take;
        }
        
        selections.push({
          product_id: productId,
          quantity: qty,
          needs_packing: product.needs_packing,
          batches: batchAllocs,
        });
      }
    });
    
    if (selections.length > 0) {
      onSelectProducts(selections);
      setProductSelections(new Map());
    }
  };

  const handleConfirmBoxSelection = () => {
    if (selectedBoxes.size > 0) {
      onSelectBoxes(Array.from(selectedBoxes));
      setSelectedBoxes(new Set());
    }
  };

  const handlePrintBoxIds = () => {
    const selectedBoxCodes = boxes
      .filter(b => selectedBoxes.has(b.box_id))
      .map(b => b.box_code);
    
    if (selectedBoxCodes.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Box IDs</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            .box-id { 
              font-size: 32px; 
              font-weight: bold; 
              padding: 15px 30px;
              margin: 15px 0;
              border: 3px solid black;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          ${selectedBoxCodes.map(code => `<div class="box-id">${code}</div>`).join('')}
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const totalSelectedProducts = Array.from(productSelections.values()).reduce((sum, qty) => sum + qty, 0);
  const totalSelectedBoxItems = boxes
    .filter(b => selectedBoxes.has(b.box_id))
    .reduce((sum, b) => sum + b.total_quantity, 0);

  return (
    <Card>
      <CardHeader 
        className="cursor-pointer" 
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            <Badge className={getStateColor(state)}>
              {getStateLabel(state)}
            </Badge>
            <span className="text-muted-foreground">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
              {isReady && ` in ${boxes.length} box${boxes.length !== 1 ? 'es' : ''}`}
            </span>
          </div>
          {isIn && <Package className="h-5 w-5 text-muted-foreground" />}
          {isReady && <Box className="h-5 w-5 text-muted-foreground" />}
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="space-y-4">
          {/* "In" states - show products by quantity */}
          {isIn && products.length > 0 && (
            <>
              <div className="space-y-2">
                {products.map((product) => (
                  <div 
                    key={product.product_id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{product.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        SKU: {product.product_sku}
                        {!product.needs_packing && (
                          <Badge variant="outline" className="ml-2 text-xs">No Packing</Badge>
                        )}
                      </p>
                      <p className="text-sm font-medium mt-1">Available: {product.quantity}</p>
                    </div>
                    {canUpdate && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max={product.quantity}
                          value={productSelections.get(product.product_id) || ''}
                          onChange={(e) => handleProductQuantityChange(
                            product.product_id, 
                            parseInt(e.target.value) || 0,
                            product.quantity
                          )}
                          placeholder="0"
                          className="w-20 text-center"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleProductQuantityChange(
                            product.product_id,
                            product.quantity,
                            product.quantity
                          )}
                        >
                          All
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {canUpdate && totalSelectedProducts > 0 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    {totalSelectedProducts} item{totalSelectedProducts !== 1 ? 's' : ''} selected
                  </span>
                  <Button onClick={handleConfirmProductSelection}>
                    <Box className="h-4 w-4 mr-2" />
                    Assign to Box
                  </Button>
                </div>
              )}
            </>
          )}

          {/* "Ready" states - show boxes */}
          {isReady && boxes.length > 0 && (
            <>
              <div className="space-y-2">
                {boxes.map((box) => (
                  <div 
                    key={box.box_id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedBoxes.has(box.box_id) 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => canUpdate && handleBoxToggle(box.box_id)}
                  >
                    {canUpdate && (
                      <Checkbox 
                        checked={selectedBoxes.has(box.box_id)}
                        onCheckedChange={() => handleBoxToggle(box.box_id)}
                      />
                    )}
                    <Box className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-mono font-bold">{box.box_code}</p>
                      <div className="text-sm text-muted-foreground">
                        {box.batches.map((b, i) => (
                          <span key={b.id}>
                            {i > 0 && ', '}
                            {b.product_sku} × {b.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Badge variant="secondary">{box.total_quantity} items</Badge>
                  </div>
                ))}
              </div>
              
              {canUpdate && selectedBoxes.size > 0 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    {selectedBoxes.size} box{selectedBoxes.size !== 1 ? 'es' : ''} selected ({totalSelectedBoxItems} items)
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handlePrintBoxIds}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print IDs
                    </Button>
                    <Button onClick={handleConfirmBoxSelection}>
                      Receive Selected
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Pending RM special case - show products like "In" states */}
          {state === 'pending_rm' && products.length > 0 && (
            <>
              <div className="space-y-2">
                {products.map((product) => (
                  <div 
                    key={product.product_id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{product.product_name}</p>
                      <p className="text-sm text-muted-foreground">SKU: {product.product_sku}</p>
                      <p className="text-sm font-medium mt-1">Quantity: {product.quantity}</p>
                    </div>
                    {canUpdate && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max={product.quantity}
                          value={productSelections.get(product.product_id) || ''}
                          onChange={(e) => handleProductQuantityChange(
                            product.product_id, 
                            parseInt(e.target.value) || 0,
                            product.quantity
                          )}
                          placeholder="0"
                          className="w-20 text-center"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleProductQuantityChange(
                            product.product_id,
                            product.quantity,
                            product.quantity
                          )}
                        >
                          All
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {canUpdate && totalSelectedProducts > 0 && (
                <div className="flex items-center justify-end pt-4 border-t">
                  <span className="text-sm text-muted-foreground mr-4">
                    {totalSelectedProducts} item{totalSelectedProducts !== 1 ? 's' : ''} selected
                  </span>
                  <Button onClick={handleConfirmProductSelection}>
                    Start Manufacturing
                  </Button>
                </div>
              )}
            </>
          )}
          
          {/* Shipped state - show products summary */}
          {state === 'shipped' && products.length > 0 && (
            <div className="space-y-2">
              {products.map((product) => (
                <div 
                  key={product.product_id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-green-50 dark:bg-green-950/20"
                >
                  <div>
                    <p className="font-medium">{product.product_name}</p>
                    <p className="text-sm text-muted-foreground">SKU: {product.product_sku}</p>
                  </div>
                  <Badge className="bg-green-500">{product.quantity} received</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function getStateColor(state: string): string {
  const colors: Record<string, string> = {
    'pending_rm': 'bg-yellow-500',
    'in_manufacturing': 'bg-blue-500',
    'ready_for_finishing': 'bg-blue-300',
    'in_finishing': 'bg-purple-500',
    'ready_for_packaging': 'bg-orange-500',
    'in_packaging': 'bg-indigo-500',
    'ready_for_boxing': 'bg-cyan-300',
    'in_boxing': 'bg-cyan-500',
    'ready_for_shipment': 'bg-teal-300',
    'shipped': 'bg-green-500',
  };
  return colors[state] || 'bg-gray-500';
}
