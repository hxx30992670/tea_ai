import React, { useRef } from 'react'
import { Button, Modal, Space, message } from 'antd'
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons'
import html2canvas from 'html2canvas'
import type { SaleOrder } from '@/types'

interface Props {
  open: boolean
  customerName: string
  orders: SaleOrder[]
  shopName?: string
  onClose: () => void
}

function StatementContent({
  customerName,
  orders,
  shopName,
}: {
  customerName: string
  orders: SaleOrder[]
  shopName?: string
}) {
  const displayShop = shopName || '茶掌柜'
  const today = new Date().toISOString().slice(0, 10)

  const totalAmount = orders.reduce((s, o) => s + o.totalAmount, 0)
  const totalReceived = orders.reduce((s, o) => s + o.receivedAmount, 0)
  const totalReturned = orders.reduce((s, o) => s + o.returnedAmount, 0)
  const totalDebt = Math.max(0, totalAmount - totalReceived - totalReturned)

  return (
    <div style={{
      width: 580,
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
        客户对账单
      </div>

      {/* 基本信息 */}
      <div style={{ borderTop: '2px solid #1a1a1a', borderBottom: '1px dashed #999', padding: '6px 0', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span>客户：<strong>{customerName}</strong></span>
        <span>对账日期：{today}</span>
      </div>

      {/* 订单明细 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={thStyle}>单号</th>
            <th style={thStyle}>日期</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>金额</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>已收</th>
            <th style={{ ...thStyle, textAlign: 'right', color: '#d4380d' }}>欠款</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, idx) => {
            const debt = Math.max(0, o.totalAmount - o.receivedAmount - o.returnedAmount)
            return (
              <tr key={o.id} style={{ background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                <td style={tdStyle}>{o.orderNo}</td>
                <td style={tdStyle}>{o.createdAt?.slice(0, 10)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>¥{o.totalAmount.toFixed(2)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>¥{(o.receivedAmount + o.returnedAmount).toFixed(2)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: debt > 0 ? '#d4380d' : '#389e0d', fontWeight: debt > 0 ? 600 : 400 }}>
                  {debt > 0 ? `¥${debt.toFixed(2)}` : '已结清'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 汇总 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginBottom: 16, paddingTop: 8, borderTop: '1px solid #eee' }}>
        <div>累计交易：<strong>¥{totalAmount.toFixed(2)}</strong></div>
        <div style={{ color: '#666' }}>已收款：¥{totalReceived.toFixed(2)}</div>
        {totalReturned > 0 && <div style={{ color: '#666' }}>退货抵扣：¥{totalReturned.toFixed(2)}</div>}
        <div style={{ fontSize: 15, fontWeight: 700, color: totalDebt > 0 ? '#d4380d' : '#389e0d' }}>
          {totalDebt > 0 ? `尚欠合计：¥${totalDebt.toFixed(2)}` : '✓ 账款已结清'}
        </div>
      </div>

      {/* 签名区域 */}
      <div style={{ borderTop: '1px dashed #999', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span>对账确认（客户签字）：_______________</span>
        <span>日期：_______________</span>
      </div>

      {/* 底部 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 12 }}>
        由「{displayShop}」系统生成 · {today}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #ddd',
  fontWeight: 600,
  fontSize: 12,
  textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: '1px solid #eee',
  fontSize: 12,
}

export default function CustomerStatement({ open, customerName, orders, shopName, onClose }: Props) {
  const statementRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    if (!statementRef.current) return
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
    </style></head><body>${statementRef.current.innerHTML}</body></html>`)
    doc.close()
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => document.body.removeChild(iframe), 1500)
  }

  const handleSaveImage = async () => {
    if (!statementRef.current) return
    try {
      const canvas = await html2canvas(statementRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `对账单_${customerName}_${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      message.success('对账单图片已保存，可直接发给客户')
    } catch {
      message.error('导出图片失败，请重试')
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`对账单 · ${customerName}`}
      width={660}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button icon={<DownloadOutlined />} onClick={handleSaveImage}>
            保存为图片
          </Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
            打印 / 另存为 PDF
          </Button>
        </Space>
      }
    >
      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>该客户暂无订单记录</div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <div ref={statementRef}>
            <StatementContent customerName={customerName} orders={orders} shopName={shopName} />
          </div>
        </div>
      )}
    </Modal>
  )
}
