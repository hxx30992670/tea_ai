import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Typography } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { Product } from '@/types'

const { Text } = Typography

const isCode128Safe = (value?: string | null) => !!value && /^[\x20-\x7E]+$/.test(value)

interface PrintLabelsModalProps {
  open: boolean
  products: Product[]
  onClose: () => void
}

export default function PrintLabelsModal({ open, products, onClose }: PrintLabelsModalProps) {
  const [qrCodeMap, setQrCodeMap] = useState<Record<number, string>>({})
  const printComponentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    const buildQrCodes = async () => {
      const entries = await Promise.all(
        products.map(async (product) => {
          if (!product.sku) return [product.id, ''] as const
          try {
            const url = await QRCode.toDataURL(product.sku, {
              margin: 0,
              width: 72,
              errorCorrectionLevel: 'M',
            })
            return [product.id, url] as const
          } catch {
            return [product.id, ''] as const
          }
        }),
      )

      if (!cancelled) {
        setQrCodeMap(Object.fromEntries(entries))
      }
    }

    if (products.length > 0) {
      void buildQrCodes()
    } else {
      setQrCodeMap({})
    }

    return () => {
      cancelled = true
    }
  }, [products])

  const handlePrint = () => {
    if (!printComponentRef.current || products.length === 0) {
      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1000px;height:800px;border:none;'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) {
      document.body.removeChild(iframe)
      return
    }

    doc.open()
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>商品标签打印</title><style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 12px; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
      .label-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .label-item {
        width: 142px;
        height: 90px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
      }
      .label-name { font-weight: 600; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .label-sku { font-size: 10px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .label-bottom { display: flex; justify-content: space-between; align-items: flex-end; gap: 4px; }
      .label-price { color: #2D6A4F; font-size: 14px; font-weight: 700; white-space: nowrap; }
      @page { margin: 8mm; }
      @media print { body { padding: 0; } }
    </style></head><body>${printComponentRef.current.innerHTML}</body></html>`)
    doc.close()

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()

    setTimeout(() => {
      document.body.removeChild(iframe)
      onClose()
    }, 1200)
  }

  return (
    <Modal
      title="打印商品标签"
      open={open}
      onCancel={onClose}
      onOk={handlePrint}
      okText="打印"
      cancelText="取消"
      width={800}
      okButtonProps={{
        icon: <PrinterOutlined />,
        style: { background: '#2D6A4F', borderColor: '#2D6A4F' },
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">共 {products.length} 个标签，将生成 40mm×30mm 标准热敏标签</Text>
      </div>
      <div
        ref={printComponentRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          maxHeight: 500,
          overflow: 'auto',
          padding: 16,
          background: '#fafafa',
          borderRadius: 8,
        }}
      >
        {products.map((product) => (
          <div
            key={product.id}
            style={{
              width: 142,
              height: 116,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              padding: '8px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product.name}
            </div>
            <div style={{ fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product.sku || '-'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, minHeight: 42 }}>
              <span style={{ color: '#2D6A4F', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>¥{product.sellPrice}</span>
              {qrCodeMap[product.id] ? (
                <img src={qrCodeMap[product.id]} alt={`${product.sku}-qrcode`} style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 40, height: 40, border: '1px dashed #ddd', borderRadius: 4, flexShrink: 0 }} />
              )}
            </div>
            <div style={{ marginTop: 4, minHeight: 26, display: 'flex', alignItems: 'flex-end' }}>
              {isCode128Safe(product.sku) ? (
                <svg
                  style={{ width: '100%', height: 24, display: 'block' }}
                  ref={(el) => {
                    if (el && product.sku) {
                      try {
                        JsBarcode(el as SVGSVGElement, product.sku, {
                          format: 'CODE128',
                          width: 1.08,
                          height: 24,
                          displayValue: false,
                          margin: 0,
                        })
                      } catch {
                        // 忽略条形码生成错误
                      }
                    }
                  }}
                />
              ) : (
                <div style={{ fontSize: 9, color: '#999' }}>SKU含中文，请改英文数字</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}