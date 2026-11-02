import { createServer } from 'node:net'

import { afterEach, expect, it } from 'vitest'

import { portName, probeFor } from './ports.mjs'

const servers = []

afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((r) => server.close(r)))))

// A local server that sends `reply` on connect (or after the first write) and returns its port.
async function serve(reply, { speaksFirst = false } = {}) {
  const server = createServer((socket) => {
    if (speaksFirst) socket.end(reply)
    else socket.once('data', () => socket.end(reply))
  })

  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  return server.address().port
}

it('finds the .env name for a port', () => {
  expect(portName(8025, { APP_PORT: '3000', MAILPIT_PORT: '8025', OTHER: '8025' })).toBe(
    'MAILPIT_PORT',
  )
  expect(portName(9999, { APP_PORT: '3000' })).toBeUndefined()
})

it('tells Postgres asking for SCRAM from anything else', async () => {
  const scram = Buffer.from([0x52, 0, 0, 0, 23, 0, 0, 0, 10])
  const trust = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0])

  expect(await probeFor('postgres:17')(await serve(scram))).toBe('ours')
  expect(await probeFor('postgres:17')(await serve(trust))).toBe('other')
  expect(await probeFor('postgres:17')(await serve('HTTP/1.0 400\r\n\r\n'))).toBe('other')
})

it('tells a MySQL handshake from anything else', async () => {
  const handshake = Buffer.from([0x4a, 0, 0, 0, 10, 0x38, 0x2e, 0x34, 0])

  expect(await probeFor('mysql:8.4')(await serve(handshake, { speaksFirst: true }))).toBe('ours')
  expect(await probeFor('mysql:8.4')(await serve('hello', { speaksFirst: true }))).toBe('other')
})

it('says nothing answers on a closed port', async () => {
  const port = await serve('')
  await new Promise((resolve) => servers.pop().close(resolve))

  expect(await probeFor('postgres:17')(port)).toBe('none')
  expect(await probeFor('axllent/mailpit:v1.27')(port)).toBe('none')
})
