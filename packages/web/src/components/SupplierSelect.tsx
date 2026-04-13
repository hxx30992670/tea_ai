import React from 'react'
import { Select } from 'antd'
import type { SelectProps } from 'antd'
import type { Supplier } from '@/types'

interface SupplierSelectProps extends Omit<SelectProps, 'options' | 'filterOption' | 'value' | 'onChange'> {
  suppliers: Supplier[]
  value?: number
  onChange?: (id: number | undefined) => void
}

function buildSearchText(s: Supplier): string {
  return [s.name, s.contactName, s.phone].filter(Boolean).join(' ')
}

export default function SupplierSelect({
  suppliers,
  value,
  onChange,
  placeholder = '选择供应商',
  ...restProps
}: SupplierSelectProps) {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

  const options = suppliers.map((s) => ({
    value: s.id,
    label: buildSearchText(s),
    supplier: s,
  }))

  return (
    <Select
      showSearch
      allowClear
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width: '100%', ...restProps.style }}
      filterOption={(input, option) =>
        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      }
      labelRender={(opt) => {
        if (!opt.value) return <span style={{ color: '#bbb' }}>{placeholder}</span>
        const s = supplierMap.get(Number(opt.value))
        if (!s) return <span>{String(opt.label ?? opt.value)}</span>
        return (
          <span>
            <span style={{ fontWeight: 500 }}>{s.name}</span>
            {s.contactName && <span style={{ color: '#999', marginLeft: 8 }}>{s.contactName}</span>}
            {s.phone && <span style={{ color: '#999', marginLeft: 8 }}>{s.phone}</span>}
          </span>
        )
      }}
      optionRender={(opt) => {
        const s = (opt.data as { supplier: Supplier }).supplier
        if (!s) return <span>{opt.label}</span>
        return (
          <div style={{ padding: '4px 0', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
              {s.contactName && <span>联系人：{s.contactName}</span>}
              {s.phone && <span style={{ marginLeft: 12 }}>电话：{s.phone}</span>}
            </div>
          </div>
        )
      }}
      options={options}
      {...restProps}
    />
  )
}