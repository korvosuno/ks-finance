import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useEffect, useMemo, useState } from 'react'
import type { FinancialTransaction } from '@ks-finance/domain/transaction'
import { ECharts } from './ECharts'

use([LineChart, GridComponent, TooltipComponent, SVGRenderer])

function localDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export default function WeeklyTransactionsChart({
  transactions,
}: {
  transactions: FinancialTransaction[]
}) {
  const [today, setToday] = useState(() => localDate(new Date()))

  useEffect(() => {
    const refresh = () => setToday(localDate(new Date()))
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const points = useMemo(() => {
    const days = new Map<string, number>()
    const date = new Date(`${today}T12:00:00`)
    date.setDate(date.getDate() - 6)
    for (let offset = 0; offset < 7; offset++) {
      days.set(localDate(date), 0)
      date.setDate(date.getDate() + 1)
    }
    for (const { status, accounting_date } of transactions) {
      const count = days.get(accounting_date)
      if (status === 'posted' && count !== undefined)
        days.set(accounting_date, count + 1)
    }
    return [...days]
  }, [today, transactions])

  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 40, right: 24, top: 18, bottom: 32 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: points.map(([day]) => day.slice(5)) },
      yAxis: { type: 'value', min: 0, minInterval: 1 },
      series: [
        {
          name: '已入账笔数',
          type: 'line',
          color: '#8b4513',
          data: points.map(([, count]) => count),
        },
      ],
    }),
    [points],
  )

  return (
    <section aria-label='近 7 天已入账笔数'>
      <h3>近 7 天已入账笔数</h3>
      <ECharts option={option} />
      <ul className='visually-hidden' aria-label='每日已入账笔数'>
        {points.map(([day, count]) => (
          <li key={day}>
            {day} · {count} 笔
          </li>
        ))}
      </ul>
    </section>
  )
}
