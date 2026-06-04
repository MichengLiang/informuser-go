import { expect, type APIRequestContext, test } from '@playwright/test';

const longToken =
  'https://example.local/' +
  'agent-output/'.repeat(8) +
  'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(6);

const markdown = `# Review request

This paragraph contains an intentionally long unbroken token that must not push
the page outside the viewport: ${longToken}

| Column A | Column B | Column C | Column D | Column E |
| --- | --- | --- | --- | --- |
| ${longToken} | wide value | wide value | wide value | wide value |

\`\`\`text
${'very_long_generated_identifier_'.repeat(16)}
\`\`\`
`;

async function createTask(request: APIRequestContext) {
  const response = await request.post('/api/tasks', {
    data: {
      task_id: 'task-playwright-1',
      session_id: 'session-playwright-1',
      abstract: 'Wide Markdown review',
      content: markdown,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function createE2ETask(
  request: APIRequestContext,
  taskId: string,
  sessionId: string,
  title: string,
  content: string,
) {
  const response = await request.post('/api/tasks', {
    data: {
      task_id: taskId,
      session_id: sessionId,
      abstract: title,
      content,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function completeE2ETask(request: APIRequestContext, taskId: string, reply: string) {
  const response = await request.post(`/api/tasks/${taskId}/reply`, {
    data: {
      user_input: reply,
      reply_source: 'playwright',
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function renameE2ESession(
  request: APIRequestContext,
  sessionId: string,
  displayName: string,
): Promise<{ auto_name: string }> {
  const response = await request.patch(`/api/sessions/${sessionId}`, {
    data: { display_name: displayName },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function archiveE2ETasks(request: APIRequestContext, taskIds: string[]) {
  const response = await request.post('/api/history/archive', {
    data: { task_ids: taskIds },
  });
  expect(response.ok()).toBeTruthy();
}

test('renders wide Markdown, opens reply mode, and shows completed user reply history', async ({
  page,
  request,
  context,
}) => {
  await createTask(request);
  await page.goto('/');
  await expect(page).toHaveTitle('AskUser Popup');

  await expect(page.getByRole('button', { name: /Wide Markdown review/ })).toBeVisible();
  await expect(page.locator('.markdown-reader')).toContainText('Review request');
  await expect(page.locator('.reply-panel')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = document.querySelector('.task-panel');
        const list = document.querySelector('.task-list-scroll');
        if (!panel || !list) {
          return false;
        }
        const panelStyle = window.getComputedStyle(panel);
        const listStyle = window.getComputedStyle(list);
        return (
          panelStyle.overflowY === 'hidden' &&
          panel.scrollHeight <= panel.clientHeight &&
          (listStyle.overflowY === 'auto' || listStyle.overflowY === 'scroll')
        );
      }),
    )
    .toBeTruthy();

  const hasNoPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth,
  );
  expect(hasNoPageOverflow).toBeTruthy();

  await page.getByRole('button', { name: /Reading/i }).click();
  await page.locator('.settings-popover input[type="range"]').fill('20');
  await expect(page.locator('.markdown-reader')).toHaveCSS('font-size', '20px');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: /Copy Markdown/i }).click();
  await expect(page.getByRole('button', { name: /Copied/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);

  await page.getByRole('button', { name: /^Reply$/ }).click();
  await expect(page.locator('.workspace')).toHaveClass(/reply-mode/);
  await expect(page.locator('.reply-panel')).toBeVisible();
  await page.getByPlaceholder('Write a reply...').fill('Approved from Playwright');
  await page.getByRole('button', { name: /Submit reply/i }).click();

  await expect(page.getByRole('button', { name: /Wide Markdown review/ })).toHaveCount(0);
  const result = await request.get('/api/tasks/task-playwright-1/result');
  await expect(result).toBeOK();
  await expect(await result.json()).toMatchObject({
    status: 'found',
    user_input: 'Approved from Playwright',
  });

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByRole('button', { name: /Wide Markdown review/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'User reply' })).toBeVisible();
  await expect(page.locator('.history-reply-content')).toContainText('Approved from Playwright');
});

test('groups sessions and runs archive workflow in the browser', async ({
  page,
  request,
  context,
}) => {
  const longDisplayName =
    '春天特别长的会话名称用于验证窄面板不会遮挡按钮和自动名 ABCDEFGHIJKLMNOP';
  const renamedDisplayName = '春天 E2E 已重命名';
  await createE2ETask(
    request,
    'task-e2e-pending-long',
    'session-e2e-pending-long',
    'Pending from long session',
    '# Pending long session',
  );
  await createE2ETask(
    request,
    'task-e2e-history-spring',
    'session-e2e-history-spring',
    'History grouped spring',
    '# Spring history',
  );
  await completeE2ETask(request, 'task-e2e-history-spring', 'Spring reply');
  await createE2ETask(
    request,
    'task-e2e-history-duplicate',
    'session-e2e-history-duplicate',
    'History duplicate display name',
    '# Duplicate display history',
  );
  await completeE2ETask(request, 'task-e2e-history-duplicate', 'Duplicate display reply');
  await createE2ETask(
    request,
    'task-e2e-archived-winter',
    'session-e2e-archived-winter',
    'Archived winter task',
    '# Archived winter',
  );
  await completeE2ETask(request, 'task-e2e-archived-winter', 'Winter archived reply');
  await renameE2ESession(request, 'session-e2e-pending-long', longDisplayName);
  const springSession = await renameE2ESession(request, 'session-e2e-history-spring', '春天');
  await renameE2ESession(request, 'session-e2e-history-duplicate', '春天');
  await renameE2ESession(request, 'session-e2e-archived-winter', '冬天归档');
  await archiveE2ETasks(request, ['task-e2e-archived-winter']);

  await page.goto('/');
  await expect(page).toHaveTitle('AskUser Popup');

  const pendingGroup = page.locator('.task-group-row').filter({ hasText: longDisplayName });
  await expect(pendingGroup).toBeVisible();
  await expect(pendingGroup).toContainText(/S-[A-Z2-7]{5}/);
  await expect(page.getByRole('button', { name: /Pending from long session/ })).toBeVisible();

  await pendingGroup.getByRole('button', { name: 'Rename session' }).click();
  await page.getByLabel('Session display name').fill(renamedDisplayName);
  await page.keyboard.press('Enter');
  await expect(page.locator('.task-group-row').filter({ hasText: renamedDisplayName })).toBeVisible();

  await page.setViewportSize({ width: 640, height: 760 });
  const headerBoxes = await page.locator('.task-group-row').evaluateAll((rows) =>
    rows.map((row) => {
      const rowBox = row.getBoundingClientRect();
      return Array.from(row.querySelectorAll('button')).every((button) => {
        const box = button.getBoundingClientRect();
        return box.left >= rowBox.left && box.right <= rowBox.right && box.top >= rowBox.top;
      });
    }),
  );
  expect(headerBoxes.every(Boolean)).toBeTruthy();

  await page.getByRole('tab', { name: 'History' }).click();
  const springGroups = page.locator('.task-group-row').filter({ hasText: '春天' });
  await expect(springGroups).toHaveCount(2);
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /History duplicate display name/ })).toBeVisible();
  const historyHeaderBoxes = await springGroups.evaluateAll((rows) =>
    rows.map((row) => {
      const rowBox = row.getBoundingClientRect();
      return Array.from(row.querySelectorAll('button')).every((button) => {
        const box = button.getBoundingClientRect();
        return (
          box.left >= rowBox.left &&
          box.right <= rowBox.right &&
          box.top >= rowBox.top &&
          box.bottom <= rowBox.bottom
        );
      });
    }),
  );
  expect(historyHeaderBoxes.every(Boolean)).toBeTruthy();

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Select history item').first().check();
  await expect(page.getByRole('button', { name: 'Copy (1)' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Archive (1)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Copy (1)' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('<Assistant id="1">');

  await springGroups
    .filter({ hasText: springSession.auto_name })
    .getByRole('button', { name: 'Archive group 春天' })
    .click();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toHaveCount(0);

  await page.getByTitle('Open archived history').click();
  await expect(page.getByText('Archived History')).toBeVisible();
  await expect(page.getByRole('button', { name: /Archived winter task/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page
    .locator('.task-row')
    .filter({ has: page.getByRole('button', { name: /Archived winter task/ }) })
    .getByLabel('Select archived item')
    .check();
  await page.getByRole('button', { name: 'Restore (1)' }).click();
  await expect(page.getByRole('button', { name: /Archived winter task/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.getByRole('button', { name: /Archived winter task/ })).toBeVisible();
});
