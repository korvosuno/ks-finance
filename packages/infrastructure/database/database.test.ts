import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { expect, test } from 'vitest'
import { FinanceDatabase } from './index'

test('initializes the versioned local schema and reopens the database', async () => {
  const database = new FinanceDatabase('ks-finance-test')
  try {
    await database.open()
    expect(database.verno).toBe(5)
    expect(database.table('workspace_members').schema.primKey.keyPath).toEqual([
      'workspace_id',
      'user_id',
    ])
    expect(database.table('sync_operations').schema.indexes[0]?.unique).toBe(
      true,
    )

    await database.table('currencies').add({ code: 'CNY' })
    database.close()
    await database.open()
    expect(await database.table('currencies').get('CNY')).toEqual({
      code: 'CNY',
    })
  } finally {
    await database.delete()
  }
})

test('upgrades an existing v1 database and indexes existing bookkeeping rows', async () => {
  const legacy = new Dexie('ks-finance-upgrade-test')
  legacy.version(1).stores({
    user_profiles: 'id',
    account_group_members: '[group_id+account_id], account_id',
    financial_transactions: 'id, [ledger_id+accounting_date], reverse_of_id',
  })
  const database = new FinanceDatabase(legacy.name)
  try {
    await legacy
      .table('user_profiles')
      .add({ id: 'existing-user', display_name: '已有用户' })
    await legacy
      .table('account_group_members')
      .add({ group_id: 'group', account_id: 'account' })
    await legacy.table('financial_transactions').add({
      id: 'transaction',
      ledger_id: 'ledger',
      accounting_date: '2026-11-12',
    })
    legacy.close()

    expect(await database.user_profiles.get('existing-user')).toMatchObject({
      display_name: '已有用户',
    })
    expect(
      await database.account_group_members
        .where('group_id')
        .equals('group')
        .count(),
    ).toBe(1)
    expect(
      await database.financial_transactions
        .where('ledger_id')
        .equals('ledger')
        .count(),
    ).toBe(1)
    expect(await database.device_keys.count()).toBe(0)
    expect(await database.local_changes.count()).toBe(0)
  } finally {
    legacy.close()
    await database.delete()
  }
})

test('removes legacy workspace tags and preserves ledger tags on upgrade', async () => {
  const legacy = new Dexie('ks-finance-tag-upgrade-test')
  legacy.version(3).stores({
    workspaces: 'id, owner_user_id',
    tags: 'id, user_id, &[user_id+kind+name_key]',
    tag_links: '[tag_id+kind+target_id], tag_id, [kind+target_id]',
  })
  const database = new FinanceDatabase(legacy.name)
  try {
    await legacy.table('workspaces').add({ id: 'workspace' })
    const ledgerTag = {
      id: 'ledger-tag',
      user_id: 'user',
      kind: 'ledger',
      name: '家庭',
      name_key: '家庭',
    }
    const ledgerLink = {
      tag_id: ledgerTag.id,
      kind: 'ledger',
      target_id: 'ledger',
    }
    await legacy
      .table('tags')
      .bulkAdd([
        ledgerTag,
        { ...ledgerTag, id: 'workspace-tag', kind: 'workspace' },
      ])
    await legacy
      .table('tag_links')
      .bulkAdd([
        ledgerLink,
        { tag_id: 'workspace-tag', kind: 'workspace', target_id: 'workspace' },
      ])
    legacy.close()

    expect(await database.tags.toArray()).toEqual([ledgerTag])
    expect(await database.tag_links.toArray()).toEqual([ledgerLink])
    expect(await database.workspaces.count()).toBe(1)
  } finally {
    legacy.close()
    await database.delete()
  }
})

test('adds automatic transaction tables when upgrading v4', async () => {
  const legacy = new Dexie(crypto.randomUUID())
  legacy.version(4).stores({
    financial_transactions:
      'id, ledger_id, [ledger_id+accounting_date], reverse_of_id',
  })
  const database = new FinanceDatabase(legacy.name)
  try {
    const transaction = { id: 'existing-transaction', ledger_id: 'ledger' }
    await legacy.table('financial_transactions').add(transaction)
    legacy.close()
    expect(await database.financial_transactions.get(transaction.id)).toEqual(
      transaction,
    )
    expect(await database.automatic_transaction_rules.count()).toBe(0)
    expect(await database.automatic_transaction_occurrences.count()).toBe(0)
    expect(
      database.automatic_transaction_occurrences.schema.primKey.keyPath,
    ).toEqual(['rule_id', 'scheduled_date'])
  } finally {
    legacy.close()
    await database.delete()
  }
})
