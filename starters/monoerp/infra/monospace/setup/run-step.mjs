import { readManifests, repository, selectConnectors, selectSetupStep } from '../../manifests.mjs'
import { runSetupStep } from './lib.mjs'

if (process.argv.length !== 3) throw new Error('Supply one owner-qualified setup step')

const selector = process.argv[2]

const manifests = readManifests()

const selected = selectConnectors(manifests, process.env.OPTIONAL_SOURCES).map(
  (manifest) => manifest.id,
)

const step = selectSetupStep(selector, manifests, selected)

if (step) {
  await runSetupStep(
    step.title,
    () => import(new URL(`${step.owner.setupDirectory}/${step.script}`, repository)),
  )
} else console.log(`${selector}: skipped, owning module or connector is absent or disabled`)
