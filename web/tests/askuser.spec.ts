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

test('renders wide Markdown, opens reply mode, and shows completed user reply history', async ({
  page,
  request,
}) => {
  await createTask(request);
  await page.goto('/');
  await expect(page).toHaveTitle('AskUser Popup');

  await expect(page.getByRole('button', { name: /Wide Markdown review/ })).toBeVisible();
  await expect(page.locator('.markdown-reader')).toContainText('Review request');
  await expect(page.locator('.reply-panel')).toHaveCount(0);

  const hasNoPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth,
  );
  expect(hasNoPageOverflow).toBeTruthy();

  await page.getByRole('button', { name: /Reading/i }).click();
  await page.locator('.settings-popover input[type="range"]').fill('20');
  await expect(page.locator('.markdown-reader')).toHaveCSS('font-size', '20px');

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
