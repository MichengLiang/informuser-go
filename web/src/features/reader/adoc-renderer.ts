import Asciidoctor from '@asciidoctor/core';
import DOMPurify from 'dompurify';
import { officialAsciidoctorDefaultCss } from './asciidoctor-default-css';

export type AsciiDocRenderResult = {
  bodyHtml: string;
  styles: string;
};

const processor = Asciidoctor();

export function renderAsciiDoc(source: string): AsciiDocRenderResult {
  const html = processor.convert(source, {
    safe: 'secure',
    standalone: false,
    attributes: { showtitle: '' },
  }) as string;

  // Asciidoctor safe mode constrains processor capabilities, but passthrough HTML can
  // still produce browser-executable markup unless the fragment is sanitized here.
  const bodyHtml = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
    FORBID_ATTR: ['style'],
  });

  return {
    bodyHtml,
    styles: officialAsciidoctorDefaultCss,
  };
}
