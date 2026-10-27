import type { ReactNode } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { crmCopy } from '@/modules/crm/crm.copy'

type ExtraTab = { id: string; title: string; content: ReactNode }

export function RecordTabs({
  activity,
  notes,
  files,
  extra = [],
  className,
}: {
  activity: ReactNode
  notes: ReactNode
  files: ReactNode
  extra?: Array<ExtraTab>
  className?: string
}) {
  return (
    <Tabs defaultValue="activity" className={`min-w-0 gap-5 ${className ?? ''}`}>
      <TabsList variant="line" className="border-b">
        <TabsTrigger value="activity">{crmCopy.activity.title}</TabsTrigger>
        <TabsTrigger value="notes">{crmCopy.notes.title}</TabsTrigger>
        <TabsTrigger value="files">{crmCopy.files.title}</TabsTrigger>
        {extra.map(({ id, title }) => (
          <TabsTrigger key={id} value={id}>
            {title}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="activity">{activity}</TabsContent>
      <TabsContent value="notes">{notes}</TabsContent>
      <TabsContent value="files">{files}</TabsContent>
      {extra.map(({ id, content }) => (
        <TabsContent key={id} value={id}>
          {content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
