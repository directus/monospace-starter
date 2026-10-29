import { http, HttpResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { afterEach } from 'vitest'

// Fakes the Monospace server at the network, so tests run the real SDK client, auth, and error
// handling. Each test declares the responses it needs with `worker.use(...)`; any request
// without a handler fails rather than reaching a real server.
export const worker = setupWorker()

await worker.start({ quiet: true, onUnhandledRequest: 'error' })

afterEach(() => worker.resetHandlers())

// A signed-in session: what AuthGate's refresh and /users/me return for the test user.
export const signedIn = [
  http.post('/api/auth/refresh', () => HttpResponse.json({})),
  http.get('/api/system/users/me', () =>
    HttpResponse.json({
      data: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'admin@example.com',
        fullName: 'Admin',
        avatarId: null,
      },
    }),
  ),
]
