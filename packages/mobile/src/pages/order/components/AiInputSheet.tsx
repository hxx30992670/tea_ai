import { useRef } from 'react'
import { Camera, Image, FileText, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

interface AiInputSheetProps {
  open: boolean
  onClose: () => void
  onFile: (file: File) => void
}

export function AiInputSheet({ open, onClose, onFile }: AiInputSheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFile(file)
      onClose()
    }
    e.target.value = ''
  }

  const sources = [
    { icon: Camera, label: '拍照', desc: '拍摄手写单据、发票等', ref: cameraRef },
    { icon: Image, label: '相册', desc: '从相册选择图片', ref: galleryRef },
    { icon: FileText, label: '文件', desc: '选择 txt / csv 文件', ref: fileRef },
  ] as const

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent height="auto">
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between gap-3 pb-2">
          <SheetTitle className="flex-1">AI 识别录单</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground">
              <X size={20} />
            </Button>
          </SheetClose>
        </SheetHeader>
        <SheetBody className="space-y-2 pb-4">
          <p className="text-xs text-muted-foreground mb-2">
            上传手写订单、聊天截图、发票照片等，AI 自动识别并填入商品信息
          </p>
          {sources.map(({ icon: Icon, label, desc, ref }) => (
            <button
              key={label}
              onClick={() => ref.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left tap-scale hover:bg-secondary/30 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </button>
          ))}

          {/* 隐藏的 input 元素 */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
          <input ref={fileRef} type="file" accept=".txt,.md,.csv" className="hidden" onChange={handleChange} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
