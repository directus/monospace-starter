import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  boundPorts,
  envFromExample,
  folderProjectName,
  keepsFolderProject,
  pickPorts,
  projectName,
  siblingPorts,
} from './env.mjs'

describe('first .env', () => {
  it('names the Compose project after the folder plus a suffix', () => {
    expect(projectName('monoerp', 'a1b2')).toBe('monoerp-a1b2')
    expect(projectName('My ERP.copy', 'a1b2')).toBe('my-erp-copy-a1b2')
    expect(projectName('_tmp', 'a1b2')).toBe('tmp-a1b2')
    expect(projectName('...', 'a1b2')).toBe('app-a1b2')
  })

  it('keeps free defaults and moves taken ones to the next free port', () => {
    const defaults = [
      { name: 'APP_PORT', port: 3000 },
      { name: 'MONOSPACE_PORT', port: 8100 },
      { name: 'OTHER_PORT', port: 8101 },
    ]

    expect(pickPorts(defaults, [8100, 8102])).toEqual([
      { name: 'APP_PORT', port: 3000, changed: false },
      { name: 'MONOSPACE_PORT', port: 8101, changed: true },
      { name: 'OTHER_PORT', port: 8103, changed: true },
    ])
  })

  it('never picks a port past the checked range', () => {
    const taken = Array.from({ length: 20 }, (_, step) => 3000 + step)

    expect(pickPorts([{ name: 'APP_PORT', port: 3000 }], taken)).toEqual([
      { name: 'APP_PORT', port: null, changed: true },
    ])
    expect(pickPorts([{ name: 'APP_PORT', port: 3000 }], taken.slice(0, 19))).toEqual([
      { name: 'APP_PORT', port: 3019, changed: true },
    ])
  })

  it('matches the project name Compose gives a folder', () => {
    expect(folderProjectName('monoerp')).toBe('monoerp')
    expect(folderProjectName('My ERP.copy')).toBe('myerpcopy')
    expect(folderProjectName('_tmp')).toBe('tmp')
  })

  it("keeps the folder's old project only when it's this folder's", () => {
    const here = '/work/monoerp'

    expect(keepsFolderProject({ folders: ['/work/monoerp/'], volumes: 2, here })).toBe(true)
    expect(keepsFolderProject({ folders: ['/other/monoerp'], volumes: 2, here })).toBe(false)
    expect(keepsFolderProject({ folders: [], volumes: 2, here })).toBe(true)
    expect(keepsFolderProject({ folders: [], volumes: 0, here })).toBe(false)
  })

  it('rewrites ports and the project name, leaving commented ports alone', () => {
    const example = [
      'APP_PORT=3000',
      '# COMPOSE_PROJECT_NAME=my-app',
      '# APP_DB_INTERNAL_PORT=5432',
      '',
    ].join('\n')

    expect(
      envFromExample(example, {
        project: 'monoerp-a1b2',
        ports: [{ name: 'APP_PORT', port: 3001 }],
      }),
    ).toBe(
      [
        'APP_PORT=3001',
        'COMPOSE_PROJECT_NAME=monoerp-a1b2',
        '# APP_DB_INTERNAL_PORT=5432',
        '',
      ].join('\n'),
    )
  })

  it('appends the project name when the example has no slot for it', () => {
    expect(envFromExample('APP_PORT=3000\n', { project: 'x-a1b2', ports: [] })).toBe(
      'APP_PORT=3000\nCOMPOSE_PROJECT_NAME=x-a1b2\n',
    )
  })
})

describe('ports held elsewhere', () => {
  it("reads host ports from a container's port bindings", () => {
    const bindings = {
      '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '5433' }],
      '80/tcp': [
        { HostIp: '127.0.0.1', HostPort: '3080' },
        { HostIp: '::1', HostPort: '3080' },
      ],
      '5672/tcp': null,
    }

    expect(boundPorts(JSON.stringify(bindings))).toEqual([5433, 3080, 3080])
    expect(boundPorts('null')).toEqual([])
    expect(boundPorts('not json')).toEqual([])
  })

  it("reads the ports in sibling folders' .env, not this folder's", () => {
    const parent = mkdtempSync(join(tmpdir(), 'env-siblings-'))

    try {
      for (const name of ['here', 'other', 'empty']) mkdirSync(join(parent, name))
      writeFileSync(join(parent, 'here', '.env'), 'APP_PORT=3000\n')
      writeFileSync(join(parent, 'other', '.env'), 'APP_PORT=3001\nMAILPIT_PORT=8026\nNAME=x\n')

      expect(siblingPorts(join(parent, 'here'))).toEqual([3001, 8026])
    } finally {
      rmSync(parent, { recursive: true })
    }
  })
})
