import { expect, test } from '@playwright/test';

// 🎭 Unmaiyaana Chrome la full flow: sign up → board → task → live sync → Ctrl+K → Tamil

let counter = 0;
const newEmail = () => `e2e${Date.now()}${counter++}@test.local`;
const PASSWORD = 'e2e-password-123';

// 👤 Sign in page la puthu account
async function signUpInUi(page, name) {
  const email = newEmail();
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

test('sign up, add and edit a task, move it, and it is still there after reload', async ({ page }) => {
  await signUpInUi(page, 'Eva Tester');
  await expect(page.getByRole('heading', { name: "Eva's workspace" })).toBeVisible();
  await expect(page.locator('[data-task-id]')).toHaveCount(5); // starter tasks

  await page.getByLabel('New task').fill('Buy flowers');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(card(page, 'Buy flowers')).toBeVisible();

  await card(page, 'Buy flowers').getByRole('button', { name: 'Buy flowers', exact: true }).click();
  await page.getByLabel('Title').fill('Buy red flowers');
  await page.getByRole('button', { name: 'urgent' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Buy red flowers')).toContainText('urgent');

  // 🖱️ Desktop la drag & drop (arrows phone la mattum theriyum)
  await card(page, 'Buy red flowers').dragTo(page.locator('[data-column="doing"]'));
  await expect(page.locator('[data-column="doing"]')).toContainText('Buy red flowers');

  await page.reload();
  await expect(page.locator('[data-column="doing"]')).toContainText('Buy red flowers');
});

test('a teammate sees new tasks live, without reloading', async ({ browser }) => {
  const anu = await browser.newContext();
  const bala = await browser.newContext();
  const anuPage = await anu.newPage();
  const balaPage = await bala.newPage();

  await signUpInUi(anuPage, 'Anu Live');
  const balaEmail = await signUpInUi(balaPage, 'Bala Live');

  // Anu board create panni Bala ah invite (API vazhiya, Anu oda cookies la)
  const board = await (await anuPage.request.post('/api/boards', { data: { name: 'Live board' } })).json();
  expect((await anuPage.request.post(`/api/boards/${board.id}/members`, { data: { email: balaEmail } })).ok()).toBe(true);

  await balaPage.goto(`/app?board=${board.id}`);
  await expect(balaPage.locator('#board-select')).toHaveValue(board.id);
  await expect(balaPage.getByText('Live', { exact: true })).toBeVisible();

  await anuPage.request.post('/api/tasks', { data: { boardId: board.id, title: 'Appears by magic' } });
  await expect(card(balaPage, 'Appears by magic')).toBeVisible(); // reload illaama!

  // Bala ku "shared" notification
  await balaPage.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
  await expect(balaPage.getByText('Anu Live shared the board "Live board" with you')).toBeVisible();

  await anu.close();
  await bala.close();
});

test('Ctrl + K finds a task on another board and opens it', async ({ page }) => {
  await signUpInUi(page, 'Kay Search');
  const board = await (await page.request.post('/api/boards', { data: { name: 'Hidden board' } })).json();
  await page.request.post('/api/tasks', { data: { boardId: board.id, title: 'Find the needle' } });

  await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search' }).fill('needle');
  await expect(page.getByRole('option', { name: /Find the needle/ })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByLabel('Title')).toHaveValue('Find the needle');
});

test('the home page switches to Tamil and remembers it', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('ta');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('திட்ட மேலாண்மை');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('திட்ட மேலாண்மை');
});

test('works offline: add and rename a task, then it syncs when back online', async ({ page, context }) => {
  await signUpInUi(page, 'Ola Offline');
  await expect(page.locator('[data-task-id]')).toHaveCount(5);
  // popup files background la download aagattum (live connection eppovum open, adhanaala networkidle varaadhu)
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('TaskModal')));

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByLabel('New task').fill('Written on the train');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(card(page, 'Written on the train')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toContainText('1 waiting');

  // offline la create panna task ah offline laye rename (temporary id → apram remap)
  await card(page, 'Written on the train').getByRole('button', { name: 'Written on the train', exact: true }).click();
  await page.getByLabel('Title').fill('Written on the train (edited)');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toContainText('2 waiting');

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Synced 2 offline change(s)')).toBeVisible();

  await page.reload(); // server la unmaiyaave irukkaa?
  await expect(card(page, 'Written on the train (edited)')).toBeVisible();
  await expect(page.locator('[data-task-id]')).toHaveCount(6);
});
