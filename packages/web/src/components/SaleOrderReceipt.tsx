import React, { useRef } from 'react'
import { Button, Modal, Space, message } from 'antd'
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons'
import html2canvas from 'html2canvas'
import type { SaleOrder, SaleOrderItem, SaleExchangeItem } from '@/types'
import { formatCompositeQuantity } from '@/utils/packaging'

interface Props {
  open: boolean
  order: SaleOrder | null
  shopName?: string
  onClose: () => void
}

/** 计算每个原始订单行实际退回的数量（含换货归还） */
function buildReturnedMap(order: SaleOrder): Map<number, number> {
  const map = new Map<number, number>()
  for (const ret of order.returns ?? []) {
    for (const ri of ret.items ?? []) {
      map.set(ri.saleOrderItemId, (map.get(ri.saleOrderItemId) ?? 0) + ri.quantity)
    }
  }
  for (const ex of order.exchanges ?? []) {
    for (const ei of ex.items ?? []) {
      if (ei.direction === 'return' && ei.saleOrderItemId) {
        map.set(ei.saleOrderItemId, (map.get(ei.saleOrderItemId) ?? 0) + ei.quantity)
      }
    }
  }
  return map
}

type NetItem = SaleOrderItem & { _netQty: number; _netSubtotal: number }
type ExchangeOutRow = SaleExchangeItem & { _exchangeNo?: string }

/** 根据净数量重新计算复合单位显示（重新按 packageSize 拆分包装+散装） */
function formatNetQty(item: NetItem) {
  const netQty = item._netQty
  if (item.packageUnit && item.packageSize && Number(item.packageSize) > 0) {
    const size = Number(item.packageSize)
    const netPkg = Math.floor(netQty / size)
    const netLoose = netQty % size
    return formatCompositeQuantity({
      quantity: netQty,
      packageQty: netPkg,
      looseQty: netLoose,
      packageUnit: item.packageUnit,
      unit: item.unit,
    })
  }
  return formatCompositeQuantity({
    quantity: netQty,
    packageQty: null,
    looseQty: null,
    packageUnit: null,
    unit: item.unit,
  })
}

