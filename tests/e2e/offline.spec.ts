import { expect, test } from '@playwright/test'

test('opens the local database and reloads the app offline', async ({
  page,
  context,
}) => {
  await page.goto('/')
  const heading = page.getByRole('heading', { name: 'Ks Finance' })
  await expect(heading).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some(
          (database) => database.name === 'ks-finance',
        ),
      ),
    )
    .toBe(true)
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
  await page.reload()
  await expect(heading).toBeVisible()
})

test('creates a profile and workspace, then creates and reopens a ledger offline', async ({
  page,
  context,
}) => {
  await page.goto('/manage/ledgers')
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole('navigation', { name: '管理菜单' })).toHaveCount(
    0,
  )
  await page.getByLabel('显示名称').fill('小林')
  await page.getByRole('button', { name: '完成登记' }).click()
  await expect(page).toHaveURL(/\/setup$/)
  await page.getByLabel('设备名称').fill('家庭笔记本')
  await page.getByRole('button', { name: '完成登记' }).click()

  await expect(page).toHaveURL(/\/manage\/transactions$/)
  await page.goto('/setup')
  await expect(page).toHaveURL(/\/manage\/transactions$/)
  await page.getByRole('link', { name: '基础', exact: true }).click()
  await expect(page.getByText('请先创建工作空间。')).toBeVisible()
  await page.getByRole('link', { name: '前往工作空间' }).click()
  await page.getByRole('button', { name: '创建工作空间', exact: true }).click()
  await page.getByLabel('空间名称').fill('家用')
  await page.getByLabel('空间类型').selectOption('household')
  await page.getByLabel('空间时区').fill('Asia/Shanghai')
  await page.getByRole('button', { name: '保存工作空间' }).click()
  await page.getByRole('link', { name: '基础', exact: true }).click()
  await expect(page).toHaveURL(/\/manage\/basics$/)
  const ledgerUrl = page.url()

  await expect
    .poll(() =>
      page.evaluate(
        async () => !!(await navigator.serviceWorker.getRegistration())?.active,
      ),
    )
    .toBe(true)
  await page.reload()
  await context.setOffline(true)
  await page.reload()

  await expect(page).toHaveURL(ledgerUrl)
  await expect(
    page
      .getByRole('navigation', { name: '管理菜单' })
      .getByRole('link', { name: '基础' }),
  ).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '创建账本', exact: true }).click()
  await expect(page.getByLabel('账本时区')).toHaveValue('Asia/Shanghai')
  await page.getByLabel('账本名称').fill('日常开销')
  await page.getByLabel('账本类型').selectOption('shared')
  await page.getByLabel('基准币种').fill('usd')
  await page.getByRole('button', { name: '保存账本' }).click()
  await expect(page.getByText('日常开销', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: '设置' }).click()
  await expect(page.getByLabel('显示名称')).toHaveValue('小林')
  await page.getByLabel('显示名称').fill('小周')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByLabel('显示名称')).toHaveAttribute('value', '小周')

  await page.reload()
  await expect(page.getByLabel('显示名称')).toHaveValue('小周')
  await page.getByRole('link', { name: '基础', exact: true }).click()
  await expect(page).toHaveURL(ledgerUrl)
  await expect(page.getByText('日常开销', { exact: true })).toBeVisible()
  const ledgerCard = page.getByRole('listitem').filter({ hasText: '日常开销' })
  for (const value of ['共享', 'USD', 'Asia/Shanghai']) {
    await expect(ledgerCard.getByText(value, { exact: true })).toBeVisible()
  }
  const otherTab = await context.newPage()
  await otherTab.goto(ledgerUrl)
  await expect(otherTab.getByText('日常开销', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '设置' }).click()
  await page.clock.install()
  await page.getByRole('button', { name: '注销用户' }).click()
  const unregister = page.getByRole('button', { name: '长按以确认注销用户' })
  await unregister.click()
  await expect(unregister).toBeVisible()
  await unregister.focus()
  await page.keyboard.down('Space')
  await page.clock.runFor(5000)
  await page.keyboard.up('Space')
  await expect(page).toHaveURL(/\/setup$/)
  await expect(otherTab).toHaveURL(/\/setup$/)
  await expect(page.getByLabel('显示名称')).toHaveValue('')
  await page.goto(ledgerUrl)
  await expect(page).toHaveURL(/\/setup$/)
})

