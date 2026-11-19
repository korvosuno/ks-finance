import type { Side } from '../account/account'

export const transactionTypes = [
  'income',
  'expense',
  'transfer',
  'adjustment',
  'opening_balance',
] as const

export interface FinancialTransaction {
  id: string
  ledger_id: string
  type: (typeof transactionTypes)[number]
  status: 'draft' | 'posted' | 'voided'
  description: string
  payee?: string
  occurred_at: string
  accounting_date: string
  reverse_of_id?: string
  created_by: string
  created_at: string
  updated_at: string
  revision: number
}

export interface Posting {
  id: string
  ledger_id: string
  transaction_id: string
  account_id: string
  side: Side
  amount_minor: string
  currency: string
  functional_amount_minor: string
  memo?: string
}

export interface LocalTransactionChange {
  id: string
  ledger_id: string
  device_id?: string
  action: 'save' | 'post' | 'void' | 'reverse'
  created_at: string
  transaction: FinancialTransaction
  postings: Posting[]
}

export function currencyDigits(currency: string) {
  return (
    new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  )
}

export function toMinor(value: string, currency: string) {
  const digits = currencyDigits(currency)
  const [whole, fraction = ''] = value.split('.')
  if (!/^\d{1,30}(?:\.\d+)?$/.test(value) || fraction.length > digits) {
    throw new Error(`${currency} 金额最多支持 ${digits} 位小数。`)
  }
  const minor = BigInt(whole + fraction.padEnd(digits, '0'))
  if (minor <= 0n) throw new Error('分录金额必须大于零。')
  return minor.toString()
}

export function fromMinor(value: string, currency: string) {
  const digits = currencyDigits(currency)
  const sign = value.startsWith('-') ? '-' : ''
  const padded = value.replace(/^-/, '').padStart(digits + 1, '0')
  return digits === 0
    ? sign + padded
    : sign + padded.slice(0, -digits) + '.' + padded.slice(-digits)
}

export function assertBalanced(postings: Posting[], currency: string) {
  const totals = { DEBIT: 0n, CREDIT: 0n }
  for (const posting of postings) {
    const native = posting.amount_minor
    const functional = posting.functional_amount_minor
    if (
      !/^[1-9]\d*$/.test(native) ||
      !/^[1-9]\d*$/.test(functional) ||
      (posting.currency === currency && native !== functional)
    ) {
      throw new Error('分录金额无效。')
    }
    totals[posting.side] += BigInt(functional)
  }
  if (
    new Set(postings.map(({ account_id }) => account_id)).size < 2 ||
    totals.DEBIT === 0n ||
    totals.DEBIT !== totals.CREDIT
  ) {
    throw new Error(`至少使用两个账户，且借贷两方的 ${currency} 金额必须相等。`)
  }
}

export function ledgerDate(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    dateStyle: 'short',
  }).format(instant)
}

export const automaticTransactionTypes = [
  'income',
  'expense',
  'transfer',
] as const
export const automaticFrequencies = [
  'once',
  'daily',
  'weekly',
  'monthly',
  'yearly',
] as const

export interface AutomaticTransactionTemplate {
  type: (typeof automaticTransactionTypes)[number]
  description: string
  payee?: string
  postings: {
    account_id: string
    side?: Side
    amount: string
    functional_amount?: string
    memo?: string
  }[]
}

export interface AutomaticTransactionRule {
  id: string
  ledger_id: string
  start_date: string
  frequency: (typeof automaticFrequencies)[number]
  interval: number
  occurrence: number
  next_date: string
  status: 'active' | 'completed' | 'stopped'
  revision: number
  template: AutomaticTransactionTemplate
  error?: string
}

export interface AutomaticTransactionOccurrence {
  rule_id: string
  ledger_id: string
  scheduled_date: string
  transaction_id: string
}

export function nextAutomaticDate(rule: AutomaticTransactionRule) {
  const date = new Date(`${rule.start_date}T00:00:00Z`)
  const offset = rule.interval * (rule.occurrence + 1)

  switch (rule.frequency) {
    case 'once':
      return undefined
    case 'daily':
    case 'weekly':
      date.setUTCDate(
        date.getUTCDate() + offset * (rule.frequency === 'weekly' ? 7 : 1),
      )
      break
    case 'monthly':
    case 'yearly': {
      const day = date.getUTCDate()
      date.setUTCDate(1)
      date.setUTCMonth(
        date.getUTCMonth() + offset * (rule.frequency === 'yearly' ? 12 : 1),
      )
      const end = new Date(date)
      end.setUTCMonth(end.getUTCMonth() + 1, 0)
      date.setUTCDate(Math.min(day, end.getUTCDate()))
      break
    }
  }

  if (Number.isFinite(date.getTime()) && date.getUTCFullYear() <= 9999)
    return date.toISOString().slice(0, 10)
}
