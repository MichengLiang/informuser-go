import { useEffect, useRef, useState } from 'react';
import { renderAsciiDoc } from './adoc-renderer';

type AsciiDocRendererProps = {
  source: string;
  onRenderError?: (message: string) => void;
};

const embeddedReaderCss = `
:host {
  display: block;
  min-width: 0;
  color: #222;
  background: #fff;
}

.asciidoc-render {
  box-sizing: border-box;
  min-width: 0;
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  overflow-wrap: anywhere;
}

.asciidoc-render p,
.asciidoc-render li,
.asciidoc-render dt,
.asciidoc-render dd,
.asciidoc-render td,
.asciidoc-render th,
.asciidoc-render blockquote,
.asciidoc-render summary,
.asciidoc-render pre,
.asciidoc-render code,
.asciidoc-render kbd {
  font-size: var(--reader-font-size) !important;
  line-height: var(--reader-line-height);
}

.asciidoc-render :where(h1, h2, h3, h4, h5, h6, #toctitle, .sidebarblock > .content > .title) {
  line-height: 1.2;
}

.asciidoc-render h1 {
  font-size: calc(var(--reader-font-size) * 2.35);
}

.asciidoc-render h2 {
  font-size: calc(var(--reader-font-size) * 1.9);
}

.asciidoc-render :where(h3, #toctitle, .sidebarblock > .content > .title) {
  font-size: calc(var(--reader-font-size) * 1.55);
}

.asciidoc-render h4 {
  font-size: calc(var(--reader-font-size) * 1.3);
}

.asciidoc-render :where(h5, h6) {
  font-size: calc(var(--reader-font-size) * 1.15);
}

#header,
#content,
#footnotes,
#footer {
  box-sizing: border-box;
  max-width: none;
  padding-left: 0;
  padding-right: 0;
}

#content {
  margin-top: 0;
}

pre,
table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

pre,
pre code {
  overflow-wrap: normal;
  white-space: pre;
}

pre code {
  display: inline-block;
  min-width: max-content;
}
`;

export function AsciiDocRenderer({ source, onRenderError }: AsciiDocRendererProps) {
  const shadowHostRef = useRef<HTMLDivElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    const host = shadowHostRef.current;
    if (!host) {
      return;
    }

    try {
      const { bodyHtml, styles } = renderAsciiDoc(source);
      if (!styles.trim()) {
        throw new Error('AsciiDoc stylesheet is unavailable.');
      }
      const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      // The official Asciidoctor CSS contains broad selectors such as body and table,
      // so the reader scopes it with Shadow DOM instead of injecting it globally.
      shadowRoot.innerHTML = `
        <style>${styles}</style>
        <style>${embeddedReaderCss}</style>
        <article class="asciidoc-render">
          ${bodyHtml}
        </article>
      `;
      setErrorMessage(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      onRenderError?.(message);
      const shadowRoot = host.shadowRoot;
      if (shadowRoot) {
        shadowRoot.innerHTML = '';
      }
    }
  }, [source, onRenderError]);

  return (
    <>
      {errorMessage ? (
        <div role="status" className="reader-status-banner">
          <span>{errorMessage}</span>
        </div>
      ) : null}
      <div ref={shadowHostRef} className="asciidoc-reader-host" />
    </>
  );
}
