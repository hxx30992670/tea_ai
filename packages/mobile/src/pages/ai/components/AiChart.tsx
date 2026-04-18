/**
 * AI 数据可视化 — 移动端版本
 * 支持表格、柱状图、折线图、饼图，适配小屏幕与深色主题
 */
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { AiVisualizationSpec } from '@/types'
import {
  fieldToLabel,
  formatChartMetricValue,
  fmtFieldValue,
  prepareVisualizationRows,
} from '@/lib/detectVisualization'
import { getDisplayColumns, isSummarizableMetricField } from '@shared/constants/ai-field-label'

const COLORS = ['#D4A853', '#52b788', '#74c69d', '#e76f51', '#457b9d', '#e9c46a', '#a8dadc', '#f4a261']

interface Props {
  rows: Record<string, unknown>[]
  spec: AiVisualizationSpec
}

function createMetricTickFormatter(fieldName: string, rows: Record<string, unknown>[]) {
  return (value: number | string) => formatChartMetricValue(value, fieldName, rows)
}

function createTooltipFormatter(fieldName: string, rows: Record<string, unknown>[]) {
  return (value: number | string, name: string): [string, string] => (
    [formatChartMetricValue(value, fieldName, rows), fieldToLabel(name)]
  )
}

function formatCellValue(field: string, value: unknown): string {
  return fmtFieldValue(field, value)
}

