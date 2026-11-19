import { expect, test } from '@playwright/test'

test('posts automatic rent and credit card repayment on offline opens', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date('2028-01-30T00:00:00Z'))
  await page.goto('/')
  await page.getByLabel('显示名称').fill('小林')
  await page.getByRole('button', { name: '完成登记' }).click()
  await page.getByLabel('设备名称').fill('记账设备')
  await page.getByRole('button', { name: '完成登记' }).click()
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '创建工作空间' }).click()
  await page.getByLabel('空间名称').fill('家用')
  await page.getByLabel('空间时区').fill('Asia/Shanghai')
  await page.getByRole('button', { name: '保存工作空间' }).click()

  const basics = page.getByRole('link', { name: '基础', exact: true })
  const transactions = page.getByRole('link', { name: '交易', exact: true })
  await basics.click()
  await page.getByRole('button', { name: '创建账本' }).click()
  await page.getByLabel('账本名称').fill('日常')
  await page.getByRole('button', { name: '保存账本' }).click()
  const ledger = page.getByRole('link', { name: '日常', exact: true })
  const ledgerPath = await ledger.getAttribute('href')
  await ledger.click()

  for (const [name, category] of [
    ['银行', 'ASSET'],
    ['信用卡', 'LIABILITY'],
  ]) {
    await page.getByRole('button', { name: '创建账户', exact: true }).click()
    await page.getByLabel('账户名称').fill(name)
    await page.getByLabel('账户类别').selectOption(category)
    await page.getByRole('button', { name: '保存账户' }).click()
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  }

  await basics.click()
  const section = page.getByRole('region', { name: '自动交易' })
  const dialog = page.getByRole('dialog')
  const plan = (name: string) =>
    section.getByRole('listitem').filter({ hasText: name })
  const start = dialog.getByLabel('首次到期日')
  const create = section.getByRole('button', { name: '新建自动交易' })
  const savePlan = dialog.getByRole('button', { name: '保存计划' })
  const bank = { label: '银行 · CNY' }
  const card = { label: '信用卡 · CNY' }

  await create.click()
  const cardLayout = await dialog
    .locator('.form-fields')
    .evaluateAll(([ledger, details]) => ({
      ledgerPadding: getComputedStyle(ledger).padding,
      detailsPadding: getComputedStyle(details).padding,
      cardGap:
        details.getBoundingClientRect().top -
        ledger.getBoundingClientRect().bottom,
    }))
  expect(cardLayout.ledgerPadding).toBe(cardLayout.detailsPadding)
  expect(cardLayout.cardGap).toBeGreaterThan(0)
  await dialog.getByLabel('交易描述').fill('房租')
  await start.fill('2028-01-31')
  await dialog.getByLabel('频率').selectOption('monthly')
  await dialog.getByLabel('分录账户').selectOption(bank)
  await dialog.getByLabel('金额').fill('1000')
  await savePlan.click()
  await expect(plan('房租')).toContainText('2028-01-31')

  await create.click()
  await dialog.getByLabel('交易描述').fill('信用卡还款')
  await dialog.getByLabel('交易类型').selectOption('transfer')
  await start.fill('2028-02-01')
  await dialog
    .getByRole('group', { name: '分录 1' })
    .getByLabel('分录账户')
    .selectOption(card)
  await dialog
    .getByRole('group', { name: '分录 2' })
    .getByLabel('分录账户')
    .selectOption(bank)
  for (const amount of await dialog.getByLabel('金额').all())
    await amount.fill('200')
  await savePlan.click()
  await expect(plan('信用卡还款')).toContainText('一次性')

  await expect
    .poll(() =>
      page.evaluate(
        async () => !!(await navigator.serviceWorker.getRegistration())?.active,
      ),
    )
    .toBe(true)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)
  await context.setOffline(true)
  await page.clock.setFixedTime(new Date('2028-02-01T00:00:00Z'))
  await transactions.click()
  await expect(page.getByRole('link', { name: /房租|信用卡还款/ })).toHaveCount(
    0,
  )
  await page.reload()

  const repayment = page.getByRole('link', { name: /信用卡还款/ })
  const rent = page.getByRole('link', { name: /房租/ })
  await expect(repayment).toContainText('2028-02-01')
  await expect(rent).toContainText('2028-01-31')
  await repayment.click()
  const postings = page.getByRole('region', { name: '分录' })
  await expect(
    postings.getByRole('listitem').filter({ hasText: '信用卡' }),
  ).toContainText('借方')
  await expect(
    postings.getByRole('listitem').filter({ hasText: '银行' }),
  ).toContainText('贷方')
  await expect(postings.getByText('200.00 CNY', { exact: true })).toHaveCount(2)
  await page.getByRole('link', { name: '返回交易列表' }).click()
  await page.reload()
  await expect(repayment).toHaveCount(1)
  await expect(rent).toHaveCount(1)

  await basics.click()
  await expect(plan('信用卡还款')).toContainText('已完成')
  await expect(plan('房租')).toContainText('2028-02-29')
  await plan('房租').getByRole('button', { name: '编辑计划' }).click()
  await expect(dialog.getByLabel('金额')).toHaveValue('1000')
  await dialog.getByLabel('金额').fill('1100')
  await savePlan.click()
  await expect(plan('房租')).toContainText('1100 CNY')

  await page.clock.setFixedTime(new Date('2028-02-29T00:00:00Z'))
  await page.reload()
  await expect(plan('房租')).toContainText('2028-03-31')
  await plan('房租').getByRole('button', { name: '停止计划' }).click()
  await dialog.getByRole('button', { name: '确认停止' }).click()
  await expect(plan('房租')).toContainText('已停止')

  await page.clock.setFixedTime(new Date('2028-04-01T00:00:00Z'))
  await page.reload()
  await transactions.click()
  await expect(repayment).toHaveCount(1)
  await expect(rent).toHaveCount(2)
  await expect(rent.filter({ hasText: '2028-02-29' })).toContainText(
    '1100.00 CNY',
  )
  await page.goto(ledgerPath!)
  await expect(
    page.getByRole('listitem').filter({ hasText: '银行' }),
  ).toContainText('-2300.00 CNY')
  await expect(
    page.getByRole('listitem').filter({ hasText: '信用卡' }),
  ).toContainText('-200.00 CNY')
})
