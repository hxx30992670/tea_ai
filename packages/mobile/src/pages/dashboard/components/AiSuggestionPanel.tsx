import {
  AlertTriangle,
  Bot,
  CreditCard,
  PackageCheck,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiSuggestion } from '@/types'

interface AiSuggestionPanelProps {
  suggestions: AiSuggestion[]
  loading?: boolean
}

const TYPE_CONFIG = {
  restock: {
    label: '库存',
    icon: PackageCheck,
    className: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  },
  receivable: {
    label: '欠款',
    icon: CreditCard,
    className: 'border-red-400/25 bg-red-400/10 text-red-300',
  },
  sales: {
    label: '销售',
    icon: TrendingUp,
    className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  },
  product: {
    label: '热销',
    icon: Sparkles,
    className: 'border-primary/25 bg-primary/10 text-primary',
  },
  after_sale: {
    label: '售后',
    icon: AlertTriangle,
    className: 'border-orange-400/25 bg-orange-400/10 text-orange-300',
  },
  info: {
    label: '建议',
    icon: Bot,
    className: 'border-blue-400/25 bg-blue-400/10 text-blue-300',
  },
} as const

function getSuggestionConfig(type: string) {
  return TYPE_CONFIG[type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.info
}

export function AiSuggestionPanel({ suggestions, loading = false }: AiSuggestionPanelProps) {
  if (suggestions.length === 0) return null

  return (
    <section className="overflow-hidden rounded-xl border border-primary/20 bg-[linear-gradient(135deg,rgba(212,168,83,0.14),rgba(13,20,32,0.94)_42%,rgba(10,15,24,0.98))] shadow-lg shadow-black/15">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {loading ? <RefreshCw size={16} className="animate-spin" /> : <Bot size={16} />}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-5 text-foreground">AI 经营建议</h2>
          <p className="truncate text-[11px] text-muted-foreground">基于库存、欠款和销售数据生成</p>
        </div>
        <span className="ml-auto rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          已启用
        </span>
      </div>

      <div className="space-y-2 px-3 py-3">
        {suggestions.map((suggestion, index) => {
          const config = getSuggestionConfig(suggestion.type)
          const Icon = config.icon

          return (
            <div
              key={`${suggestion.type}-${suggestion.productId ?? index}-${suggestion.content}`}
              className="flex gap-3 rounded-lg border border-white/8 bg-background/38 px-3 py-2.5"
            >
              <div
                className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
                  config.className,
                )}
              >
                <Icon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                  {config.label}建议
                </div>
                <p className="break-words text-sm leading-5 text-foreground/90">{suggestion.content}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
