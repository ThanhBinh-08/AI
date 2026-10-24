import Link from "next/link";
import type { ReactNode } from "react";
import { slugify } from "@/lib/text";

/**
 * A small Markdown subset rendered straight to React elements: headings (##, ###), paragraphs, lists,
 * **bold**, *italic*, `code` and [links](...). Raw HTML is shown as text, never parsed, and links accept only
 * site-relative paths, https URLs and mailto: — so content from the Sheet cannot inject markup or scripts.
 */

export function safeHref(href: string): string | null {
  const h = href.trim();
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(h)) return h;
  try {
    const u = new URL(h);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2]) out.push(<strong key={k}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3]}</em>);
    else if (m[4]) out.push(<code key={k}>{m[4]}</code>);
    else if (m[5] && m[6]) {
      const href = safeHref(m[6]);
      if (!href) out.push(m[5]);
      // A partner link in an article: a plain sponsored link (never prefetched), labelled for measurement.
      else if (href.startsWith("/go/")) out.push(<a key={k} href={href} rel="sponsored nofollow noopener" target="_blank" data-track="affiliate_click" data-brand={href.split("/")[2]} data-placement="article">{m[5]}</a>);
      else if (href.startsWith("/")) out.push(<Link key={k} href={href}>{m[5]}</Link>);
      else out.push(<a key={k} href={href} rel="nofollow noopener noreferrer" target="_blank">{m[5]}</a>);
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

export function headingsOf(md: string): Heading[] {
  return md
    .split(/\r?\n/)
    .flatMap((line) => {
      const m = /^(#{2,3})\s+(.+)$/.exec(line.trim());
      return m ? [{ id: slugify(m[2]!.replace(/[*`]/g, "")), text: m[2]!.replace(/[*`]/g, ""), level: m[1]!.length as 2 | 3 }] : [];
    });
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.length === 0) return null;
        const first = lines[0]!.trim();
        const h = /^(#{2,4})\s+(.+)$/.exec(first);
        if (h && lines.length === 1) {
          const text = h[2]!;
          const id = slugify(text.replace(/[*`]/g, ""));
          if (h[1]!.length === 2) return <h2 key={bi} id={id}>{inline(text, `h${bi}`)}</h2>;
          if (h[1]!.length === 3) return <h3 key={bi} id={id}>{inline(text, `h${bi}`)}</h3>;
          return <h4 key={bi}>{inline(text, `h${bi}`)}</h4>;
        }
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""), `u${bi}-${li}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return <ol key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), `o${bi}-${li}`)}</li>)}</ol>;
        }
        return <p key={bi}>{inline(lines.join(" "), `p${bi}`)}</p>;
      })}
    </>
  );
}
