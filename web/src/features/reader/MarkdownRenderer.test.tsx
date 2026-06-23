import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer';

const style = {
  '--reader-font-size': '15px',
  '--reader-line-height': 1.7,
} as React.CSSProperties;

describe('MarkdownRenderer', () => {
  it('renders headings and GFM tables', () => {
    render(
      <MarkdownRenderer source={'# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |'} style={style} />,
    );

    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('sanitizes script HTML', () => {
    render(<MarkdownRenderer source={'# Title\n\n<script>alert(1)</script>'} style={style} />);

    expect(screen.queryByText('alert(1)')).not.toBeInTheDocument();
  });

  it('renders inline code and code blocks', () => {
    render(<MarkdownRenderer source={'Use `inline`.\n\n```ts\nconst x = 1;\n```'} style={style} />);

    expect(screen.getByText('inline')).toBeInTheDocument();
    expect(screen.getByText(/const x = 1/)).toBeInTheDocument();
  });
});
