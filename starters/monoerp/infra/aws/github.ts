import * as AWS from 'alchemy/AWS'
import { envValue } from './secrets.ts'

// The role GitHub Actions assumes to deploy this stage. Only workflow jobs in the repo named by
// GITHUB_OIDC_SUBJECT that run in the GitHub environment named after the stage can use it, so
// prod's rules (set on the environment in GitHub) guard prod's role. GITHUB_OIDC_SUBJECT is the
// repo's subject prefix as GitHub reports it: `repo:owner/name`, or with IDs
// (`repo:owner@123/name@456`) for repos on immutable subjects. Needs `pnpm aws:github-oidc` once
// per account. Skipped when GITHUB_OIDC_SUBJECT isn't set.
export const GithubDeployRole = (stage: string) => {
  const subject = envValue('GITHUB_OIDC_SUBJECT')
  const account = process.env.AWS_ACCOUNT_ID

  if (!subject || !account) return undefined

  return AWS.IAM.Role('GithubDeployRole', {
    description: `GitHub Actions deploys of ${stage} from ${subject}`,
    assumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Federated: `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`,
          },
          Action: ['sts:AssumeRoleWithWebIdentity'],
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': `${subject}:environment:${stage}`,
            },
          },
        },
      ],
    },
    // A deploy creates and deletes everything in the stack (networks, databases, IAM roles),
    // so the role needs broad rights. Narrow it to the services in this folder if your
    // account holds other things.
    managedPolicyArns: ['arn:aws:iam::aws:policy/AdministratorAccess'],
  })
}
