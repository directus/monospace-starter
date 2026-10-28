import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const run = promisify(execFile)

const script = fileURLToPath(new URL('ats-people.mjs', import.meta.url))

const colleagues = [
  { id: 'priya', email: 'priya.raman@example.com' },
  { id: 'tom', email: 'tom.becker@example.com' },
]

const placeholders = [1, 2, 3, 4, 5].map(
  (number) => `00000000-0000-4000-8999-${String(number).padStart(12, '0')}`,
)

describe('ATS people on Starter', () => {
  it.each([[], [colleagues[1]], colleagues])(
    'keeps distinct interviewers with the available colleagues: %j',
    async (...members) => {
      const rows = new Map(
        ['interviewParticipants', 'scorecards'].map((collection) => [
          collection,
          placeholders.map((user, index) => ({ id: String(index), user })),
        ]),
      )

      let writes = 0

      const server = createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost')
        let body = { data: [] }

        if (url.pathname === '/api/auth/providers') {
          body = {
            data: [
              {
                protocol: 'password',
                loginMethod: 'POST',
                apiName: 'password',
                loginPath: '/login',
              },
            ],
          }
        } else if (url.pathname === '/api/monoerp/members') {
          body = { data: members }
        } else if (url.pathname === '/api/system/invites') {
          response.statusCode = 402
          body = { meta: { violations: [{ entitlement: 'seats', hard_limit: 3 }] } }
        } else if (url.pathname.includes('/items/')) {
          const [, collection, id] = url.pathname.split('/items/')[1].match(/^([^/]+)(?:\/(.*))?$/)
          const entries = rows.get(collection) ?? []
          const column = collection === 'scorecards' ? 'interviewerUserId' : 'userId'

          if (request.method === 'PATCH') {
            const chunks = []

            for await (const chunk of request) chunks.push(chunk)
            const patch = JSON.parse(Buffer.concat(chunks).toString())

            if (entries.some((entry) => entry.id !== id && entry.user === patch[column])) {
              response.statusCode = 422
              body = { message: 'Duplicate interviewer' }
            } else {
              entries.find((entry) => entry.id === id).user = patch[column]
              writes += 1
            }
          } else {
            const placeholder = url.searchParams.get(`filter[${column}][_eq]`)
            body = {
              data: entries.flatMap((entry) =>
                entry.user === placeholder ? [{ id: entry.id }] : [],
              ),
            }
          }
        }

        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify(body))
      })

      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()

      const url = `http://127.0.0.1:${address.port}`

      const env = {
        ...process.env,
        MONOSPACE_URL: url,
        MAILPIT_URL: url,
        MONOSPACE_LICENSE__KEY: '',
      }

      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await run(process.execPath, [script], { env })
          expect(result.stdout).toContain('Skipped ATS demo colleagues:')
        }

        expect(writes).toBe(members.length * 2)

        for (const entries of rows.values()) {
          const expected = placeholders.map(
            (placeholder, index) =>
              members.find((member) => member.email === colleagues[index]?.email)?.id ??
              placeholder,
          )

          expect(entries.map((entry) => entry.user)).toEqual(expected)
        }
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    },
  )
})
