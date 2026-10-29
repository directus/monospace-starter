import { describe, expect, it } from 'vitest'

import { deploySubject } from './github.ts'

describe('deploy role subjects', () => {
  it('limits staging to main and prod to version tags in their own environment', () => {
    expect(deploySubject('repo:owner/project', 'staging')).toBe(
      'repo:owner/project:environment:staging:ref:refs/heads/main',
    )
    const prod = deploySubject('repo:owner@123/project@456', 'prod')
    const accepts = (claim) => claim.startsWith(prod.slice(0, -1))

    expect(accepts('repo:owner@123/project@456:environment:prod:ref:refs/tags/v1.2.3')).toBe(true)
    expect(accepts('repo:owner@123/project@456:environment:prod:ref:refs/heads/main')).toBe(false)
    expect(accepts('repo:owner@123/project@456:environment:prod')).toBe(false)
    expect(accepts('repo:other/project:environment:prod:ref:refs/tags/v1.2.3')).toBe(false)
  })

  it('refuses wildcard repo prefixes and unknown stages', () => {
    expect(() => deploySubject('repo:owner/*', 'prod')).toThrow('exact repo subject prefix')
    expect(() => deploySubject('repo:owner/project', 'preview')).toThrow('Unknown deploy stage')
  })
})
