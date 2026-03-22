import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('dialog', async (dialog) => {
    console.log(`Dialog: ${dialog.type()} ${dialog.message()}`);
    await dialog.dismiss().catch(() => {});
  });

  // 1) Open properties page
  await page.goto(`${BASE_URL}/properties`, { waitUntil: 'networkidle' });

  // 2) Open dialog
  await page.getByRole('button', { name: /新增物業/ }).first().click();

  // 3) Fill basic fields (ids exist via htmlFor)
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('物業名稱 *').fill(`自動建房測試_${Date.now()}`);
  await dialog.getByLabel('地址 *').fill('台北市測試路 1 號');
  await dialog.getByLabel('總樓層數 *').fill('2');
  await dialog.getByLabel('房東姓名 *').fill('測試房東');
  await dialog.getByLabel('房東電話 *').fill('0912-000-000');
  await dialog.getByLabel('預付週期（月）').fill('1');

  // 4) Ensure floor config fields appear
  await dialog.getByText('自動建立房間（每層設定）').waitFor({ timeout: 15000 });
  await dialog.getByText('1F').waitFor({ timeout: 15000 });
  await dialog.getByText('2F').waitFor({ timeout: 15000 });

  // Scroll within dialog to reveal floor config cards
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(150);
  }

  // Screenshot: form with floor configs visible
  await page.screenshot({ path: 'screenshots/property-form.png', fullPage: true });

  // 5) Submit (will create property then loop-create rooms then redirect)
  await dialog.getByRole('button', { name: /^新增物業$/ }).click();

  // Wait for redirect to property detail
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/i, { timeout: 180000 });
  await page.waitForLoadState('networkidle', { timeout: 180000 });
  await page.getByText('101').first().waitFor({ timeout: 180000 });

  // Screenshot: property detail page with room list
  await page.screenshot({ path: 'screenshots/property-detail.png', fullPage: true });

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

