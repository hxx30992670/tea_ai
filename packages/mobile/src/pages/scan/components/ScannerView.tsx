import { ScanLine, CameraOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ScanMode, ScannerStatus } from '../hooks/useScanner'

interface ScannerViewProps {
  containerId: string
  status: ScannerStatus
  errorMsg: string
  onStart: () => void
  mode: ScanMode
  onModeChange: (mode: ScanMode) => void
}

export function ScannerView({ containerId, status, errorMsg, onStart, mode, onModeChange }: ScannerViewProps) {
  return (
    <div className="relative flex aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-2xl bg-black/80">
      <video id={containerId} className="h-full w-full object-cover" autoPlay muted playsInline />

      {/* 扫描框遮罩 */}
      {status === 'scanning' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-56 w-56">
            {/* 四角定位线 */}
            {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
              <div
                key={pos}
                className={`absolute h-8 w-8 border-2 border-primary ${
                  pos === 'tl' ? 'top-0 left-0 rounded-tl-lg border-r-0 border-b-0' :
                  pos === 'tr' ? 'top-0 right-0 rounded-tr-lg border-l-0 border-b-0' :
                  pos === 'bl' ? 'bottom-0 left-0 rounded-bl-lg border-r-0 border-t-0' :
                  'bottom-0 right-0 rounded-br-lg border-l-0 border-t-0'
                }`}
              />
            ))}
            {/* 扫描线动画 */}
            <div className="absolute inset-x-2 h-0.5 animate-bounce bg-gradient-to-r from-transparent via-primary to-transparent" style={{ top: '50%' }} />
          </div>
        </div>
      )}

      {/* 未启动状态 */}
      {(status === 'idle' || status === 'error') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70">
          {status === 'error' ? (
            <>
              <CameraOff size={40} className="text-muted-foreground" />
              <p className="text-center text-sm text-muted-foreground px-6">{errorMsg}</p>
            </>
          ) : (
            <ScanLine size={40} className="text-muted-foreground" />
          )}
          <Button variant="gold" onClick={onStart}>
            {status === 'error' ? '重试' : '开始扫码'}
          </Button>
        </div>
      )}

      <div className="absolute left-3 top-3 z-10 flex rounded-full bg-black/45 p-1 backdrop-blur-sm">
        {([
          ['auto', '自动'],
          ['barcode', '条码'],
          ['qr', '二维码'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onModeChange(value)}
            className={`rounded-full px-3 py-1 text-xs transition ${mode === value ? 'bg-primary text-primary-foreground' : 'text-white/80'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 启动中 */}
      {status === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      )}
    </div>
  )
}
