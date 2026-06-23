import type { CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

type MarkdownRendererProps = {
  source: string;
  style: CSSProperties;
};

export function MarkdownRenderer({ source, style }: MarkdownRendererProps) {
  return (
    <article className="markdown-reader" style={style}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {source}
      </ReactMarkdown>
    </article>
  );
}
