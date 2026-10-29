import * as AWS from 'alchemy/AWS'

import { envValue } from './secrets.ts'

// The custom GitHub subject includes repo, environment context, and ref. Legacy environment-only
// subjects cannot assume these admin roles. See the required claim setup in README.md.
export function deploySubject(subject: string, stage: string) {
  if (!/^repo:[A-Za-z0-9_.@-]+\/[A-Za-z0-9_.@-]+$/.test(subject))
    throw new Error('GITHUB_OIDC_SUBJECT must be an exact repo subject prefix')

  if (stage !== 'staging' && stage !== 'prod') throw new Error(`Unknown deploy stage: ${stage}`)
  const ref = stage === 'prod' ? 'refs/tags/v*' : 'refs/heads/main'

  return `${subject}:environment:${stage}:ref:${ref}`
}

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
            },
            StringLike: {
              'token.actions.githubusercontent.com:sub': deploySubject(subject, stage),
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
