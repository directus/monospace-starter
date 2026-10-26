// Lets GitHub Actions sign in to this AWS account with short-lived credentials instead of
// stored keys. An account has one GitHub identity provider shared by every stage, so this runs
// once per account rather than in each stage's stack. Safe to rerun.
//
//   pnpm aws:github-oidc
import { aws, awsJson, signedIn } from './lib.mjs'

const account = signedIn()

const arn = `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`

const existing = awsJson('iam', 'list-open-id-connect-providers').OpenIDConnectProviderList

if (existing.some((provider) => provider.Arn === arn)) {
  console.log('GitHub sign-in is already set up for this account.')
} else {
  // AWS no longer checks the thumbprint for GitHub, but the API still wants one.
  aws(
    'iam',
    'create-open-id-connect-provider',
    '--url',
    'https://token.actions.githubusercontent.com',
    '--client-id-list',
    'sts.amazonaws.com',
    '--thumbprint-list',
    '6938fd4d98bab03faadb97b34396831e3780aea1',
  )
  console.log('GitHub sign-in set up for this account.')
}

console.log(
  'Next: configure the required repo, context, ref subject template and environment deployment rules\n' +
    'in infra/aws/README.md, then set GITHUB_OIDC_SUBJECT in .env to the output of\n' +
    '  gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq \'.sub_claim_prefix // "repo:<owner>/<repo>"\'\n' +
    'then deploy each stage to create its deploy role.',
)