function ReceiptContent({ order, shopName }: { order: SaleOrder; shopName?: string }) {
  const displayShop = shopName || '茶掌柜'
  const dateStr = order.createdAt ? order.createdAt.slice(0, 10) : ''

  // ── 计算净出货明细 ──────────────────────────────────
  const returnedMap = buildReturnedMap(order)
  const hasAfterSale = (order.returns?.length ?? 0) > 0 || (order.exchanges?.length ?? 0) > 0

  const netOriginalItems: NetItem[] = (order.items ?? []).map(item => {
    // 优先用后端已计算好的 remainingQuantity（已包含所有退货和换货归还的扣减）
    // 次优：从 returnedMap 聚合（可能不全，因 saleOrderItemId 可能为 null）
    // 兜底：用 returnedQuantity 字段
    let netQty: number
    if (item.remainingQuantity !== undefined) {
      netQty = item.remainingQuantity
    } else if (returnedMap.size > 0) {
      netQty = Math.max(0, item.quantity - (returnedMap.get(item.id) ?? 0))
    } else {
      netQty = Math.max(0, item.quantity - (item.returnedQuantity ?? 0))
    }
    return { ...item, _netQty: netQty, _netSubtotal: netQty * item.unitPrice }
  }).filter(item => item._netQty > 0)

  const exchangeOutRows: ExchangeOutRow[] = (order.exchanges ?? []).flatMap(ex =>
    (ex.items ?? [])
      .filter(i => i.direction === 'out')
      .map(i => ({ ...i, _exchangeNo: ex.exchangeNo }))
  )

  // ── 金额汇总 ───────────────────────────────────────
  const netSaleAmount = order.totalAmount - order.returnedAmount
  const debt = Math.max(0, netSaleAmount - order.receivedAmount)

  const hasExchangeOut = exchangeOutRows.length > 0

  return (
    <div style={{
      width: 560,
      padding: '28px 32px',
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: 13,
      color: '#1a1a1a',
      background: '#fff',
      lineHeight: 1.6,
    }}>
      {/* 店名 */}
      <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        {displayShop}
      </div>

      {/* 标题 */}
      <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, marginBottom: 16, letterSpacing: 4 }}>
        销售送货单
      </div>

      {/* 分割线 + 单号/日期 */}
      <div style={{ borderTop: '2px solid #1a1a1a', borderBottom: '1px dashed #999', padding: '6px 0', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span>单号：{order.orderNo}</span>
        <span>日期：{dateStr}</span>
      </div>

      {/* 客户信息 */}
      <div style={{ marginBottom: 12 }}>
        <span>客户：<strong>{order.customerName || '散客'}</strong></span>
      </div>

      {/* ── 出货明细表 ── */}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
        {hasAfterSale ? '实际出货明细（已扣除退货/换货归还）' : '出货明细'}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={thStyle}>商品名称</th>
            <th style={{ ...thStyle, width: 70, textAlign: 'center' }}>数量</th>
            <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>单价</th>
            <th style={{ ...thStyle, width: 80, textAlign: 'right' }}>小计</th>
          </tr>
        </thead>
        <tbody>
          {netOriginalItems.map((item, idx) => (
            <tr key={`orig-${item.id}`} style={{ background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
              <td style={tdStyle}>{item.productName}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                {formatNetQty(item)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>¥{item.unitPrice.toFixed(2)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>¥{item._netSubtotal.toFixed(2)}</td>
            </tr>
          ))}
          {netOriginalItems.length === 0 && !hasExchangeOut && (
            <tr>
              <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>暂无出货明细</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── 换货补发明细（若有） ── */}
      {hasExchangeOut && (
        <>
          <div style={{ fontSize: 12, color: '#888', marginTop: 10, marginBottom: 4 }}>换货补发明细</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
            <tbody>
              {exchangeOutRows.map((item, idx) => (
                <tr key={`ex-${item.id}`} style={{ background: idx % 2 === 1 ? '#fff7e6' : '#fffbe6' }}>
                  <td style={tdStyle}>{item.productName || '换货商品'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', width: 70 }}>
                    {formatCompositeQuantity(item)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', width: 80 }}>¥{item.unitPrice.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', width: 80 }}>¥{item.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ── 金额汇总 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, margin: '14px 0', fontSize: 13 }}>
        {hasAfterSale ? (
          <>
            <div style={{ color: '#999' }}>原订单金额：¥{order.totalAmount.toFixed(2)}</div>
            <div style={{ color: '#666' }}>退货 / 换货抵扣：−¥{order.returnedAmount.toFixed(2)}</div>
            <div style={{ borderTop: '1px solid #eee', paddingTop: 4, marginTop: 2 }}>
              净出货金额：<strong style={{ fontSize: 16 }}>¥{netSaleAmount.toFixed(2)}</strong>
            </div>
          </>
        ) : (
          <div>
            合计金额：<strong style={{ fontSize: 16 }}>¥{order.totalAmount.toFixed(2)}</strong>
          </div>
        )}
        {order.receivedAmount > 0 && (
          <div style={{ color: '#666' }}>已收款：¥{order.receivedAmount.toFixed(2)}</div>
        )}
        {debt > 0 && (
          <div style={{ color: '#d4380d', fontWeight: 600 }}>尚欠：¥{debt.toFixed(2)}</div>
        )}
        {debt === 0 && (
          <div style={{ color: '#389e0d' }}>已结清</div>
        )}
      </div>

      {/* 备注 */}
      {order.remark && (
        <div style={{ marginBottom: 14, padding: '6px 10px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4, fontSize: 12 }}>
          备注：{order.remark}
        </div>
      )}

      {/* 签名区域 */}
      <div style={{ borderTop: '1px dashed #999', paddingTop: 12, display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span>送货人：_______________</span>
        <span>收货人：_______________</span>
        <span>日期：_______________</span>
      </div>

      {/* 底部小字 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 12 }}>
        由「{displayShop}」系统生成
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #ddd',
  fontWeight: 600,
  textAlign: 'left',
  fontSize: 12,
}

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: '1px solid #eee',
  fontSize: 13,
}

export default function SaleOrderReceipt({ open, order, shopName, onClose }: Props) {
  const receiptRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    if (!receiptRef.current) return
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;border:none;'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }
    doc.open()
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 20px; background: white; display: flex; justify-content: center; }
      table { border-collapse: collapse; }
      @media print { body { padding: 10px; } }
    </style></head><body>${receiptRef.current.innerHTML}</body></html>`)
    doc.close()
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => document.body.removeChild(iframe), 1500)
  }

  const handleSaveImage = async () => {
    if (!receiptRef.current || !order) return
    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `送货单_${order.orderNo}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      message.success('图片已保存，可直接发送给客户')
    } catch {
      message.error('导出图片失败，请重试')
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="送货单预览"
      width={640}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button icon={<DownloadOutlined />} onClick={handleSaveImage}>
            保存为图片
          </Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} style={{ background: '#2D6A4F', borderColor: '#2D6A4F' }}>
            打印 / 另存为 PDF
          </Button>
        </Space>
      }
    >
      {order && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <div ref={receiptRef}>
            <ReceiptContent order={order} shopName={shopName} />
          </div>
        </div>
      )}
    </Modal>
  )
}
