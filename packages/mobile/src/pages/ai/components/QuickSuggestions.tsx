interface QuickSuggestionsProps {
  onSelect: (text: string) => void
  disabled?: boolean
}

const SUGGESTIONS = [
  '今日销售了多少？',
  '本月销售额是多少？',
  '哪些商品库存不足？',
  '最近有哪些欠款客户？',
  '上周销售最好的是什么茶？',
]

export function QuickSuggestions({ onSelect, disabled }: QuickSuggestionsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          disabled={disabled}
          className="shrink-0 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40 tap-scale"
        >
          {s}
        </button>
      ))}
    </div>
  )
}
