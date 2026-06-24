import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

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

const asciidocLongCode = `${'very_long_asciidoc_generated_identifier_'.repeat(18)}end`;

const asciidocReaderSource = `= Title

This source should render through Asciidoctor.

* Reader list item

|===
| Reader table cell
|===

[source,text]
----
reader code block
----
`;

const secondAsciidocReaderSource = `= Second Title

This task should inherit the default AsciiDoc renderer.
`;

const asciidocOverflowSource = `= Overflow Title

|===
| Column A | Column B | Column C | Column D

| ${longToken}${longToken}
| ${longToken}${longToken}
| ${longToken}${longToken}
| ${longToken}${longToken}
|===

[source,text]
----
${asciidocLongCode}
----
`;

const markdownLongUrlSource = `# Markdown URL

${longToken}${longToken}${longToken}
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

async function expectGroupHeaderContentDoesNotOverlapControls(row: Locator) {
  const result = await row.evaluate((element) => {
    const rowBox = element.getBoundingClientRect();
    const name = element.querySelector('.task-group-name');
    const meta = element.querySelector('.task-group-meta');
    const end = element.querySelector('.task-group-end');
    if (!name || !meta || !end) {
      return { ok: false, reason: 'missing session name, metadata, or end controls' };
    }

    const nameBox = name.getBoundingClientRect();
    const metaBox = meta.getBoundingClientRect();
    const endBox = end.getBoundingClientRect();
    const epsilon = 1;
    const insideRow = (box: DOMRect) =>
      box.left + epsilon >= rowBox.left &&
      box.right <= rowBox.right + epsilon &&
      box.top + epsilon >= rowBox.top &&
      box.bottom <= rowBox.bottom + epsilon;

    return {
      ok:
        insideRow(nameBox) &&
        insideRow(metaBox) &&
        insideRow(endBox) &&
        nameBox.right <= endBox.left + epsilon &&
        metaBox.right <= endBox.left + epsilon,
      reason: JSON.stringify({
        row: rowBox.toJSON(),
        name: nameBox.toJSON(),
        meta: metaBox.toJSON(),
        end: endBox.toJSON(),
      }),
    };
  });
  expect(result, result.reason).toMatchObject({ ok: true });
}

async function expectHistoryControlsAreOwnedBySidebar(page: {
  locator: (selector: string) => Locator;
}) {
  const result = await page.locator('.workspace').evaluate(() => {
    const panel = document.querySelector('.task-panel');
    const detail = document.querySelector('.detail-workspace');
    const header = document.querySelector('.history-sidebar-header');
    const toolbar = document.querySelector('.history-toolstrip');
    if (!panel || !detail || !header || !toolbar) {
      return { ok: false, reason: 'missing panel, detail, history header, or history toolstrip' };
    }

    const panelBox = panel.getBoundingClientRect();
    const detailBox = detail.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const toolbarBox = toolbar.getBoundingClientRect();
    const epsilon = 1;
    const staysInsidePanel = (box: DOMRect) =>
      box.left + epsilon >= panelBox.left &&
      box.right <= panelBox.right + epsilon &&
      box.top + epsilon >= panelBox.top &&
      box.bottom <= panelBox.bottom + epsilon;
    const overlapsDetail = (box: DOMRect) =>
      box.left < detailBox.right - epsilon &&
      box.right > detailBox.left + epsilon &&
      box.top < detailBox.bottom - epsilon &&
      box.bottom > detailBox.top + epsilon;

    return {
      ok:
        staysInsidePanel(headerBox) &&
        staysInsidePanel(toolbarBox) &&
        !overlapsDetail(headerBox) &&
        !overlapsDetail(toolbarBox),
      reason: JSON.stringify({
        panel: panelBox.toJSON(),
        detail: detailBox.toJSON(),
        header: headerBox.toJSON(),
        toolbar: toolbarBox.toJSON(),
      }),
    };
  });

  expect(result, result.reason).toMatchObject({ ok: true });
}

async function expectRowTranslateYBelow(row: Locator, maxY: number) {
  await expect
    .poll(async () =>
      row.evaluate((element) => {
        const transform = window.getComputedStyle(element).transform;
        if (!transform || transform === 'none') {
          return 0;
        }
        const matrix = new DOMMatrixReadOnly(transform);
        return Math.round(matrix.m42);
      }),
    )
    .toBeLessThan(maxY);
}

async function expectNoPageHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.body.scrollWidth <= window.innerWidth,
      ),
    )
    .toBeTruthy();
}

async function expectReaderToolbarControlsStayInside(page: Page) {
  const result = await page.locator('.reader').evaluate((reader) => {
    const toolbar = reader.querySelector('.reader-toolbar');
    const title = reader.querySelector('.reader-title');
    const actions = reader.querySelector('.reader-actions');
    const controls = Array.from(
      reader.querySelectorAll('.reader-actions > button, .reader-actions > .segmented-control'),
    );
    if (!toolbar || !title || !actions || controls.length === 0) {
      return { ok: false, reason: 'missing reader toolbar, title, actions, or controls' };
    }

    const readerBox = reader.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    const actionBox = actions.getBoundingClientRect();
    const boxes = controls.map((control) => control.getBoundingClientRect());
    const epsilon = 1;
    const insideReader = (box: DOMRect) =>
      box.left + epsilon >= readerBox.left &&
      box.right <= readerBox.right + epsilon &&
      box.top + epsilon >= readerBox.top &&
      box.bottom <= readerBox.bottom + epsilon;
    const overlaps = boxes.some((box, index) =>
      boxes.some(
        (other, otherIndex) =>
          otherIndex > index &&
          box.left < other.right - epsilon &&
          box.right > other.left + epsilon &&
          box.top < other.bottom - epsilon &&
          box.bottom > other.top + epsilon,
      ),
    );
    const titleOverlapsActions =
      titleBox.left < actionBox.right - epsilon &&
      titleBox.right > actionBox.left + epsilon &&
      titleBox.top < actionBox.bottom - epsilon &&
      titleBox.bottom > actionBox.top + epsilon;

    return {
      ok:
        insideReader(titleBox) &&
        insideReader(actionBox) &&
        boxes.every(insideReader) &&
        !overlaps &&
        !titleOverlapsActions,
      reason: JSON.stringify({
        reader: readerBox.toJSON(),
        title: titleBox.toJSON(),
        actions: actionBox.toJSON(),
        controls: boxes.map((box) => box.toJSON()),
      }),
    };
  });

  expect(result, result.reason).toMatchObject({ ok: true });
}

async function expectAsciiDocShadowText(page: Page, expected: string) {
  await expect
    .poll(() =>
      page.locator('.asciidoc-reader-host').evaluate((host) => host.shadowRoot?.textContent ?? ''),
    )
    .toContain(expected);
}

async function expectAsciiDocElementScrollsInside(page: Page, selector: string) {
  const result = await page.locator('.asciidoc-reader-host').evaluate((host, selector) => {
    const element = host.shadowRoot?.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      return { ok: false, reason: `missing ${selector}` };
    }
    const style = window.getComputedStyle(element);
    return {
      ok:
        element.scrollWidth > element.clientWidth &&
        (style.overflowX === 'auto' || style.overflowX === 'scroll'),
      reason: JSON.stringify({
        selector,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        overflowX: style.overflowX,
      }),
    };
  }, selector);

  expect(result, result.reason).toMatchObject({ ok: true });
}

async function expectAsciiDocBodyFontSize(page: Page, expectedPx: string) {
  const result = await page.locator('.asciidoc-reader-host').evaluate((host, expectedPx) => {
    const selectors = ['p', 'li', 'td', 'pre code'];
    const mismatches = selectors
      .map((selector) => {
        const element = host.shadowRoot?.querySelector(selector);
        if (!(element instanceof HTMLElement)) {
          return { selector, fontSize: 'missing' };
        }
        return { selector, fontSize: window.getComputedStyle(element).fontSize };
      })
      .filter((entry) => entry.fontSize !== expectedPx);

    return {
      ok: mismatches.length === 0,
      reason: JSON.stringify({ expectedPx, mismatches }),
    };
  }, expectedPx);

  expect(result, result.reason).toMatchObject({ ok: true });
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
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: /Wide Markdown review/ }).dblclick();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Wide Markdown review');
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

  await expectNoPageHorizontalOverflow(page);

  await page.getByRole('button', { name: /Reader settings/i }).click();
  await page.getByRole('slider', { name: /Font size/i }).fill('20');
  await page.keyboard.press('Escape');
  await expect(page.locator('.markdown-reader')).toHaveCSS('font-size', '20px');
  await page.getByRole('button', { name: /Copy source/i }).click();
  await expect(page.getByRole('button', { name: /Copied/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);

  await page.getByRole('button', { name: /^Reply$/ }).click();
  await expect(page.locator('.workspace')).toHaveClass(/reply-mode/);
  await expect(page.locator('.reply-panel')).toBeVisible();
  await page.getByPlaceholder('Write a reply...').fill('Approved from Playwright');
  await page.getByRole('button', { name: /Submit reply/i }).click();

  await expect(page.getByRole('button', { name: /Wide Markdown review/ })).toHaveCount(0);
  await expect(page.getByText('This request was completed outside this browser.')).toHaveCount(0);
  const result = await request.get('/api/tasks/task-playwright-1/result');
  await expect(result).toBeOK();
  await expect(await result.json()).toMatchObject({
    status: 'found',
    user_input: 'Approved from Playwright',
  });

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByRole('button', { name: /Wide Markdown review/ })).toBeVisible();
  await page.getByRole('button', { name: /Wide Markdown review/ }).dblclick();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Wide Markdown review');
  await expect(page.getByRole('heading', { name: 'User reply' })).toBeVisible();
  await expect(page.locator('.history-reply-content')).toContainText('Approved from Playwright');
});

test('keeps reader toolbar controls contained on desktop and narrow widths', async ({
  page,
  request,
}) => {
  await createE2ETask(
    request,
    'task-e2e-reader-layout',
    'session-e2e-reader-layout',
    'Reader toolbar layout',
    '# Reader toolbar layout',
  );

  await page.goto('/');
  await expect(page.locator('.markdown-reader')).toContainText('Reader toolbar layout');

  await page.setViewportSize({ width: 1280, height: 760 });
  await expectReaderToolbarControlsStayInside(page);
  await expectNoPageHorizontalOverflow(page);

  await page.setViewportSize({ width: 430, height: 760 });
  await expectReaderToolbarControlsStayInside(page);
  await expectNoPageHorizontalOverflow(page);
});

test('covers reader AsciiDoc settings, temporary overrides, source projection, and overflow bounds', async ({
  page,
  request,
}) => {
  await createE2ETask(
    request,
    'task-e2e-reader-asciidoc',
    'session-e2e-reader',
    'AsciiDoc reader task',
    asciidocReaderSource,
  );
  await createE2ETask(
    request,
    'task-e2e-reader-second-asciidoc',
    'session-e2e-reader-second',
    'Second AsciiDoc reader task',
    secondAsciidocReaderSource,
  );
  await createE2ETask(
    request,
    'task-e2e-reader-overflow-asciidoc',
    'session-e2e-reader-overflow',
    'AsciiDoc overflow task',
    asciidocOverflowSource,
  );
  await createE2ETask(
    request,
    'task-e2e-reader-markdown-url',
    'session-e2e-reader-markdown-url',
    'Markdown long URL task',
    markdownLongUrlSource,
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Open task AsciiDoc reader task' }).click();
  await expect(page.locator('.markdown-reader')).toContainText('= Title');

  await page.getByRole('button', { name: /Reader settings/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Reader settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'AsciiDoc' }).click();
  await dialog.getByRole('slider', { name: /Font size/i }).fill('20');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expectAsciiDocShadowText(page, 'Title');
  await expectAsciiDocBodyFontSize(page, '20px');
  await expect(page.locator('.markdown-reader')).toHaveCount(0);

  await page.getByRole('radio', { name: 'Markdown' }).click();
  await expect(page.locator('.markdown-reader')).toContainText('= Title');
  await expect(page.locator('.asciidoc-reader-host')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open task Second AsciiDoc reader task' }).click();
  await expectAsciiDocShadowText(page, 'Second Title');
  await expect(page.locator('.markdown-reader')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open task AsciiDoc reader task' }).click();
  await expect(page.locator('.markdown-reader')).toContainText('= Title');
  await page.getByRole('radio', { name: 'Source' }).click();
  await expect(page.locator('.source-reader')).toContainText('= Title');
  await expect(page.locator('.source-reader')).toContainText('This source should render');
  await page.getByRole('radio', { name: 'Rendered' }).click();

  await page.getByRole('button', { name: 'Open task AsciiDoc overflow task' }).click();
  await expectAsciiDocShadowText(page, 'Overflow Title');
  await expectNoPageHorizontalOverflow(page);
  await expectAsciiDocElementScrollsInside(page, 'table');
  await expectAsciiDocElementScrollsInside(page, 'pre');

  await page.getByRole('button', { name: 'Open task Markdown long URL task' }).click();
  await page.getByRole('radio', { name: 'Markdown' }).click();
  await expect(page.locator('.markdown-reader')).toContainText('Markdown URL');
  await expectNoPageHorizontalOverflow(page);
});

test('keeps pending virtual row measurements tied to stable items after live prepends', async ({
  page,
  request,
}) => {
  await createE2ETask(
    request,
    'task-e2e-virtual-older',
    'session-e2e-virtual-older',
    'Older pending task',
    '# Older pending task',
  );
  await createE2ETask(
    request,
    'task-e2e-virtual-tall',
    'session-e2e-virtual-existing',
    'Measured tall pending task with enough wrapped title text to force a larger virtual row measurement ABCDEFGHIJKLMNOPQRSTUVWXYZ ABCDEFGHIJKLMNOPQRSTUVWXYZ ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '# Tall pending task',
  );
  await renameE2ESession(request, 'session-e2e-virtual-existing', 'Existing virtual session');
  await renameE2ESession(request, 'session-e2e-virtual-older', 'Older virtual session');

  await page.goto('/');
  await page.setViewportSize({ width: 640, height: 760 });

  const olderGroup = page.locator('.task-group-row').filter({ hasText: 'Older virtual session' });
  await expect(olderGroup).toBeVisible();
  await expect
    .poll(async () =>
      olderGroup.evaluate((element) => Math.round(element.getBoundingClientRect().top)),
    )
    .toBeGreaterThan(200);

  await createE2ETask(
    request,
    'task-e2e-virtual-new',
    'session-e2e-virtual-new',
    'New pending task',
    '# New pending task',
  );

  const existingGroup = page
    .locator('.task-group-row')
    .filter({ hasText: 'Existing virtual session' });
  await expect(existingGroup).toBeVisible();
  await expectRowTranslateYBelow(existingGroup, 190);
});

test('keeps the reader focused across live task creation and supersede events', async ({
  page,
  request,
}) => {
  await createE2ETask(
    request,
    'task-e2e-focus-a',
    'session-e2e-focus-a',
    'Focus A',
    '# Focus A\n\nKeep reading this request.',
  );

  await page.goto('/');
  await expect(page.locator('.markdown-reader')).toContainText('Focus A');

  await createE2ETask(
    request,
    'task-e2e-focus-b',
    'session-e2e-focus-b',
    'Focus B',
    '# Focus B\n\nThis should not steal the reader.',
  );

  await expect(page.getByRole('button', { name: /Focus B/ })).toBeVisible();
  await expect(page.locator('.markdown-reader')).toContainText('Focus A');
  await expect(page.locator('.markdown-reader')).not.toContainText('Focus B');

  await createE2ETask(
    request,
    'task-e2e-focus-c',
    'session-e2e-focus-a',
    'Focus C replacement',
    '# Focus C\n\nOpen only after explicit action.',
  );

  await expect(page.getByRole('button', { name: /Focus C replacement/ })).toBeVisible();
  await expect(page.locator('.markdown-reader')).toContainText('Focus A');
  await expect(page.locator('.reader-status-banner')).toContainText(
    'This request was replaced by a newer request from the same session.',
  );
  await expect(page.locator('.markdown-reader')).not.toContainText('Focus C');

  await page.getByRole('button', { name: 'Open replacement' }).click();

  await expect(page.locator('.markdown-reader')).toContainText('Focus C');
  await expect(page.locator('.markdown-reader')).not.toContainText('Focus A');
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
  const pendingSession = await renameE2ESession(
    request,
    'session-e2e-pending-long',
    longDisplayName,
  );
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

  await page.setViewportSize({ width: 640, height: 760 });
  await expect(pendingGroup).toBeVisible();
  await expectGroupHeaderContentDoesNotOverlapControls(pendingGroup);

  await pendingGroup
    .getByRole('button', {
      name: `Open ${longDisplayName} ${pendingSession.auto_name} group actions`,
    })
    .click();
  await page.getByRole('menuitem', { name: 'Rename session' }).click();
  await page.getByLabel('Session display name').fill(renamedDisplayName);
  await page.keyboard.press('Enter');
  await expect(page.locator('.task-group-row').filter({ hasText: renamedDisplayName })).toBeVisible();

  await page.getByRole('tab', { name: 'History' }).click();
  await expectHistoryControlsAreOwnedBySidebar(page);
  const springGroups = page.locator('.task-group-row').filter({ hasText: '春天' });
  await expect(springGroups).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Collapse 春天/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /History duplicate display name/ })).toBeVisible();
  await expectGroupHeaderContentDoesNotOverlapControls(springGroups.first());
  await expectGroupHeaderContentDoesNotOverlapControls(springGroups.nth(1));

  await page.getByRole('button', { name: 'Collapse all groups' }).click();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /History duplicate display name/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand all groups' }).click();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /History duplicate display name/ })).toBeVisible();

  await springGroups
    .filter({ hasText: springSession.auto_name })
    .getByRole('button', { name: new RegExp(`Collapse 春天`) })
    .click();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toHaveCount(0);
  await springGroups
    .filter({ hasText: springSession.auto_name })
    .getByRole('button', { name: new RegExp(`Expand 春天`) })
    .click();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toBeVisible();

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByLabel('Select history item').first().check();
  await expect(page.getByRole('button', { name: 'Copy (1)' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Archive (1)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Copy (1)' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('<Assistant id="1">');

  await springGroups
    .filter({ hasText: springSession.auto_name })
    .getByRole('button', { name: `Open 春天 ${springSession.auto_name} group actions` })
    .click();
  await page.getByRole('menuitem', { name: 'Archive loaded group' }).click();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toHaveCount(0);

  await page.getByTitle('Open archived history').click();
  await expectHistoryControlsAreOwnedBySidebar(page);
  await expect(page.getByText('Archived History')).toBeVisible();
  await expect(page.getByRole('button', { name: /Archived winter task/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse all groups' }).click();
  await expect(page.getByRole('button', { name: /Archived winter task/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand all groups' }).click();
  await expect(page.getByRole('button', { name: /Archived winter task/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /History grouped spring/ })).toBeVisible();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
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
