import { Columns3, PanelTop } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StageStepper } from '@/modules/crm/components/stage-stepper'
import type { PipelineStage } from '@/modules/crm/data'
import { stageStyle } from '@/modules/crm/stage-color'
import { crmSettingsCopy } from '@/modules/crm/settings/settings.copy'

const copy = crmSettingsCopy.stages

export function StagePreview({ stages }: { stages: PipelineStage[] }) {
  const [selectedId, setSelectedId] = useState<string>()

  const selected =
    stages.find((stage) => stage.id === selectedId) ??
    stages.find((stage) => stage.isClosed === false) ??
    stages[0]

  return (
    <Tabs defaultValue="board">
      <Frame dense role="region" aria-label={copy.previewLabel}>
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2 px-5 py-3">
          <FrameTitle>{crmSettingsCopy.stages.preview}</FrameTitle>
          <TabsList aria-label={copy.previewView}>
            <TabsTrigger value="board" className="px-2 text-xs">
              <Columns3 className="size-3.5" />
              Board
            </TabsTrigger>
            <TabsTrigger value="detail" className="px-2 text-xs">
              <PanelTop className="size-3.5" />
              Deal detail
            </TabsTrigger>
          </TabsList>
        </FrameHeader>
        <FramePanel className="p-4">
          <TabsContent value="board">
            <ol
              aria-label={copy.boardPreview}
              className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2"
            >
              {stages.map((stage, index) => (
                <li
                  key={stage.id ?? index}
                  style={stageStyle(stage, index)}
                  className="min-w-0 rounded-lg bg-muted/60 p-2"
                >
                  <div className="mb-2 h-1 rounded-full bg-(--stage)" />
                  <p className="truncate text-[11px] font-medium" title={stage.name ?? undefined}>
                    {stage.name ?? crmSettingsCopy.stages.restricted}
                  </p>
                  <div
                    aria-hidden="true"
                    className="mt-2 space-y-2 rounded bg-background p-2 shadow-xs"
                  >
                    <div className="h-1.5 w-3/4 rounded bg-foreground/10" />
                    <div className="h-1 w-1/2 rounded bg-muted" />
                  </div>
                </li>
              ))}
            </ol>
          </TabsContent>
          <TabsContent value="detail">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">{copy.exampleDeal}</p>
                <div className="flex flex-wrap items-center gap-1">
                  {stages
                    .filter((stage) => stage.isClosed)
                    .map((stage) => (
                      <Button
                        key={stage.id}
                        variant={selected?.id === stage.id ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setSelectedId(stage.id ?? undefined)}
                        aria-pressed={selected?.id === stage.id}
                      >
                        {stage.name}
                      </Button>
                    ))}
                </div>
              </div>
              <StageStepper
                stages={stages}
                currentStageId={selected?.id}
                onSelect={(stage) => setSelectedId(stage.id ?? undefined)}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Select a stage to preview it. This example does not change any deals.
            </p>
          </TabsContent>
        </FramePanel>
      </Frame>
    </Tabs>
  )
}
