import { pathToFileURL } from 'node:url'
import { runSetupStep } from './lib.mjs'

await runSetupStep(process.argv[2], () => import(pathToFileURL(process.argv[3])))
