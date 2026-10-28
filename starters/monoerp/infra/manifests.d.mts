export interface SetupStep {
  title: string
  script: string
  requires?: string[]
}

interface Envelope {
  id: string
  label: string
  description: string
  ownedPaths: string[]
  requires: string[]
  requiresWhenInstalled: Record<string, string[]>
  packageEntries?: { path: string; section: string; names: string[] }[]
}

export interface Collections {
  order: number
  collections: string[]
  schemas: string[]
}

export interface FrontendFeature extends Collections {
  module: string
  slot: string
  path: string
  requires: string[]
}

interface Runtime {
  optional: string[]
  schemaFiles: string[]
  setup: { beforeSchema: SetupStep[]; afterSchema: SetupStep[] }
  compose?: string
  composeProfiles?: Record<string, string>
}

export interface ModuleManifest extends Envelope, Runtime, Collections {
  kind: 'module'
  app: string
  infra: string
  settings: string[]
  auditTables: Record<string, string[]>
  demoUserCredential?: string
}

export interface ConnectorManifest extends Envelope, Runtime {
  kind: 'connector'
  source: Record<string, SourceValue>
  frontend: FrontendFeature[]
  extension?: { directory: string; installed: string }
  migrate?: string
  provision?: string
}

type SourceValue = string | number | boolean | { [key: string]: SourceValue }

type NextStep = { script: string; when?: string } | { command: string[]; when?: string }

export interface StarterManifest extends Envelope {
  kind: 'starter'
  sourceRoots: string[]
  ignorePaths: string[]
  nextSteps: { create: NextStep[]; remove: NextStep[] }
}

export interface DeployManifest extends Envelope {
  kind: 'deploy'
  lint?: string
}

export type Manifest = StarterManifest | ModuleManifest | ConnectorManifest | DeployManifest

export const repository: URL

export function manifestPath(manifest: Manifest): string
export function readManifests(root?: URL): Manifest[]
export function requestedConnectors(modules: ModuleManifest[], override?: string): Set<string>
export function selectConnectors(manifests: Manifest[], override?: string): ConnectorManifest[]
export function resolveSource(value: SourceValue, env?: NodeJS.ProcessEnv): SourceValue
export function selectSetupStep(
  selector: string,
  manifests: Manifest[],
  selected: string[],
): (SetupStep & { owner: ModuleManifest | ConnectorManifest }) | undefined