test('registers a device and posts and reverses a transaction while offline', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date(2026, 10, 18, 12))
  await page.goto('/')
  await page.getByLabel('显示名称').fill('本地用户')
  await page.getByLabel('设备名称').fill('测试笔记本')
  await page.getByRole('button', { name: '完成登记' }).click()
  await page.getByRole('link', { name: '设置' }).click()
  await expect(page).toHaveURL(/\/manage\/settings$/)
  await expect(
    page.getByRole('region', { name: '用户', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: '设备', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('测试笔记本 · 当前设备')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /撤销设备|登记当前设备/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '编辑设备' }).click()
  await page.getByLabel('设备名称').fill('改名后的笔记本')
  await page.getByRole('button', { name: '保存名称' }).click()
  await expect(page.getByText('改名后的笔记本 · 当前设备')).toBeVisible()

  for (const path of ['/manage/devices', '/manage/profile']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/manage\/settings$/)
  }

  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '创建工作空间', exact: true }).click()
  await page.getByLabel('空间名称').fill('家用')
  await page.getByRole('button', { name: '保存工作空间' }).click()
  await page.getByRole('link', { name: '基础', exact: true }).click()
  await page.getByRole('button', { name: '创建账本', exact: true }).click()
  await page.getByLabel('账本名称').fill('日常')
  await page.getByRole('button', { name: '保存账本' }).click()
  await page.getByRole('link', { name: '日常', exact: true }).click()

  await expect(page).toHaveURL(/\/manage\/basics\/ledgers\/[\w-]+\/[\w-]+$/)
  const ledgerDetailUrl = page.url()
  const legacyBookUrl = ledgerDetailUrl.replace(
    '/manage/basics/ledgers/',
    '/manage/ledgers/',
  )
  const legacyList = `${legacyBookUrl}/transactions`
  await page.goto(`${legacyBookUrl}/groups`)
  await expect(page).toHaveURL(ledgerDetailUrl)
  const menu = page.getByRole('navigation', { name: '管理菜单' })
  await expect(page.getByRole('navigation')).toHaveCount(1)
  await expect(
    page.getByRole('heading', { name: '账户', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '账户集合' })).toBeVisible()
  await expect(page.getByRole('link', { name: '返回基础' })).toHaveAttribute(
    'href',
    '/manage/basics',
  )
  const originalViewport = page.viewportSize()!
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 640, height: 360 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport)
    const links = menu.getByRole('link')
    await expect(links).toHaveText(['交易', '基础', '设置'])
    await expect(menu.locator('svg')).toHaveCount(3)
    const rows = await links.evaluateAll((items) =>
      items.map((link) => {
        const { left, top, bottom } = link.getBoundingClientRect()
        return { left, top, bottom }
      }),
    )
    for (let index = 1; index < rows.length; index++) {
      if (viewport.width < 704) {
        expect(rows[index].top).toBe(rows[0].top)
        expect(rows[index].left).toBeGreaterThan(rows[index - 1].left)
      } else {
        expect(rows[index].top).toBeGreaterThanOrEqual(rows[index - 1].bottom)
      }
    }
    if (viewport.width < 704) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      const bottom = await menu.evaluate(
        (element) => element.parentElement!.getBoundingClientRect().bottom,
      )
      expect(bottom).toBe(viewport.height)
    }
  }
  await page.setViewportSize(originalViewport)

  await page.getByRole('button', { name: '创建账户', exact: true }).click()
  await page.getByLabel('科目代码').fill('1000')
  await page.getByLabel('账户名称').fill('现金')
  await page.getByRole('button', { name: '保存账户' }).click()
  await expect(page.getByText('1000 · 现金')).toBeVisible()
  await page.getByRole('button', { name: '创建账户', exact: true }).click()
  await page.getByLabel('科目代码').fill('5000')
  await page.getByLabel('账户名称').fill('餐饮')
  await page.getByLabel('账户类别').selectOption('EXPENSE')
  await page.getByRole('button', { name: '保存账户' }).click()
  await expect(page.getByText('5000 · 餐饮')).toBeVisible()

  await page.getByRole('button', { name: '创建集合', exact: true }).click()
  await page.getByLabel('集合名称').fill('日常支出')
  await page.getByRole('checkbox', { name: '餐饮' }).check()
  await page.getByRole('button', { name: '保存集合' }).click()
  await expect(page.getByText('日常支出', { exact: true })).toBeVisible()

  await expect
    .poll(() =>
      page.evaluate(
        async () => !!(await navigator.serviceWorker.getRegistration())?.active,
      ),
    )
    .toBe(true)
  await page.reload()
  await context.setOffline(true)
  await page.getByRole('link', { name: '交易', exact: true }).click()

  await page.getByRole('button', { name: '新建交易' }).click()
  await page.getByLabel('交易类型').selectOption('opening_balance')
  await page.getByLabel('交易描述').fill('期初现金')
  await page.getByLabel('分录账户').selectOption({ label: '1000 · 现金 · CNY' })
  await page.getByLabel('金额（CNY）').fill('+100')
  const transactionList = page.getByRole('list', { name: '交易列表' })
  await page.getByRole('button', { name: '入账', exact: true }).click()
  await expect(page.getByText('初始入账', { exact: true })).toBeVisible()
  await expect(page.getByText('已过账', { exact: true })).toBeVisible()
  const openingId = new URL(page.url()).pathname.split('/').at(-1)
  await page.goto(`${legacyList}/${openingId}`)
  await expect(page.getByRole('heading', { name: '期初现金' })).toBeVisible()
  await page.goto(legacyList)
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/manage/transactions' && url.searchParams.has('ledger'),
  )
  const opening = transactionList.getByRole('link', { name: /期初现金/ })
  await expect(opening.locator('.transaction-posting')).toHaveCount(1)
  await expect(page.locator('.chart-surface svg')).toBeVisible()
  await expect(page.getByText('查看每日笔数')).toHaveCount(0)
  const points = page.getByRole('list', { name: '每日已入账笔数' })
  await expect(points.getByRole('listitem')).toHaveCount(7)
  await expect(points.getByRole('listitem').first()).toHaveText(
    '2026-11-12 · 0 笔',
  )
  await expect(points.getByRole('listitem').last()).toHaveText(
    '2026-11-18 · 1 笔',
  )

  await page.getByRole('button', { name: '新建交易' }).click()
  await page.getByLabel('交易描述').fill('午饭')
  await page.getByLabel('交易对方').fill('餐馆')
  await expect(page.getByLabel('分录账户')).toHaveCount(1)
  await page.getByLabel('分录账户').selectOption({ label: '1000 · 现金 · CNY' })
  await page.getByLabel('金额（CNY）').fill('12.50')
  await page.getByLabel(/记账日期（/).fill('2026-11-15')
  await page.getByRole('button', { name: '保存草稿' }).click()

  await expect(page.getByRole('heading', { name: '午饭' })).toBeVisible()
  await page.getByRole('link', { name: '返回交易列表' }).click()
  await expect(page.getByRole('dialog', { name: '新建交易' })).toHaveCount(0)
  await expect(transactionList.getByRole('link')).toHaveCount(2)
  await expect(points.getByText('2026-11-15 · 0 笔')).toHaveText(
    '2026-11-15 · 0 笔',
  )
  const filterButton = page.getByRole('button', { name: /^筛选/ })
  await filterButton.click()
  const filters = page.getByRole('form', { name: '筛选交易' })
  await filters.getByLabel('关键字').fill('餐馆')
  await filters.getByLabel('起始记账日期').fill('2026-11-16')
  await filters.getByLabel('结束记账日期').fill('2026-11-16')
  await filters.getByLabel('类型').selectOption('expense')
  await filters.getByLabel('状态').selectOption('draft')
  await filters.getByLabel('账户').selectOption({ label: '1000 · 现金' })
  await filters.getByRole('button', { name: '应用筛选', exact: true }).click()
  await expect(page.getByText('没有匹配的交易。')).toBeVisible()
  await filterButton.click()
  await filters.getByLabel('起始记账日期').fill('2026-11-15')
  await filters.getByLabel('结束记账日期').fill('2026-11-15')
  await filters.getByRole('button', { name: '应用筛选', exact: true }).click()
  await expect(transactionList.getByRole('link')).toHaveCount(1)

  await transactionList.getByRole('link', { name: /午饭/ }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('q') === '餐馆' &&
      /\/transactions\/[^/]+\/[^/]+$/.test(url.pathname),
  )
  await page.getByRole('button', { name: '过账', exact: true }).click()
  await expect(page.getByText('支出', { exact: true })).toBeVisible()
  await expect(page.getByText('已过账', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === '餐馆')
  const lunch = page.getByRole('article')
  await expect(lunch.getByRole('heading', { name: '午饭' })).toBeVisible()
  const posting = lunch.getByRole('listitem').filter({ hasText: '贷方' })
  await expect(posting.getByText('现金', { exact: true })).toBeVisible()
  await expect(posting.getByText('12.50 CNY', { exact: true })).toBeVisible()
  await expect(lunch.getByText('餐馆', { exact: true })).toBeVisible()
  await expect(lunch.getByText('对外支出')).toHaveCount(0)
  page.once('dialog', (dialog) => dialog.accept())
  await lunch.getByRole('button', { name: '冲销', exact: true }).click()
  await expect(lunch.getByText('已冲销', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回交易列表' }).click()
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === '餐馆')
  await expect(points.getByText('2026-11-15 · 1 笔')).toHaveText(
    '2026-11-15 · 1 笔',
  )
  await expect(points.getByText('2026-11-18 · 2 笔')).toHaveText(
    '2026-11-18 · 2 笔',
  )
  await filterButton.click()
  await expect(filters.getByLabel('关键字')).toHaveValue('餐馆')
  await expect(filters.getByLabel('状态')).toHaveValue('draft')
  await filters.getByRole('button', { name: '重置' }).click()
  await expect(transactionList.getByRole('link')).toHaveCount(3)
  await transactionList.getByRole('link', { name: /冲销：午饭/ }).click()
  await expect(page.getByRole('heading', { name: '冲销：午饭' })).toBeVisible()
  await page.goto(ledgerDetailUrl)
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: '1000 · 现金' })
      .getByText('100.00 CNY', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/期初权益|对外支出/)).toHaveCount(0)
  await page.getByRole('button', { name: '创建账户', exact: true }).click()
  await expect(page.getByLabel('上级账户').locator('option')).toHaveCount(3)
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '创建集合', exact: true }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click()

  await page.getByRole('link', { name: '交易', exact: true }).click()
  await page.getByRole('button', { name: '新建交易' }).click()
  const draft = page.getByRole('dialog', { name: '新建交易' })
  await draft.getByLabel('交易描述').fill('双边分录')
  await draft.getByRole('button', { name: '添加分录' }).click()
  await draft
    .getByLabel('分录账户')
    .nth(0)
    .selectOption({ label: '5000 · 餐饮 · CNY' })
  await draft
    .getByLabel('分录账户')
    .nth(1)
    .selectOption({ label: '1000 · 现金 · CNY' })
  await draft.getByLabel('金额（CNY）').nth(0).fill('20')
  await draft.getByLabel('金额（CNY）').nth(1).fill('20')
  await draft.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByRole('heading', { name: '双边分录' })).toBeVisible()
  await page.getByRole('link', { name: '返回交易列表' }).click()
  const doubleEntry = transactionList.getByRole('link', { name: /双边分录/ })
  await expect(doubleEntry.locator('.transaction-posting')).toHaveCount(2)
  await doubleEntry.click()
  await expect(page.getByRole('heading', { name: '双边分录' })).toBeVisible()
})

