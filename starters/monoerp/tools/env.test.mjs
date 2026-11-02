import { describe, expect, it } from 'vitest'

import { envFromExample, pickPorts, projectName } from './env.mjs'

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
