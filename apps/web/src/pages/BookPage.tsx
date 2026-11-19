import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { useFinance } from '../app/App'
import { AccountsPanel } from '../components/AccountsPanel'
import { GroupsPanel } from '../components/GroupsPanel'
export type Book = Awaited<
  ReturnType<ReturnType<typeof useFinance>['bookkeeping']['load']>
>

export function BookPage({ legacy = false }: { legacy?: boolean }) {
  const { snapshot } = useFinance()
  const { workspaceId, ledgerId, section, transactionId } = useParams()
  const { search, hash } = useLocation()
  const ledger = snapshot.ledgers.find(
    (item) => item.id === ledgerId && item.workspace_id === workspaceId,
  )

  if (!ledger) {
    return (
      <section className='panel'>
        <h2>账本不可用</h2>
        <Link to='/manage/basics'>返回基础</Link>
      </section>
    )
  }

  if (section === 'transactions') {
    const filters = new URLSearchParams(search)
    filters.set('ledger', ledger.id)
    return (
      <Navigate
        replace
        to={{
          pathname: transactionId
            ? `/manage/transactions/${encodeURIComponent(ledger.id)}/${encodeURIComponent(transactionId)}`
            : '/manage/transactions',
          search: filters.toString(),
        }}
      />
    )
  }

  const detailPath = `/manage/basics/ledgers/${ledger.workspace_id}/${ledger.id}`
  if (legacy) {
    return <Navigate to={{ pathname: detailPath, search, hash }} replace />
  }

  return <LedgerBook key={ledger.id} ledgerId={ledger.id} name={ledger.name} />
}

function LedgerBook({ ledgerId, name }: { ledgerId: string; name: string }) {
  const { bookkeeping, snapshot } = useFinance()
  const [book, setBook] = useState<Book>()
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void bookkeeping.load(ledgerId).then(
      (data) => {
        if (active) {
          const accounts = data.accounts.filter((account) => !account.is_system)
          const visibleIds = new Set(accounts.map(({ id }) => id))
          setBook({
            ...data,
            accounts,
            groupMembers: data.groupMembers.filter(({ account_id }) =>
              visibleIds.has(account_id),
            ),
            postings: data.postings.filter(({ account_id }) =>
              visibleIds.has(account_id),
            ),
          })
          setError(false)
        }
      },
      () => {
        if (active) setError(true)
      },
    )
    return () => {
      active = false
    }
  }, [bookkeeping, ledgerId, snapshot])

  return (
    <section className='panel'>
      <div className='breadcrumbs'>
        <Link to='/manage/basics'>返回基础</Link>
      </div>
      <h2>{name}</h2>
      {error ? (
        <p role='alert'>无法读取账本。</p>
      ) : book ? (
        <div className='stacked-sections'>
          <section>
            <AccountsPanel book={book} />
          </section>
          <section>
            <GroupsPanel book={book} />
          </section>
        </div>
      ) : (
        <p role='status'>正在读取账本…</p>
      )}
    </section>
  )
}
