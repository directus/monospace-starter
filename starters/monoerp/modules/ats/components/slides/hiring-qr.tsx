import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'

import { atsCopy } from '@/modules/ats/ats.copy'
import { careerJobsQuery } from '@/modules/ats/data/careers'

const copy = atsCopy.slides.hiring

// Points at the demo job's careers page on whatever host serves the deck, so the same code
// works locally and deployed. Falls back to the job list until the job is found.
export function HiringQr() {
  const jobs = useQuery(careerJobsQuery())
  const job = jobs.data?.find((row) => row.title === copy.jobTitle)
  const url = `${window.location.origin}/careers${job ? `/${job.id}` : ''}`

  return (
    <figure className="flex flex-col items-center gap-[1.4cqw]" data-qr-value={url}>
      <div className="rounded-[1.6cqw] bg-white p-[1.4cqw] shadow-[0_1cqw_4cqw_-1cqw_var(--brand-soft)] ring-1 ring-black/5">
        <QRCodeSVG
          value={url}
          size={512}
          level="M"
          marginSize={0}
          fgColor="#16161d"
          bgColor="#ffffff"
          title={copy.qrLabel(url)}
          className="size-[24cqw]"
        />
      </div>
      <figcaption className="font-mono text-[1.25cqw] text-muted-foreground">
        {url.replace(/^https?:\/\//, '')}
      </figcaption>
    </figure>
  )
}
