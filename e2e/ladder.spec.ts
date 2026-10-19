import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('text=梯形图编辑器')
  // 首次启动（本地没有工程）会弹出引导页；引导页用例自己验证它。
  if (test.info().title.includes('引导页')) return
  const welcome = page.getByTestId('welcome')
  // 引导页在读取本地工程之后才出现，先等一小会儿再判断。
  await welcome.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {})
  if (await welcome.isVisible().catch(() => false)) {
    await page.getByTestId('welcome-sample-motor').click()
    await expect(welcome).toHaveCount(0)
  }
})

test('编辑、撤销与内联操作数编辑', async ({ page }) => {
  const elements = page.locator('.ladder-element')
  const before = await elements.count()

  await page.getByTitle('插入常开触点').click()
  await expect(elements).toHaveCount(before + 1)

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(elements).toHaveCount(before)

  const firstContact = page.locator('.contact-box').first()
  await firstContact.dblclick()
  const input = page.locator('input[placeholder*="输入标签"]').first()
  await input.fill('Stop')
  await input.press('Enter')
  await expect(page.locator('.operand-label', { hasText: 'Stop' }).first()).toBeVisible()
})

test('电机启停仿真：编译、运行、强制输入', async ({ page }) => {
  await page.getByTitle('编译工程并下载到仿真器').click()
  await page.getByTitle('启动扫描').click()
  await page.getByRole('button', { name: 'I/O 面板' }).click()

  const startRow = page.getByRole('row', { name: /Start/ })
  await startRow.getByRole('button', { name: '翻转' }).click()

  const motorRow = page.getByRole('row', { name: /Motor/ })
  await expect(motorRow).toContainText('TRUE')
  expect(await page.locator('.ladder-wire.on').count()).toBeGreaterThan(0)

  const stopRow = page.getByRole('row', { name: /Stop/ })
  await stopRow.getByRole('button', { name: '翻转' }).click()
  await expect(motorRow).toContainText('FALSE')
})

test('插入定时器、编译并显示运行状态', async ({ page }) => {
  await page.getByTitle('插入接通延时定时器').click()
  await expect(page.locator('.box-element').first()).toBeVisible()
  await expect(page.locator('.box-element').first()).toContainText('T#1s')
  await page.getByTitle('编译工程并下载到仿真器').click()
  await expect(page.getByText('存在编译错误')).toHaveCount(0)
  await page.getByTitle('启动扫描').click()
  await page.waitForTimeout(300)
  await expect(page.locator('.box-element').first()).toContainText('ET')
  await expect(page.locator('.box-element').first()).toContainText('Q')
})

test('从指令目录拖放到画布', async ({ page }) => {
  await page.getByRole('button', { name: '指令' }).click()
  const paletteItem = page.getByRole('button', { name: /常开触点/ }).first()
  await paletteItem.dragTo(page.locator('.ladder-scene'))
  await expect(page.locator('.contact-box')).toHaveCount(4)
})

test('新建 FB、编辑接口并插入调用', async ({ page }) => {
  await page.getByTitle('新增 FB').click()
  await page.getByRole('button', { name: '块接口' }).click()
  await expect(page.getByText('输入 (Input)')).toBeVisible()
  await page.getByRole('button', { name: '新增', exact: true }).first().click()
  await expect(page.getByTestId('interface-var-name').first()).toHaveValue('Var1')

  await page.getByRole('button', { name: /Main \(OB1\)/ }).click()
  await page.getByRole('button', { name: '梯形图' }).click()
  await page.getByTitle('插入 FC/FB 调用').click()
  await page.getByRole('button', { name: '插入', exact: true }).click()
  await expect(page.locator('.box-element')).toHaveCount(1)
})

test('新建数据块并添加字段', async ({ page }) => {
  await page.getByTitle('新增数据块').click()
  await page.getByRole('button', { name: '数据块', exact: true }).click()
  await page.getByRole('button', { name: '新增字段' }).click()
  await expect(page.getByTestId('db-field-name').first()).toHaveValue('Field1')
  await page.getByTitle('编译工程并下载到仿真器').click()
  await expect(page.getByText('存在编译错误')).toHaveCount(0)
})

