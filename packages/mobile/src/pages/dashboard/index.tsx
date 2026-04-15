import { RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { useDashboard } from './hooks/useDashboard'
import { OverviewCards } from './components/OverviewCards'
import { SalesTrendChart } from './components/SalesTrendChart'
import { StockWarningList } from './components/StockWarningList'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data, loading, refreshing, refresh } = useDashboard()

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return '早上好'
    if (h < 18) return '下午好'
    return '晚上好'
  })()

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* 渐变头部 */}
      <div className="shrink-0 relative overflow-hidden bg-gradient-to-br from-[#0F1B2D] to-background px-4 pt-safe pb-5">
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />

        <div className="mt-3 flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{greeting}</p>
            <h1 className="text-xl font-bold text-foreground">
              {user?.realName || user?.username}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(new Date(), 'YYYY年MM月DD日')}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={refreshing}
            className="mt-1"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin text-primary' : 'text-muted-foreground'} />
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        <OverviewCards data={data.overview} loading={loading} />
        <SalesTrendChart data={data.trend} loading={loading} />
        <StockWarningList warnings={data.warnings} />
      </div>
    </div>
  )
}
