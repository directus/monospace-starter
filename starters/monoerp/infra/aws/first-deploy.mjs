// Tells alchemy.sh how far a stage's first deploy got. Exits 0 for a new stage (data layer,
// keys, license, and database users come first), 11 when that part is done but the services
// never finished (resume without another data-only pass, which would delete the half-built
// services and change the stage's address), and 10 when the stage is fully deployed.
// Anything else is an error.
import { hasValue, stackOutputs } from './lib.mjs'

const outputs = stackOutputs({ optional: true })

if (outputs?.url) process.exit(10)

process.exit(outputs?.jwtPrivateKeySecret && hasValue(outputs.jwtPrivateKeySecret) ? 11 : 0)