test('载入水箱 FB 示例并仿真模拟量', async ({ page }) => {
  await page.locator('header select').first().selectOption('tank')
  await page.getByTitle('编译工程并下载到仿真器').click()
  await page.getByTitle('启动扫描').click()
  await page.getByRole('button', { name: 'I/O 面板' }).click()

  const enableRow = page.getByRole('row', { name: /Enable/ })
  await enableRow.getByRole('button', { name: '翻转' }).click()

  const levelRow = page.getByRole('row', { name: /Level/ })
  await levelRow.getByRole('textbox').fill('30')
  await levelRow.getByRole('button', { name: '写入' }).click()
  await expect(page.getByRole('row', { name: /Pump/ })).toContainText('TRUE')
  await expect(page.getByRole('row', { name: /Valve/ })).toContainText('FALSE')

  await levelRow.getByRole('textbox').fill('70')
  await levelRow.getByRole('button', { name: '写入' }).click()
  await expect(page.getByRole('row', { name: /Pump/ })).toContainText('FALSE')
  await expect(page.getByRole('row', { name: /Valve/ })).toContainText('TRUE')
})

test('数据块支持结构体字段', async ({ page }) => {
  await page.getByTitle('新增数据块').click()
  await page.getByRole('button', { name: '数据块', exact: true }).click()
  await page.getByRole('button', { name: '新增字段' }).click()
  const row = page.getByTestId('db-field-name').first().locator('xpath=ancestor::tr')
  await row.locator('select').first().selectOption('STRUCT')
  await page.getByRole('button', { name: /编辑结构/ }).click()
  await page.getByRole('button', { name: '新增子字段' }).click()
  await expect(page.getByTestId('struct-field-name').first()).toHaveValue('Field1')
  await page.getByRole('button', { name: '完成' }).click()
  await page.getByTitle('编译工程并下载到仿真器').click()
  await expect(page.getByText('存在编译错误')).toHaveCount(0)
})

