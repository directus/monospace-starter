import type { ReactNode } from 'react'

import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'

export function RecordDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Frame dense>
      <FrameHeader className="flex-row items-center px-5 py-3">
        <FrameTitle>{title}</FrameTitle>
      </FrameHeader>
      <FramePanel className="px-5 py-4">{children}</FramePanel>
    </Frame>
  )
}
