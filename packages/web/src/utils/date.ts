import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

type DateLike = string | number | Date | Dayjs | null | undefined

function toDayjs(value: DateLike) {
  if (value == null || value === '') return null
  const parsed = typeof value === 'string'
    ? parseStringDate(value)
    : dayjs(value)
  return parsed.isValid() ? parsed : null
}

function parseStringDate(value: string) {
  const trimmed = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return dayjs(trimmed)
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return dayjs.utc(trimmed.replace(' ', 'T')).local()
  }

  return dayjs(trimmed)
}

export function formatDate(value: DateLike, fallback = '-') {
  const parsed = toDayjs(value)
  return parsed ? parsed.format('YYYY-MM-DD') : fallback
}

export function formatDateTime(value: DateLike, fallback = '-') {
  const parsed = toDayjs(value)
  return parsed ? parsed.format('YYYY-MM-DD HH:mm:ss') : fallback
}

export function formatDateTimeMinute(value: DateLike, fallback = '-') {
  const parsed = toDayjs(value)
  return parsed ? parsed.format('YYYY-MM-DD HH:mm') : fallback
}

export function formatMonthDayTime(value: DateLike, fallback = '-') {
  const parsed = toDayjs(value)
  return parsed ? parsed.format('MM-DD HH:mm') : fallback
}

export function toDateOnlyValue(value?: Dayjs | null) {
  return value ? value.format('YYYY-MM-DD') : undefined
}

export function toLocalDateTimeValue(value?: Dayjs | null) {
  return value ? value.format('YYYY-MM-DDTHH:mm:ss') : undefined
}

export function toTimestamp(value: DateLike, fallback = Date.now()) {
  const parsed = toDayjs(value)
  return parsed ? parsed.valueOf() : fallback
}
