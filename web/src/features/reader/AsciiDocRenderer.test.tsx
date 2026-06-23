import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AsciiDocRenderer } from './AsciiDocRenderer';

describe('AsciiDocRenderer', () => {
  it('renders sanitized AsciiDoc into Shadow DOM without global CSS injection', async () => {
    render(<AsciiDocRenderer source="= Title" />);

    const host = document.querySelector('.asciidoc-reader-host');
    expect(host).toBeInTheDocument();
    expect(host?.shadowRoot).toBeTruthy();
    expect(host?.shadowRoot?.querySelector('.asciidoc-render')).toBeTruthy();
    expect(host?.shadowRoot?.querySelectorAll('style')).toHaveLength(2);
    expect(host?.shadowRoot?.textContent).toContain('Title');
    expect(document.head.textContent).not.toContain('Asciidoctor default stylesheet');
    expect(screen.queryByRole('heading', { name: 'Title' })).not.toBeInTheDocument();
  });
});
