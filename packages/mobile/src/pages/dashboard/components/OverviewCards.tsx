import { TrendingUp, Package, CreditCard, DollarSign, RotateCcw, ArrowDownLeft, ShoppingCart } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { formatMoney } from '@/lib/utils'
import type { DashboardOverview } from '@/types'

interface OverviewCardsProps {
  data: DashboardOverview | null
  loading: boolean
}

export function OverviewCards({ data, loading }: OverviewCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        title="今日销售"
        value={loading ? '—' : `¥${formatMoney(data?.todayRevenue ?? 0, 0)}`}
        icon={<TrendingUp size={16} />}
        accent="gold"
        loading={loading}
        className="col-span-2"
      />
      <StatCard
        title="本月销售"
        value={loading ? '—' : `¥${formatMoney(data?.monthRevenue ?? 0, 0)}`}
        icon={<DollarSign size={16} />}
        accent="green"
        loading={loading}
      />
      <StatCard
        title="采购金额"
        value={loading ? '—' : `¥${formatMoney(data?.purchaseAmount ?? 0, 0)}`}
        icon={<ShoppingCart size={16} />}
        accent="amber"
        loading={loading}
      />
      <StatCard
        title="库存价值"
        value={loading ? '—' : `¥${formatMoney(data?.stockValue ?? 0, 0)}`}
        icon={<Package size={16} />}
        accent="blue"
        loading={loading}
      />
      {(data?.receivableTotal ?? 0) > 0 && (
        <StatCard
          title="待收款"
          value={`¥${formatMoney(data?.receivableTotal ?? 0, 0)}`}
          icon={<CreditCard size={16} />}
          accent="red"
          loading={loading}
        />
      )}
      {(data?.saleReturnTotal ?? 0) > 0 && (
        <StatCard
          title="销售退货"
          value={`¥${formatMoney(data?.saleReturnTotal ?? 0, 0)}`}
          icon={<RotateCcw size={16} />}
          accent="red"
          loading={loading}
        />
      )}
      {(data?.refundTotal ?? 0) > 0 && (
        <StatCard
          title="退款金额"
          value={`¥${formatMoney(data?.refundTotal ?? 0, 0)}`}
          icon={<ArrowDownLeft size={16} />}
          accent="red"
          loading={loading}
        />
      )}
    </div>
  )
}