test('switches workspaces and manages ledger tags on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByLabel('显示名称').fill('标签用户')
  await page.getByLabel('设备名称').fill('笔记本')
  await page.getByRole('button', { name: '完成登记' }).click()
  await page.getByRole('link', { name: '设置', exact: true }).click()
  const createWorkspace = page.getByRole('button', { name: '创建工作空间' })
  await createWorkspace.click()
  const workspaceDialog = page.getByRole('dialog', { name: '创建工作空间' })
  await expect(workspaceDialog).toBeVisible()
  await expect(page.getByLabel('空间名称')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await expect(
    workspaceDialog.getByRole('combobox', { name: '标签' }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(createWorkspace).toBeFocused()

  for (const name of ['家庭', '个人']) {
    await createWorkspace.click()
    await page.getByLabel('空间名称').fill(name)
    await page.getByRole('button', { name: '保存工作空间' }).click()
  }
  await expect(page.getByText('家庭 · 当前工作空间')).toBeVisible()
  await page.getByRole('link', { name: '基础', exact: true }).click()
  await expect(page).toHaveURL(/\/manage\/basics$/)
  await expect(page.getByLabel('所属工作空间')).toHaveCount(0)
  const createLedger = page.getByRole('button', { name: '创建账本' })
  const picker = page.getByRole('combobox', { name: '标签', exact: true })
  await createLedger.click()
  await picker.fill('未保存')
  await picker.press('Enter')
  await page.keyboard.press('Escape')
  await createLedger.click()
  await page.getByLabel('账本名称').fill('家庭账本')
  await picker.fill('家庭标签')
  await picker.press('Enter')
  await page.getByRole('button', { name: '保存账本' }).click()
  const householdLedger = page.getByRole('link', {
    name: '家庭账本',
    exact: true,
  })
  await expect(householdLedger).toBeVisible()
  const householdLedgerUrl = (await householdLedger.getAttribute('href'))!

  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '激活工作空间' }).click()
  await expect(page.getByText('个人 · 当前工作空间')).toBeVisible()
  await page.reload()
  await expect(page.getByText('个人 · 当前工作空间')).toBeVisible()
  await expect(page.getByText(/· 当前工作空间/)).toHaveCount(1)
  await page.getByRole('link', { name: '基础', exact: true }).click()
  await expect(page.getByText('此工作空间还没有账本。')).toBeVisible()
  await page.goto(householdLedgerUrl)
  await expect(page.getByRole('heading', { name: '账本不可用' })).toBeVisible()

  await page.goto('/manage/tags')
  await expect(page).toHaveURL(/\/manage\/basics$/)
  await expect(page.getByRole('region', { name: '账本' })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(1)
  const tagSection = page.getByRole('region', { name: '标签' })
  const category = tagSection.getByLabel('标签分类')
  await expect(category.getByRole('option', { name: '工作空间' })).toHaveCount(
    0,
  )
  await expect(tagSection.getByText('未保存', { exact: true })).toHaveCount(0)
  await page.getByLabel('搜索标签').fill('家庭')
  await category.selectOption({ label: '交易' })
  await expect(tagSection.getByText('没有匹配的标签。')).toBeVisible()
  await category.selectOption({ label: '账本' })
  await expect(page.getByLabel('搜索标签')).toHaveValue('家庭')
  await page.clock.install()
  await page.getByRole('button', { name: '删除标签 家庭标签' }).click()
  const warning = page.getByRole('alertdialog', { name: '删除标签' })
  const confirm = warning.getByRole('button', { name: '长按以确认删除标签' })
  await confirm.focus()
  await page.keyboard.down('Space')
  await page.clock.runFor(3000)
  await page.keyboard.up('Space')
  await expect(warning).toBeVisible()
  await page.keyboard.down('Space')
  await page.clock.runFor(5000)
  await page.keyboard.up('Space')
  await expect(page.getByText('没有匹配的标签。')).toBeVisible()

  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '激活工作空间' }).click()
  await expect(page.getByText('家庭 · 当前工作空间')).toBeVisible()
  await page.getByRole('link', { name: '基础', exact: true }).click()
  await expect(householdLedger).toBeVisible()
})

