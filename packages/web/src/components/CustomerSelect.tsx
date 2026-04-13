import React from 'react'
import { Select } from 'antd'
import type { SelectProps } from 'antd'
import type { Customer } from '@/types'

interface CustomerSelectProps extends Omit<SelectProps, 'options' | 'filterOption' | 'value' | 'onChange'> {
  customers: Customer[]
  value?: number
  onChange?: (id: number | undefined) => void
}

function buildSearchText(c: Customer): string {
  return [c.name, c.contactName, c.phone].filter(Boolean).join(' ')
}

export default function CustomerSelect({
  customers,
  value,
  onChange,
  placeholder = '选择客户',
  ...restProps
}: CustomerSelectProps) {
  const customerMap = new Map(customers.map((c) => [c.id, c]))

  const options = customers.map((c) => ({
    value: c.id,
    label: buildSearchText(c),
    customer: c,
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
        const c = customerMap.get(Number(opt.value))
        if (!c) return <span>{String(opt.label ?? opt.value)}</span>
        return (
          <span>
            <span style={{ fontWeight: 500 }}>{c.name}</span>
            {c.contactName && <span style={{ color: '#999', marginLeft: 8 }}>{c.contactName}</span>}
            {c.phone && <span style={{ color: '#999', marginLeft: 8 }}>{c.phone}</span>}
          </span>
        )
      }}
      optionRender={(opt) => {
        const c = (opt.data as { customer: Customer }).customer
        if (!c) return <span>{opt.label}</span>
        return (
          <div style={{ padding: '4px 0', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
              {c.contactName && <span>联系人：{c.contactName}</span>}
              {c.phone && <span style={{ marginLeft: 12 }}>电话：{c.phone}</span>}
            </div>
          </div>
        )
      }}
      options={options}
      {...restProps}
    />
  )
}