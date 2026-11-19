import { AutomaticTransactionsSection } from './AutomaticTransactionsSection'
import { LedgersSection } from './LedgersSection'
import { TagsSection } from './TagsSection'

export function BasicsPage() {
  return (
    <section className='panel sectioned-panel' aria-labelledby='basics-heading'>
      <h2 id='basics-heading'>基础</h2>
      <LedgersSection />
      <AutomaticTransactionsSection />
      <TagsSection />
    </section>
  )
}
