import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { productApi } from '@/api/product';
import type { Product } from '@/types';
import { useScanner } from './hooks/useScanner';
import { useStockAction } from './hooks/useStockAction';
import { ScannerView } from './components/ScannerView';
import { ProductActionSheet } from './components/ProductActionSheet';
import { ManualInput } from './components/ManualInput';

export default function ScanPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState('');
  const [scanMode, setScanMode] = useState<'auto' | 'barcode' | 'qr'>('auto');
  const [lastRawCode, setLastRawCode] = useState('');
  const [lastNormalizedCode, setLastNormalizedCode] = useState('');
  const [lastLookupError, setLastLookupError] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleProductFound = useCallback(
    (p: Product | null, barcode: string) => {
      if (!p) {
        showToast(`未找到商品：${barcode}`);
        scanner.resume();
        return;
      }
      scanner.pause();
      setProduct(p);
      setSheetOpen(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleScanResult = useCallback(
    async (result: string) => {
      if (sheetOpen || searching) return; // 已有弹窗或查询中时忽略重复扫描
      const raw = result ?? '';
      const normalized = raw
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\s+/g, '')
        .trim();

      setLastRawCode(raw);
      setLastNormalizedCode(normalized);
      setLastLookupError('');

      if (!normalized) {
        setLastLookupError('识别结果为空');
        return;
      }

      setSearching(true);
      try {
        const p = await productApi.findByCode(normalized);
        handleProductFound(p, normalized);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '查询商品失败';
        setLastLookupError(msg);
        showToast(msg);
      } finally {
        setSearching(false);
      }
    },
    [sheetOpen, searching, handleProductFound]
  );

  const scanner = useScanner({
    onScan: handleScanResult,
    onError: showToast,
    mode: scanMode
  });

  const { loading: actionLoading, submit } = useStockAction({
    onSuccess: () => showToast('操作成功'),
    onError: showToast
  });

  const handleManualSearch = async (value: string) => {
    setSearching(true);
    try {
      const p = await productApi.findByCode(value);
      handleProductFound(p, value);
    } finally {
      setSearching(false);
    }
  };

  const handleSheetClose = () => {
    setSheetOpen(false);
    setProduct(null);
    scanner.resume();
  };

  return (
    <div className='flex h-full flex-col overflow-hidden bg-background'>
      <PageHeader title='扫码' subtitle='扫商品条码快速入库/出库' />

      <div className='flex-1 overflow-y-auto space-y-4 p-4'>
        {/* 扫码区 */}
        <ScannerView
          containerId={scanner.scannerContainerId}
          status={scanner.status}
          errorMsg={scanner.errorMsg}
          onStart={scanner.start}
          mode={scanMode}
          onModeChange={(mode) => {
            setScanMode(mode);
            if (scanner.status === 'scanning' || scanner.status === 'paused') {
              void scanner.stop().then(() => {
                void scanner.start();
              });
            }
          }}
        />

        {/* 操作提示 */}
        {scanner.status === 'scanning' && (
          <p className='text-center text-xs text-muted-foreground animate-pulse'>
            {searching ? '正在查找商品...' : '将条形码/二维码对准框内'}
          </p>
        )}
      </div>

      {/* 手动输入兜底 */}
      <div className='shrink-0 border-t bg-background px-4 py-3'>
        <ManualInput onSearch={handleManualSearch} loading={searching} />
      </div>

      {/* 商品操作面板 */}
      <ProductActionSheet
        product={product}
        open={sheetOpen}
        onClose={handleSheetClose}
        onAction={submit}
        loading={actionLoading}
      />

      {/* Toast 消息 */}
      {toast && (
        <div className='fixed bottom-24 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-xl animate-fade-in'>
          {toast}
        </div>
      )}
    </div>
  );
}
