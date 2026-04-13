import React, { useMemo } from 'react'
import { Modal, Form, Input, InputNumber, TreeSelect } from 'antd'
import type { Category } from '@/types'
import { productApi } from '@/api/products'

function collectDescendantIds(category: Category): number[] {
  return (category.children || []).flatMap((child) => [child.id, ...collectDescendantIds(child)])
}

function buildTreeData(categories: Category[], disabledIds = new Set<number>()): object[] {
  return categories.map((c) => ({
    title: c.name,
    value: c.id,
    disabled: disabledIds.has(c.id),
    children: c.children?.length ? buildTreeData(c.children, disabledIds) : undefined,
  }))
}

interface CategoryFormModalProps {
  open: boolean
  editRecord: Category | null
  categories: Category[]
  defaultParentId?: number
  onClose: () => void
  onSuccess: () => void
}

export default function CategoryFormModal({ open, editRecord, categories, defaultParentId, onClose, onSuccess }: CategoryFormModalProps) {
  const [form] = Form.useForm()

  const disabledParentIds = useMemo(() => {
    if (!editRecord) return new Set<number>()
    return new Set([editRecord.id, ...collectDescendantIds(editRecord)])
  }, [editRecord])

  React.useEffect(() => {
    if (open) {
      if (editRecord) {
        form.setFieldsValue({
          name: editRecord.name,
          parentId: editRecord.parentId ?? undefined,
          sortOrder: editRecord.sortOrder ?? 0,
        })
      } else {
        form.resetFields()
        form.setFieldsValue({ sortOrder: 0, parentId: defaultParentId })
      }
    }
  }, [open, editRecord, defaultParentId, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (editRecord) {
      await productApi.updateCategory(editRecord.id, values)
    } else {
      await productApi.createCategory(values)
    }
    onClose()
    onSuccess()
  }

  return (
    <Modal
      title={editRecord ? '编辑分类' : '新增分类'}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      afterClose={() => { form.resetFields() }}
      width={400}
      okText="保存"
      cancelText="取消"
      okButtonProps={{ style: { background: '#2D6A4F', borderColor: '#2D6A4F' } }}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
          <Input placeholder="如：绿茶" autoFocus />
        </Form.Item>
        <Form.Item name="parentId" label="父分类（可选）">
          <TreeSelect
            treeData={buildTreeData(categories, disabledParentIds)}
            allowClear
            treeDefaultExpandAll
            placeholder="顶级分类"
            treeNodeFilterProp="title"
          />
        </Form.Item>
        <Form.Item name="sortOrder" label="排序值" tooltip="数值越小越靠前">
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
