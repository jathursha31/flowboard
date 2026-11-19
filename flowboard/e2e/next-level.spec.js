import { expect, test } from '@playwright/test';

// 🎭 Pudhu features unmaiyaana Chrome la: team chat, AI assistant, themes, templates, labels, timer, reports, shortcuts

let counter = 0;
const PASSWORD = 'e2e-password-123';

async function signUpInUi(page, name) {
  const email = `e2e-next${Date.now()}${counter++}@test.local`;
  await page.goto('/signin');
  await page.getByRole('button', { name: 'No account? Sign up' }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  return email;
}

const card = (page, title) => page.locator('[data-task-id]').filter({ hasText: title });

test('team chat: a message and an @mention arrive live for a teammate', async ({ browser }) => {
  const anuPage = await (await browser.newContext()).newPage();
  const balaPage = await (await browser.newContext()).newPage();
  await signUpInUi(anuPage, 'Anu Chat');
  const balaEmail = await signUpInUi(balaPage, 'Bala Chat');

  const board = await (await anuPage.request.post('/api/boards', { data: { name: 'Chat board' } })).json();
  expect((await anuPage.request.post(`/api/boards/${board.id}/members`, { data: { email: balaEmail } })).ok()).toBe(true);
  await anuPage.goto(`/app?board=${board.id}`);
  await balaPage.goto(`/app?board=${board.id}`);
  await expect(balaPage.getByText('Live')).toBeVisible();

  await anuPage.getByRole('button', { name: '💬 Chat' }).click();
  await anuPage.getByLabel(/Message the team/).fill('Hello @Bala, logo ready?');
  await anuPage.getByLabel(/Message the team/).press('Enter');
  await expect(anuPage.locator('.chat__msg.is-mine')).toContainText('logo ready?');

  // Bala: chat moodi irukku → badge, thirandhaa message
  await expect(balaPage.locator('.chip__badge')).toHaveText('1');
  await balaPage.getByRole('button', { name: /💬 Chat/ }).click();
  await expect(balaPage.locator('.chat__msg')).toContainText('Hello @Bala');
  await expect(balaPage.locator('mark.mention')).toHaveText('@Bala');
});

test('AI assistant answers about overdue tasks and opens the task', async ({ page }) => {
  await signUpInUi(page, 'Ada Assistant');
  const boards = await (await page.request.get('/api/boards')).json();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  await page.request.post('/api/tasks', { data: { boardId: boards[0].id, title: 'Late essay', dueDate: yesterday } });
  await page.reload();

  await page.getByRole('button', { name: '🤖 Ask AI' }).click();
  await page.getByRole('button', { name: 'What is overdue?' }).click();
  await expect(page.locator('.assistant-panel')).toContainText('overdue');
  await page.locator('.assistant-panel').getByRole('button', { name: 'Late essay' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Late essay');
});

test('templates, custom labels, timer, reports and shortcuts', async ({ page }) => {
  await signUpInUi(page, 'Tia Templates');

  // 🗂️ Template
  await page.getByRole('button', { name: '🗂️ Templates' }).click();
  await page.getByRole('button', { name: /Exam prep/ }).click();
  await expect(page.locator('[data-column="topics"]')).toContainText('Algebra and equations');
  await expect(card(page, 'Algebra and equations')).toContainText('maths');

  // 🏷️ Custom label
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByLabel('New label name').fill('Mock test');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).nth(1).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await card(page, 'Past paper 1 (timed)').getByRole('button', { name: 'Past paper 1 (timed)', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mock test' }).click();

  // ⏱️ Timer
  await page.getByRole('button', { name: /Start timer/ }).click();
  await expect(page.getByText(/Timer running/)).toBeVisible();
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Past paper 1 (timed)')).toContainText('Mock test');
  await expect(card(page, 'Past paper 1 (timed)')).toContainText('⏱️');

  // ⌨️ Shortcuts
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('?');
  await expect(page.getByRole('heading', { name: '⌨️ Keyboard shortcuts' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // 📊 Reports
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: '📊 Reports' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Exam prep');
  await page.getByRole('button', { name: '30 days' }).click();
  await expect(page.locator('.report-chart__day')).toHaveCount(30);
});

test('appearance: midnight mode and accent colour stick after reload', async ({ page }) => {
  await signUpInUi(page, 'Theo Theme');
  await page.goto('/account');
  await page.getByRole('button', { name: /Midnight/ }).click();
  await page.getByRole('button', { name: 'Forest' }).click();
  await page.reload();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('data-midnight', '');
  await expect(html).toHaveAttribute('data-accent', 'forest');
});
