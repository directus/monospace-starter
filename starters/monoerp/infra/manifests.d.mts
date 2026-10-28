export interface SetupStep {
  title: string
  script: string
  requires?: string[]
}

export interface PackageEntry {
  file: string
  section: 'scripts' | 'dependencies' | 'devDependencies' | 'patchedDependencies'
  entries: Record<string, string>
}

interface Envelope {
  id: string
  label: string
  description: string
  requires: string[]
  alsoOwns: string[]
  packageEntries: PackageEntry[]
  folder: string
  file: string
  ownedPaths: string[]
}

export interface FrontendFeature {
  module: string
  path: string
  requires: string[]
  collections: string[]
}

interface Runtime {
  setup: { beforeSchema: SetupStep[]; afterSchema: SetupStep[] }
  setupDirectory: string
  schemaFiles: string[]
  compose?: string
  composeProfiles: Record<string, string>
}

export interface ModuleManifest extends Envelope, Runtime {
  kind: 'module'
  app: string
  infra: string
  collections: string[]
  writes: string[]
  auditColumns: Record<string, string[]>
  demoUserCredential?: string
}

export interface ConnectorManifest extends Envelope, Runtime {
  kind: 'connector'
  source: Record<string, SourceValue>
  contributes: Record<string, { requires: string[]; collections: string[] }>
  frontend: FrontendFeature[]
  extension?: { directory: string; installed: string }
  migrate?: string
  provision?: string
}

type SourceValue = string | number | boolean | { [key: string]: SourceValue }

type NextStep = { script: string; when?: string } | { command: string[]; when?: string }

export interface StarterManifest extends Envelope {
  kind: 'starter'
  ignorePaths: string[]
  nextSteps: { create: NextStep[]; remove: NextStep[] }
}

export interface DeployManifest extends Envelope {
  kind: 'deploy'
  lint?: string
}

export type Manifest = StarterManifest | ModuleManifest | ConnectorManifest | DeployManifest

export type PartFolder = {
  kind: 'module' | 'connector' | 'deploy'
  id: string
  folder: string
  file: string
}

export const repository: URL

export const partKinds: [string, PartFolder['kind']][]

export function partFolders(root?: URL): PartFolder[]
export function readManifest(root: URL, part: PartFolder): Manifest
export function readManifests(root?: URL): Manifest[]
export function requestedConnectors(manifests: Manifest[], override?: string): Set<string>
export function selectConnectors(manifests: Manifest[], override?: string): ConnectorManifest[]
export function resolveSource(
  value: SourceValue,
  env?: Record<string, string | undefined>,
): SourceValue
export function selectSetupStep(
  selector: string,
  manifests: Manifest[],
  selected: string[],
): (SetupStep & { owner: ModuleManifest | ConnectorManifest }) | undefined