test('combines readable ledgers and only offers writable ledgers in transaction creation', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('显示名称').fill('小林')
  await page.getByLabel('设备名称').fill('测试设备')
  await page.getByRole('button', { name: '完成登记' }).click()
  await expect(page).toHaveURL(/\/manage\/transactions$/)
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '创建工作空间' }).click()
  await page.getByLabel('空间名称').fill('家用')
  await page.getByRole('button', { name: '保存工作空间' }).click()
  await page.getByRole('link', { name: '基础', exact: true }).click()

  const ledgerList = page.url()
  for (const name of ['日常', '旅行', '归档', '只读']) {
    await page.getByRole('button', { name: '创建账本', exact: true }).click()
    await page.getByLabel('账本名称').fill(name)
    await page.getByRole('button', { name: '保存账本' }).click()
    await page.getByRole('link', { name, exact: true }).click()
    await page.getByRole('button', { name: '创建账户', exact: true }).click()
    await page.getByLabel('账户名称').fill(`${name}账户`)
    await page.getByRole('button', { name: '保存账户' }).click()
    await expect(page.getByText(`${name}账户`, { exact: true })).toBeVisible()
    await page.goto(ledgerList)
  }

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('ks-finance')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction(['ledgers', 'ledger_members'], 'readwrite')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error)
        }
        const ledgers = tx.objectStore('ledgers')
        const members = tx.objectStore('ledger_members')
        const rows = ledgers.getAll()
        rows.onsuccess = () => {
          for (const ledger of rows.result) {
            if (ledger.name === '归档')
              ledgers.put({ ...ledger, status: 'archived' })
            if (ledger.name === '只读') {
              const member = members.get([ledger.id, ledger.owner_user_id])
              member.onsuccess = () => {
                members.put({ ...member.result, role: 'Viewer' })
              }
            }
          }
        }
      }
    })
  })
  await page.goto('/manage/transactions')

  const create = page.getByRole('button', { name: '新建交易' })
  await create.click()
  const dialog = page.getByRole('dialog', { name: '新建交易' })
  const ledger = dialog.getByLabel('账本')
  await expect(ledger.locator('option')).toHaveCount(3)
  await expect(ledger.locator('option', { hasText: /归档|只读/ })).toHaveCount(
    0,
  )
  await ledger.selectOption({ label: '家用 · 日常' })
  await dialog.getByLabel('分录账户').selectOption({ label: '日常账户 · CNY' })
  await dialog.getByLabel('交易描述').fill('切换时保留描述')
  await dialog.getByLabel('金额（CNY）').fill('15')
  await ledger.selectOption({ label: '家用 · 旅行' })
  await expect(dialog.getByLabel('分录账户')).toHaveValue('')
  await expect(dialog.getByLabel('金额')).toHaveValue('')
  await expect(dialog.getByLabel('交易描述')).toHaveValue('切换时保留描述')
  await expect(
    dialog.getByLabel('分录账户').locator('option', { hasText: '日常账户' }),
  ).toHaveCount(0)

  for (const name of ['旅行', '日常']) {
    await ledger.selectOption({ label: `家用 · ${name}` })
    await dialog.getByLabel('交易描述').fill(`${name}交易`)
    await dialog
      .getByLabel('分录账户')
      .selectOption({ label: `${name}账户 · CNY` })
    await dialog.getByLabel('金额（CNY）').fill('10')
    await dialog.getByRole('button', { name: '入账', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: `${name}交易` }),
    ).toBeVisible()
    await page.getByRole('link', { name: '返回交易列表' }).click()
    if (name === '旅行') await create.click()
  }

  const transactions = page.getByRole('list', { name: '交易列表' })
  await expect(transactions.getByRole('link')).toHaveCount(2)
  for (const name of ['旅行', '日常']) {
    await expect(
      transactions.getByRole('link', {
        name: new RegExp(`${name}交易.*家用 · ${name}`),
      }),
    ).toBeVisible()
  }

  await page.getByRole('button', { name: '筛选', exact: true }).click()
  const filter = page.getByRole('dialog', { name: '筛选交易' })
  await expect(
    filter.getByLabel('账本').locator('option', { hasText: /只读|归档/ }),
  ).toHaveCount(2)
  await filter.getByLabel('账本').selectOption({ label: '家用 · 日常' })
  await filter.getByLabel('账户').selectOption({ label: '日常账户' })
  await filter.getByLabel('账本').selectOption({ label: '家用 · 旅行' })
  await expect(filter.getByLabel('账户')).toHaveValue('')
  await filter.getByRole('button', { name: '应用筛选' }).click()
  await expect(transactions.getByRole('link')).toHaveCount(1)
  await expect(
    transactions.getByRole('link', { name: /旅行交易/ }),
  ).toBeVisible()

  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '创建工作空间' }).click()
  await page.getByLabel('空间名称').fill('个人')
  await page.getByRole('button', { name: '保存工作空间' }).click()
  await page.getByRole('button', { name: '激活工作空间' }).click()
  await expect(page.getByText('个人 · 当前工作空间')).toBeVisible()
  await page.getByRole('link', { name: '交易', exact: true }).click()
  await expect(page.getByText('还没有交易。')).toBeVisible()
  await expect(transactions.getByRole('link')).toHaveCount(0)
  await expect(create).toHaveCount(0)
})
