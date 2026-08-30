import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type LegalDocumentBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "bullet"; text: string };

type LegalDocumentPageProps = {
  title: string;
  updatedAt: string;
  blocks: LegalDocumentBlock[];
};

export function LegalDocumentPage({ title, updatedAt, blocks }: LegalDocumentPageProps) {
  const rendered: ReactNode[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block.type === "bullet") {
      const items: string[] = [];
      let cursor = index;
      while (cursor < blocks.length && blocks[cursor]?.type === "bullet") {
        items.push(blocks[cursor]!.text);
        cursor += 1;
      }

      rendered.push(
        <ul
          key={`list-${index}`}
          className="my-4 list-disc space-y-2 pr-6 text-sm leading-7 text-foreground sm:text-base sm:leading-8"
        >
          {items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>{item}</li>
          ))}
        </ul>,
      );
      index = cursor - 1;
      continue;
    }

    if (block.type === "h2") {
      rendered.push(
        <h2 key={`h2-${index}`} className="mt-10 scroll-mt-24 text-xl font-bold text-foreground sm:text-2xl">
          {block.text}
        </h2>,
      );
      continue;
    }

    if (block.type === "h3") {
      rendered.push(
        <h3 key={`h3-${index}`} className="mt-6 scroll-mt-24 text-base font-bold text-foreground sm:text-lg">
          {block.text}
        </h3>,
      );
      continue;
    }

    rendered.push(
      <p key={`p-${index}`} className="mt-3 text-sm leading-7 text-foreground sm:text-base sm:leading-8">
        {block.text}
      </p>,
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-soft/25 via-background to-background">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <nav aria-label="פירורי לחם" className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground hover:underline">
            דף הבית
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-foreground">
            {title}
          </span>
        </nav>

        <article className="rounded-3xl border border-border bg-surface-elevated px-5 py-7 shadow-card sm:px-8 sm:py-10">
          <header className="border-b border-border pb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">עודכן לאחרונה: {updatedAt}</p>
          </header>

          <div className="pt-2">{rendered}</div>
        </article>
      </div>
    </main>
  );
}