// ─── 数据摘要 ─────────────────────────────────────────────────────────────────
function Summary({ type, rows, spec }: { type: string; rows: Record<string, unknown>[]; spec: AiVisualizationSpec }) {
  const chartRows = spec.type === 'bar' || spec.type === 'line' || spec.type === 'pie'
    ? prepareVisualizationRows(rows, spec.type === 'pie' ? spec.nameField ?? '' : spec.xField ?? '', spec.type === 'pie' ? undefined : spec.yField)
    : rows
  let text = ''

  if (type === 'bar' && spec.xField && spec.yField) {
    const yLabel = fieldToLabel(spec.yField)
    const vals = chartRows.map((r) => Number(r[spec.yField!]) || 0)
    const total = vals.reduce((a, b) => a + b, 0)
    const maxVal = Math.max(...vals)
    const minVal = Math.min(...vals)
    const maxIdx = vals.indexOf(maxVal)
    const minIdx = vals.indexOf(minVal)
    const maxName = String(chartRows[maxIdx]?.[spec.xField] ?? '')
    const minName = String(chartRows[minIdx]?.[spec.xField] ?? '')
    text = `共 ${rows.length} 项，${yLabel}合计 ${formatChartMetricValue(total, spec.yField!, rows)}。最高「${maxName}」${formatChartMetricValue(maxVal, spec.yField!, rows)}，最低「${minName}」${formatChartMetricValue(minVal, spec.yField!, rows)}。`
  }

  if (type === 'line' && spec.xField && spec.yField) {
    const yLabel = fieldToLabel(spec.yField)
    const vals = chartRows.map((r) => Number(r[spec.yField!]) || 0)
    const total = vals.reduce((a, b) => a + b, 0)
    const avg = total / vals.length
    const firstX = String(chartRows[0]?.[spec.xField] ?? '')
    const lastX = String(chartRows[chartRows.length - 1]?.[spec.xField] ?? '')
    text = `${firstX}→${lastX} 共 ${rows.length} 个周期，${yLabel}均值 ${formatChartMetricValue(avg, spec.yField!, rows)}，合计 ${formatChartMetricValue(total, spec.yField!, rows)}。`
  }

  if (type === 'pie' && spec.nameField && spec.valueField) {
    const yLabel = fieldToLabel(spec.valueField)
    const data = chartRows
      .map((r) => ({ name: String(r[spec.nameField!] ?? ''), value: Number(r[spec.valueField!]) || 0 }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
    const total = data.reduce((s, d) => s + d.value, 0)
    const top = data[0]
    const topPct = total > 0 ? ((top.value / total) * 100).toFixed(1) : '0'
    text = `共 ${data.length} 类，${yLabel}合计 ${formatChartMetricValue(total, spec.valueField!, rows)}。占比最高「${top.name}」${topPct}%。`
  }

  if (type === 'table') {
    const cols = getDisplayColumns(rows)
    const numSummaries: string[] = []
    for (const col of cols) {
      const rawValues = rows.map((r) => r[col])
      if (isSummarizableMetricField(col, rawValues)) {
        const vals = rawValues.map((value) => Number(value)).filter((v) => !isNaN(v) && v !== 0)
        const colTotal = vals.reduce((a, b) => a + b, 0)
        numSummaries.push(`${fieldToLabel(col)} ${formatChartMetricValue(colTotal, col, rows)}`)
      }
    }
    text = `共 ${rows.length} 条记录。${numSummaries.length > 0 ? '合计：' + numSummaries.join('，') + '。' : ''}`
  }

  if (!text) return null

  return (
    <p className="mt-2 rounded-lg bg-primary/10 border-l-2 border-primary px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      📊 {text}
    </p>
  )
}

// ─── 表格 ─────────────────────────────────────────────────────────────────────
function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = getDisplayColumns(rows)
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className="min-w-max text-xs">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">
                {fieldToLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-secondary/20'}>
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {formatCellValue(c, row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── 柱状图 ───────────────────────────────────────────────────────────────────
function BarViz({ rows, xField, yField }: { rows: Record<string, unknown>[]; xField: string; yField: string }) {
  const data = prepareVisualizationRows(rows, xField, yField)
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -16, bottom: 36 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey={xField} tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={createMetricTickFormatter(yField, rows)} />
        <Tooltip formatter={createTooltipFormatter(yField, rows)} contentStyle={{ fontSize: 12 }} />
        <Bar dataKey={yField} name={fieldToLabel(yField)} fill="#D4A853" radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 折线图 ───────────────────────────────────────────────────────────────────
function LineViz({ rows, xField, yField }: { rows: Record<string, unknown>[]; xField: string; yField: string }) {
  const data = prepareVisualizationRows(rows, xField, yField)
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -16, bottom: 36 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey={xField} tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={createMetricTickFormatter(yField, rows)} />
        <Tooltip formatter={createTooltipFormatter(yField, rows)} contentStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey={yField}
          name={fieldToLabel(yField)}
          stroke="#D4A853"
          strokeWidth={2}
          dot={{ r: 3, fill: '#D4A853' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── 饼图 ─────────────────────────────────────────────────────────────────────
function PieViz({ rows, nameField, valueField }: { rows: Record<string, unknown>[]; nameField: string; valueField: string }) {
  const data = prepareVisualizationRows(rows, nameField, valueField)
    .map((r) => ({ ...r, name: String(r[nameField] ?? ''), value: Number(r[valueField]) || 0 }))
    .filter((d) => d.value > 0)
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="46%"
          outerRadius={75}
          dataKey="value"
          label={({ name, value }) =>
            `${name} ${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%`
          }
          labelLine
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number | string) => [formatChartMetricValue(value, valueField, rows), fieldToLabel(valueField)]} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export function AiChart({ rows, spec }: Props) {
  if (!rows || rows.length === 0 || spec.type === 'none') return null

  return (
    <div className="mt-2 w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card p-3">
      {spec.type === 'table' && <DataTable rows={rows} />}

      {spec.type === 'bar' && spec.xField && spec.yField && (
        <BarViz rows={rows} xField={spec.xField} yField={spec.yField} />
      )}

      {spec.type === 'line' && spec.xField && spec.yField && (
        <LineViz rows={rows} xField={spec.xField} yField={spec.yField} />
      )}

      {spec.type === 'pie' && spec.nameField && spec.valueField && (
        <PieViz rows={rows} nameField={spec.nameField} valueField={spec.valueField} />
      )}

      <Summary type={spec.type} rows={rows} spec={spec} />

      <p className="mt-1.5 text-right text-[10px] text-muted-foreground/50">
        共 {rows.length} 条数据
      </p>
    </div>
  )
}
