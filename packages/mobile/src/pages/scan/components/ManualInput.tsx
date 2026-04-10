import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface ManualInputProps {
  onSearch: (value: string) => void
  loading?: boolean
}

export function ManualInput({ onSearch, loading }: ManualInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSearch(value.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        placeholder="输入 SKU 或条码查询商品"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" size="icon" variant="gold" disabled={loading || !value.trim()}>
        <Search size={18} />
      </Button>
    </form>
  )
}
