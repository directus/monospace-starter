import 'react'

declare module 'react' {
  // Inline CSS variables (`--stage`, `--sidebar-width`) that Tailwind classes read.
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined
  }
}
