import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { appCopy } from '@/lib/app.copy'
import { deleteAsset, fetchUploadLimit, formatBytes, uploadAsset } from '@/lib/assets'
import { SESSION_QUERY_KEY, updateCurrentUser, useCurrentUser } from '@/lib/auth'
import type { CurrentUser } from '@/lib/auth'
import { initials } from '@/lib/format'
import { avatarUrl } from '@/lib/users'
import { settingsCopy } from '@/settings/settings.copy'

const copy = settingsCopy.account

// Name and picture for the signed-in user. Email and password stay in Monospace, so they are
// shown read-only here.
export function AccountSettings() {
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  const [name, setName] = useState(user?.fullName ?? '')
  const picker = useRef<HTMLInputElement>(null)
  const [limit, setLimit] = useState<number | null>(null)

  useEffect(() => {
    void fetchUploadLimit().then(setLimit)
  }, [])

  // The session query is the only copy of the user, so every save writes back into it.
  const applyUser = (next: CurrentUser) => {
    queryClient.setQueryData(SESSION_QUERY_KEY, next)
  }

  const saveName = useMutation({
    mutationFn: () => updateCurrentUser({ fullName: name.trim() || null }),
    onSuccess: (next) => {
      applyUser(next)
      setName(next.fullName ?? '')
      toast.success(copy.saved)
    },
    onError: () => toast.error(copy.saveFailed),
  })

  // Point the user at the new blob first, then drop the old one. A failed cleanup is not worth
  // interrupting the save.
  const saveAvatar = useMutation({
    mutationFn: async (file: File | null) => {
      const previous = user?.avatarId ?? null
      const avatarId = file ? await uploadAsset(file, { scope: 'system' }) : null
      const next = await updateCurrentUser({ avatarId })

      if (previous && previous !== avatarId) {
        await deleteAsset(previous, { scope: 'system' }).catch(() => {})
      }

      return next
    },
    onSuccess: (next) => {
      applyUser(next)
      toast.success(copy.saved)
    },
    onError: (cause) => {
      toast.error(cause instanceof Error && cause.message ? cause.message : copy.uploadFailed)
    },
  })

  const pick = (file: File | undefined) => {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error(copy.notImage)

      return
    }

    if (limit && file.size > limit) {
      toast.error(copy.tooLarge(formatBytes(limit)))

      return
    }

    saveAvatar.mutate(file)
  }

  const displayName = user?.fullName?.trim() || user?.email || appCopy.auth.defaultUser
  const busy = saveAvatar.isPending
  const dirty = (user?.fullName ?? '') !== name

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />
      <Frame dense>
        <FrameHeader>
          <FrameTitle>{copy.profileTitle}</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-6 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar size="lg" className="size-16">
              {user?.avatarId ? (
                <AvatarImage src={avatarUrl(user.avatarId)} alt={displayName} />
              ) : null}
              <AvatarFallback>{initials(displayName, 'M')}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => picker.current?.click()}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                  {busy ? copy.uploading : user?.avatarId ? copy.replace : copy.upload}
                </Button>
                {user?.avatarId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => saveAvatar.mutate(null)}
                  >
                    <Trash2 />
                    {copy.remove}
                  </Button>
                ) : null}
              </div>
              {limit ? (
                <p className="text-xs text-muted-foreground">
                  {copy.avatarHelp(formatBytes(limit))}
                </p>
              ) : null}
            </div>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                pick(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()

              if (dirty) saveName.mutate()
            }}
          >
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="account-name">{copy.name}</Label>
              <Input
                id="account-name"
                value={name}
                placeholder={copy.namePlaceholder}
                disabled={saveName.isPending}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{copy.nameHelp}</p>
            </div>
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="account-email">{copy.email}</Label>
              <Input id="account-email" value={user?.email ?? ''} readOnly disabled />
              <p className="text-xs text-muted-foreground">{copy.emailHelp}</p>
            </div>
            <Button type="submit" size="sm" disabled={!dirty || saveName.isPending}>
              {saveName.isPending ? copy.saving : copy.save}
            </Button>
          </form>
        </FramePanel>
      </Frame>
    </div>
  )
}
