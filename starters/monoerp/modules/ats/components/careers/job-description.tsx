import type { ReactNode } from 'react'

type Block = { kind: 'heading' | 'paragraph'; text: string } | { kind: 'list'; items: string[] }

// Job descriptions are plain text written by recruiters: blank lines split paragraphs, "## "
// starts a heading, and "- " or "* " lines make a list. Nothing else is interpreted, so no
// markup from the database reaches the page.
function blocks(text: string) {
  const result: Array<Block> = []

  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (!lines.length) continue

    if (lines.every((line) => /^[-*•]\s+/.test(line))) {
      result.push({ kind: 'list', items: lines.map((line) => line.replace(/^[-*•]\s+/, '')) })
    } else if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0] ?? '')) {
      result.push({ kind: 'heading', text: (lines[0] ?? '').replace(/^#{1,3}\s+/, '') })
    } else {
      result.push({ kind: 'paragraph', text: lines.join(' ') })
    }
  }

  return result
}

export function JobDescription({ text, fallback }: { text: string | null; fallback: ReactNode }) {
  const content = blocks(text ?? '')

  if (!content.length) return <p className="text-muted-foreground">{fallback}</p>

  return (
    <div className="space-y-5 text-[15px] leading-7 text-foreground/85">
      {content.map((block, index) =>
        block.kind === 'heading' ? (
          <h3 key={index} className="pt-3 text-lg font-semibold tracking-tight text-foreground">
            {block.text}
          </h3>
        ) : block.kind === 'list' ? (
          <ul key={index} className="space-y-2 pl-5 marker:text-(--brand) [&>li]:list-disc">
            {block.items.map((item) => (
              <li key={item} className="pl-1">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.text}</p>
        ),
      )}
    </div>
  )
}