test('实例监视显示 FB 实例变量在线值', async ({ page }) => {
  await page.locator('header select').first().selectOption('tank')
  await page.getByRole('button', { name: /TankCtrl \(FB2\)/ }).click()
  await page.getByRole('button', { name: '实例监视' }).click()
  await expect(page.getByText(/\d+ 个实例 · \d+ 个字段/)).toBeVisible()
  await expect(page.getByRole('row', { name: /TankCtrl_DB \(DB1\)/ }).first()).toBeVisible()

  await page.getByTitle('编译工程并下载到仿真器').click()
  await page.getByTitle('启动扫描').click()
  await page.getByRole('button', { name: 'I/O 面板' }).click()
  await page.getByRole('row', { name: /Enable/ }).getByRole('button', { name: '翻转' }).click()
  const levelRow = page.getByRole('row', { name: /Level/ })
  await levelRow.getByRole('textbox').fill('30')
  await levelRow.getByRole('button', { name: '写入' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '实例监视' }).click()
  await expect(page.getByRole('row', { name: /TankCtrl_DB"\.Pump BOOL/ })).toContainText('TRUE')
})

test('PLC 数据类型：新建 UDT、在数据块中引用并编译', async ({ page }) => {
  await page.getByRole('button', { name: '数据类型', exact: true }).click()
  await page.getByTitle('新建 PLC 数据类型').click()
  await expect(page.getByTestId('udt-name').first()).toHaveValue('Type_1')

  // 新建的 UDT 为空，添加两个字段。
  await page.getByRole('button', { name: '新增子字段' }).click()
  await expect(page.getByTestId('struct-field-name')).toHaveCount(1)
  await page.getByRole('button', { name: '新增子字段' }).click()
  await expect(page.getByTestId('struct-field-name')).toHaveCount(2)

  // 在数据块里按名称引用该 UDT。
  await page.getByTitle('新增数据块').click()
  await page.getByRole('button', { name: '数据块', exact: true }).click()
  await page.getByRole('button', { name: '新增字段' }).click()
  const row = page.getByTestId('db-field-name').first().locator('xpath=ancestor::tr')
  await row.locator('select').first().selectOption({ label: 'Type_1' })
  await expect(row).toContainText('编辑类型 Type_1')

  await page.getByTitle('编译工程并下载到仿真器').click()
  await expect(page.getByText('存在编译错误')).toHaveCount(0)
})

test('水箱示例使用 UDT：数据类型面板与实例监视可见 UDT 字段', async ({ page }) => {
  await page.locator('header select').first().selectOption('tank')
  await page.getByRole('button', { name: '数据类型', exact: true }).click()
  await expect(page.getByTestId('udt-name').first()).toHaveValue('TankInfo')
  await expect(page.getByTestId('struct-field-name').first()).toHaveValue('Level')
  await expect(page.getByText(/被引用 \d+ 处/)).toBeVisible()

  await page.getByRole('button', { name: /TankCtrl \(FB2\)/ }).click()
  await page.getByRole('button', { name: '实例监视' }).click()
  await expect(page.getByRole('row', { name: /TankCtrl_DB.*Snapshot\.Level/ })).toBeVisible()

  await page.getByTitle('编译工程并下载到仿真器').click()
  await expect(page.getByText('存在编译错误')).toHaveCount(0)
})

test('右键菜单：插入、切换类型与删除', async ({ page }) => {
  const contacts = page.locator('.contact-box')
  await expect(contacts).toHaveCount(3)

  // 在第一个触点上右键：切换为常闭触点。
  await contacts.first().click({ button: 'right' })
  await expect(page.getByTestId('element-context-menu')).toBeVisible()
  await page.getByRole('button', { name: '切换为常闭触点' }).click()
  await expect(page.locator('.contact-box').first()).toHaveClass(/contact-box/)

  // 在其后插入一个线圈，元素数量 +1。
  const before = await page.locator('.ladder-element').count()
  await page.locator('.contact-box').first().click({ button: 'right' })
  await page.getByRole('button', { name: '在其后插入线圈' }).click()
  await expect(page.locator('.ladder-element')).toHaveCount(before + 1)

  // 删除刚插入的元素。
  await page.locator('.coil-box').last().click({ button: 'right' })
  await page.getByTestId('element-context-menu').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.ladder-element')).toHaveCount(before)
})

test('插入模式：横幅提示与 Esc 取消', async ({ page }) => {
  await page.getByRole('button', { name: '指令' }).click()
  await page.getByRole('button', { name: /常开触点/ }).first().click()
  const banner = page.getByTestId('insert-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('正在放置')

  await page.keyboard.press('Escape')
  await expect(banner).toHaveCount(0)
  // Esc 取消后点击画布不应插入元素。
  const before = await page.locator('.ladder-element').count()
  await page.locator('.ladder-scene').click({ position: { x: 200, y: 120 } })
  await expect(page.locator('.ladder-element')).toHaveCount(before)
})

test('诊断面板：计数、筛选与工程级诊断', async ({ page }) => {
  // 造一个编译错误：两个同名标签。
  await page.getByRole('button', { name: '变量表', exact: true }).click()
  await page.getByRole('button', { name: '新增变量' }).click()
  await page.getByRole('button', { name: '新增变量' }).click()
  const secondName = page.locator('table tbody tr').nth(1).locator('input').first()
  await secondName.fill('Start')
  await secondName.press('Tab')

  await page.getByTitle('编译工程并下载到仿真器').click()

  // 编译失败时诊断面板自动切到前台，并显示错误计数。
  await expect(page.getByRole('button', { name: '仅错误' })).toBeVisible()
  await expect(page.getByText('错误 1')).toBeVisible()
  // 重名是工程级诊断，没有可跳转的位置。
  await expect(page.getByText('工程级').first()).toBeVisible()

  await page.getByRole('button', { name: '仅警告' }).click()
  await expect(page.getByText('当前筛选下没有诊断。')).toBeVisible()
  await page.getByRole('button', { name: '全部' }).click()
  await expect(page.getByText('工程级').first()).toBeVisible()
})

test('快捷键：Ctrl+S 保存、Ctrl+X 剪切', async ({ page }) => {
  await page.locator('header input').first().click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('快捷键工程')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('toast').filter({ hasText: '已保存' })).toBeVisible()

  const before = await page.locator('.ladder-element').count()
  await page.locator('.contact-box').first().click()
  await page.keyboard.press('ControlOrMeta+x')
  await expect(page.locator('.ladder-element')).toHaveCount(before - 1)
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.locator('.ladder-element')).toHaveCount(before)
})

test('运行时修改工程会提示重新编译', async ({ page }) => {
  await page.getByTitle('编译工程并下载到仿真器').click()
  await page.getByTitle('启动扫描').click()
  await expect(page.getByTestId('resync-badge')).toHaveCount(0)

  // 运行中改结构：出现醒目的“需重新编译”提示。
  await page.getByTitle('插入常开触点').click()
  const banner = page.getByTestId('resync-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('需重新编译')

  await banner.click()
  await expect(page.getByTestId('toast').filter({ hasText: '编译通过' })).toBeVisible()
  await expect(page.getByTestId('resync-banner')).toHaveCount(0)
})

test('拖动元素重新排序', async ({ page }) => {
  const labels = () => page.locator('.operand-label').allInnerTexts()
  expect(await labels()).toEqual(['Start', 'Motor', 'Stop', 'Motor'])

  // 把线圈拖到停止触点的左半边 = 插到它前面。
  await page.locator('.coil-box').first().dragTo(page.locator('.contact-box').nth(2), { targetPosition: { x: 6, y: 12 } })
  await expect
    .poll(labels)
    .toEqual(['Start', 'Motor', 'Motor', 'Stop'])
  // 元素总数不变（移动而非复制）。
  await expect(page.locator('.ladder-element')).toHaveCount(4)
})

test('引导页：首次启动选择示例或新建空白工程', async ({ page }) => {
  await expect(page.getByTestId('welcome')).toBeVisible()
  await expect(page.getByTestId('welcome-sample-traffic')).toBeVisible()

  await page.getByRole('button', { name: /新建空白工程/ }).click()
  await expect(page.getByTestId('welcome')).toHaveCount(0)
  await expect(page.locator('header input').first()).toHaveValue('新建工程')
  await expect(page.locator('.ladder-element')).toHaveCount(1)
})

test('交通灯示例：相位按定时器循环推进', async ({ page }) => {
  await page.getByTestId('sample-select').selectOption('traffic')
  await page.getByTitle('编译工程并下载到仿真器').click()
  await page.getByTestId('speed').selectOption('10')
  await page.getByTitle('启动扫描').click()
  await page.getByRole('button', { name: 'I/O 面板' }).click()
  await page.getByRole('row', { name: /Run/ }).getByRole('button', { name: '翻转' }).click()

  // 相位 0 = 红灯；随后定时器脉冲推进到相位 1、2。
  await expect(page.getByRole('row', { name: /Red/ })).toContainText('TRUE', { timeout: 5000 })
  await expect(page.getByRole('row', { name: /Yellow/ })).toContainText('TRUE', { timeout: 5000 })
  await expect(page.getByRole('row', { name: /Green/ })).toContainText('TRUE', { timeout: 5000 })
})

test('传送带示例：上升沿计数到 5 触发满箱指示', async ({ page }) => {
  await page.getByTestId('sample-select').selectOption('conveyor')
  await page.getByTitle('编译工程并下载到仿真器').click()
  await page.getByTitle('启动扫描').click()
  await page.getByRole('button', { name: 'I/O 面板' }).click()

  await page.getByRole('row', { name: /Start/ }).getByRole('button', { name: '翻转' }).click()
  await expect(page.getByRole('row', { name: /Motor/ })).toContainText('TRUE')

  const sensor = page.getByRole('row', { name: /Sensor/ }).getByRole('button', { name: '翻转' })
  for (let index = 0; index < 5; index += 1) {
    await sensor.click()
    await page.waitForTimeout(80)
    await sensor.click()
    await page.waitForTimeout(80)
  }
  await expect(page.getByRole('row', { name: /Full/ })).toContainText('TRUE', { timeout: 5000 })
})

test('工程自动保存并在刷新后恢复', async ({ page }) => {
  const name = `回归测试-${Date.now()}`
  const nameInput = page.locator('header input').first()
  await nameInput.fill(name)
  await page.waitForTimeout(1200)
  await page.reload()
  await page.waitForSelector('text=梯形图编辑器')
  await expect(page.locator('header input').first()).toHaveValue(name)
})
