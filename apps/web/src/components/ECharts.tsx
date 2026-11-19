import { getInstanceByDom, init } from 'echarts/core'
import type { EChartsCoreOption } from 'echarts/core'
import { useEffect, useRef } from 'react'

export function ECharts({ option }: { option: EChartsCoreOption }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const chart = init(element, null, { renderer: 'svg' })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [])

  useEffect(() => {
    if (container.current)
      getInstanceByDom(container.current)?.setOption(option, true)
  }, [option])

  return <div ref={container} className='chart-surface' aria-hidden='true' />
}
