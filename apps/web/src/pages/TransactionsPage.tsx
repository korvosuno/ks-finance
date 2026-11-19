import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useFinance } from '../app/App'
import {
  TransactionDetails,
  TransactionsPanel,
} from '../components/TransactionsPanel'
import type { Book } from './BookPage'

export function TransactionsPage() {
  const { ledgerId, transactionId } = useParams()
  const { search } = useLocation()
  const { bookkeeping, snapshot } = useFinance()
  const [data, setData] = useState<{
    books?: Book[]
    retry: number
    snapshot: typeof snapshot
    ledgerId?: string
  }>()
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const ledgers = snapshot.ledgers.filter(
      ({ id }) => !ledgerId || id === ledgerId,
    )
    let active = true
    void Promise.all(ledgers.map(({ id }) => bookkeeping.load(id))).then(
      (records) => {
        if (!active) return
        setData({
          snapshot,
          retry,
          ledgerId,
          books: records.map((book) => {
            const accounts = book.accounts.filter(({ is_system }) => !is_system)
            const ids = new Set(accounts.map(({ id }) => id))
            return {
              ...book,
              accounts,
              postings: book.postings.filter(({ account_id }) =>
                ids.has(account_id),
              ),
            }
          }),
        })
      },
      () => {
        if (active) setData({ snapshot, ledgerId, retry })
      },
    )
    return () => {
      active = false
    }
  }, [bookkeeping, ledgerId, snapshot, retry])

  const allowedBooks = (
    data?.ledgerId === ledgerId ? data?.books : undefined
  )?.filter(({ ledger }) => snapshot.ledgers.some(({ id }) => id === ledger.id))
  const error =
    data &&
    !data.books &&
    data.snapshot === snapshot &&
    data.ledgerId === ledgerId &&
    data.retry === retry
  const book = allowedBooks?.find(({ ledger }) => ledger.id === ledgerId)
  const transaction = book?.transactions.find(({ id }) => id === transactionId)

  return (
    <section className='panel'>
      {transactionId && (
        <nav aria-label='当前位置' className='breadcrumbs'>
          <Link to={{ pathname: '/manage/transactions', search }}>
            返回交易列表
          </Link>
        </nav>
      )}
      <h2>交易</h2>
      {error ? (
        <div>
          <p role='alert'>无法读取交易。</p>
          <button type='button' onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
        </div>
      ) : !allowedBooks ? (
        <p role='status'>正在读取交易…</p>
      ) : transactionId ? (
        book && transaction ? (
          <TransactionDetails
            key={transaction.id}
            book={book}
            transaction={transaction}
          />
        ) : data?.snapshot !== snapshot ? (
          <p role='status'>正在读取交易…</p>
        ) : (
          <p role='alert'>找不到这笔交易。</p>
        )
      ) : (
        <TransactionsPanel books={allowedBooks} />
      )}
    </section>
  )
}
