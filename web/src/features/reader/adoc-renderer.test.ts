import { describe, expect, it } from 'vitest';
import { renderAsciiDoc } from './adoc-renderer';

describe('renderAsciiDoc', () => {
  it('renders headings, admonitions, tables, and source blocks', () => {
    const result = renderAsciiDoc(`= Title

NOTE: body

|===
|A |B
|1 |2
|===

[source,ts]
----
const x = 1;
----`);

    expect(result.bodyHtml).toContain('Title');
    expect(result.bodyHtml).toContain('admonitionblock');
    expect(result.bodyHtml).toContain('<table');
    expect(result.bodyHtml).toContain('<pre');
    expect(result.bodyHtml).toContain('const x = 1');
  });

  it('sanitizes passthrough HTML and scripts', () => {
    const result = renderAsciiDoc(`pass:[<img src=x onerror=alert(1)>]

pass:[<a href="javascript:alert(1)">bad</a>]

pass:[<script>alert(1)</script>]`);

    expect(result.bodyHtml).not.toContain('onerror');
    expect(result.bodyHtml).not.toContain('javascript:');
    expect(result.bodyHtml).not.toContain('<script');
  });

  it('returns generated Asciidoctor styles', () => {
    const result = renderAsciiDoc('= Title');

    expect(result.styles).toContain('Asciidoctor default stylesheet');
    expect(result.styles).toContain('.sect1');
  });
});
