# Deploying monoERP to AWS

This folder deploys monoERP and Monospace to your own AWS account with [Alchemy](https://alchemy.run), in TypeScript. One command stands up a stage: network, databases, cache, message broker, Monospace, the monoERP app, HTTPS, alarms, and autoscaling. Another removes it.

## What you get

| Service                                                     | Staging                                                                     | Prod                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Monospace                                                   | 2 to 3 tasks, 0.5 vCPU / 1 GB                                               | 2 to 4 tasks, 1 vCPU / 2 GB                                                        |
| monoERP app                                                 | 1 task, 0.25 vCPU / 0.5 GB                                                  | same                                                                               |
| Postgres (Monospace's system database and the app database) | one `db.t4g.micro`                                                          | one Multi-AZ `db.t4g.small`, 14 days of backups, kept on destroy                   |
| Portal MySQL (stand-in for another team's database)         | one `db.t4g.micro` with demo data                                           | an empty `db.t4g.micro`; point the Portal source at your existing database instead |
| Valkey (Monospace's query cache)                            | one `cache.t4g.micro`                                                       | two nodes                                                                          |
| RabbitMQ (Monospace's cluster messages)                     | a Fargate task                                                              | Amazon MQ `mq.m7g.medium`                                                          |
| Email (invites, password resets)                            | Mailpit, a Fargate task with no public address (see Reading staging's mail) | none yet; needs a real mail service such as SES                                    |
| HTTPS                                                       | CloudFront (the app and Studio each get a `*.cloudfront.net` address)       | same until a domain is added                                                       |
| Protection                                                  | WAF on both CloudFront addresses; the load balancer only accepts CloudFront | same                                                                               |
| Alarms                                                      | emailed to `ALARM_EMAIL`                                                    | same                                                                               |

`stages.ts` holds the example sizes. Review them and estimate costs for your account before deploying.

Everything runs in private subnets. The databases, cache, and broker only accept connections from the ECS tasks.

## Before you start

1. **An AWS account** you can deploy to with admin rights, set up as an AWS CLI profile. With IAM Identity Center:
   ```sh
   aws configure sso            # once: creates the profile
   export AWS_PROFILE=<profile>
   aws sso login
   ```
2. **Tools:** AWS CLI v2, Node 24, pnpm, and Docker (Docker Desktop, OrbStack, or Colima). Docker builds the app and setup images for ARM. To read staging's mail, also the Session Manager plugin (`brew install --cask session-manager-plugin`).
3. **`.env` at the repo root** (copy `.env.example`):
   - `MONOSPACE_LICENSE__KEY`: required for deployed stages. See [license requirements](../../docs/monospace.md#license-key-and-the-free-tier). The deploy copies it into Secrets Manager; it never appears in the repo, the logs, or on a command line.
   - `ALARM_EMAIL`: optional. Where alarms are sent.
   - `LOGO_DEV_TOKEN`: optional. Company logos in the app.

   The optional `GITHUB_OIDC_SUBJECT` setting also configures a deploy role. Everything else in `.env` (ports, local passwords, `MONOSPACE_URL`, `MONOSPACE_ADMIN_EMAIL`, and so on) is for the local Docker stack and doesn't affect AWS.

4. `pnpm install` at the repo root.

Deploys go to `us-east-1`. Another region needs two changes: the CloudFront prefix list in `network.ts` (the lookup command is in the comment there), and the WAF, which CloudFront only accepts from `us-east-1`, moved to a provider for that region.

## First deploy

```sh
pnpm aws deploy --stage staging
```

RDS, Amazon MQ, and CloudFront creation can take several minutes. RDS, Valkey, and CloudFront print nothing while they wait; that's normal. In CI or other non-interactive shells, add `--no-input --yes`. `alchemy.sh` runs a stage's first deploy in this order:

1. **Pass 1:** the network and data layer (about 6 minutes).
2. **Between passes:** Monospace's JWT keys and KMS master key are generated into Secrets Manager (`pnpm aws keys`), the license is copied from `.env` (`pnpm aws license`), and the database users are created (`pnpm aws db-init`).
3. **Pass 2:** the services: Monospace, the monoERP app, the load balancer, CloudFront, alarms, autoscaling (about 5 minutes).
4. **Setup:** a one-off task loads the CRM schema (and demo data on staging) and configures the Monospace workspace (`pnpm aws setup`).

At the end it prints the app and Studio addresses and the command that shows the admin password.

The log line `AWS: using environment variables (AWS_ACCESS_KEY_ID, ...) instead of the profile` is expected: `alchemy.sh` exports your profile's credentials for Alchemy, which can't read an `aws sso login` session itself.

If you set `ALARM_EMAIL`, AWS emails a confirmation link from `AWS Notifications <no-reply@sns.amazonaws.com>`, subject "AWS Notification - Subscription Confirmation". Click it, or no alarm emails arrive. A rebuilt stage has a new topic, so it asks again.

### Back up the keys (prod)

Step 2 prints "Back up these secrets". The KMS master key encrypts the secrets Monospace stores (data source passwords, for example); without it they can't be decrypted. Prod keeps the key secrets when the stage is destroyed, but a deleted account or a manual deletion loses them. Copy the three `*JwtPrivateKey*`, `*JwtPublicKey*`, and `*KmsMasterKey*` secrets for the stage into your password manager:

```sh
aws secretsmanager list-secrets --query "SecretList[?contains(Name, 'KmsMasterKey-prod')].Name"
aws secretsmanager get-secret-value --secret-id <name> --query SecretString --output text
```

On staging this is optional: destroying staging deletes the data the key protects along with it.

## Check it works

1. Open the **app address** (the first one printed). Sign in as `admin@example.com` with the password from the printed command. You should land in monoERP; Organizations lists 40 demo companies on staging, and prod starts empty.
2. Open the **Studio address**. Studio is Monospace's own admin UI: data sources, collections, roles, users. Sign in with the same account. It has its own address because it's a single-page app that needs the site root. The first time, Studio asks you to accept its terms and then insists on creating a workspace, even though monoERP's workspace (`monoerp`) already exists. Open Studio in a new browser tab to get past it; the wizard only tracks its progress per tab.
3. Health: `https://<app address>/api/system/ready` returns 200 when Monospace and its databases are up. The load balancer uses the same check.
4. `pnpm aws probe --stage staging` checks the databases, cache, and broker answer from inside the network.

If the deploy stops partway, fix the cause and run `pnpm aws deploy` again. Once the keys exist it resumes ("Resuming this stage's unfinished first deploy") instead of starting over, so the stage keeps its address and the license binding stays valid. If only the last step (setup) failed, `pnpm aws setup` reruns just that.

Prod's first deploy is the slowest part: the Multi-AZ database and Amazon MQ take 15 to 20 minutes each.

Monospace restarts a few times during the first deploy until RabbitMQ is up. That's expected.

## Everyday commands

Add `--stage staging` or `--stage prod` to each.

| Command                 | What it does                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm aws plan`         | Shows what a deploy would change, without changing anything                                             |
| `pnpm aws deploy`       | Applies the code in this folder to the stage                                                            |
| `pnpm aws setup`        | Reruns the setup task: new CRM migrations, schema changes, Monospace config. Safe to rerun              |
| `pnpm aws probe`        | Checks every data store answers from the private subnets                                                |
| `pnpm aws mail`         | Opens staging's Mailpit inbox at http://localhost:8025 until Ctrl+C                                     |
| `pnpm aws restore-test` | Restores Postgres into a scratch instance, compares row counts with live, deletes it (15 to 30 minutes) |
| `pnpm aws db-init`      | Recreates the database users and resyncs their passwords                                                |
| `pnpm aws destroy`      | Removes the stage (see Tearing down)                                                                    |

Logs are in CloudWatch, one log group per service, kept 30 days.

## Reading staging's mail

Staging sends every email (invites, password resets) to a Mailpit task, like `docker compose` locally. It has no public address: anyone who could read it could follow a reset link. `pnpm aws mail --stage staging` opens it at http://localhost:8025 through an SSM tunnel. Mail lives in the task's memory, so a restart empties the inbox.

## Optional automation

The included CI workflow runs checks and builds without AWS credentials. Deploy explicitly with `pnpm aws deploy --stage staging` or `--stage prod`. The AWS deploy target owns `.github/workflows/deploy-aws.yml`. It skips deployment cleanly until `AWS_DEPLOY_ROLE_ARN` and `OIDC_SUBJECT` are configured. Configured deploys wait for the same commit’s successful `Check` run, then deploy main to staging or version tags to prod; verification runs once per push. The optional `pnpm aws github-oidc` helper creates the account identity provider; `GITHUB_OIDC_SUBJECT` enables a role with repo, environment, and ref-bound trust. See `github.ts` for its accepted subject format. The role has administrator access, so limit who can trigger it.

One-time setup:

1. `pnpm aws github-oidc`: creates the account's GitHub identity provider.
2. Configure this repository's OIDC subject template to include `repo`, `context`, and `ref`, in that order:
   ```sh
   gh api --method PUT repos/<owner>/<repo>/actions/oidc/customization/sub --input - <<'JSON'
   {"use_default":false,"include_claim_keys":["repo","context","ref"]}
   JSON
   ```
   This is a repository-wide setting. Update any other deploy-role trust policies that use this repository before changing it. See [GitHub's OIDC claim documentation](https://docs.github.com/en/actions/reference/security/oidc#customizing-the-token-claims).
3. Set `GITHUB_OIDC_SUBJECT` in `.env` to the exact repo subject prefix. Look it up rather than guessing, especially for repos with immutable IDs:
   ```sh
   gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq '.sub_claim_prefix // "repo:<owner>/<repo>"'
   ```
   Staging trusts only `<prefix>:environment:staging:ref:refs/heads/main`. Prod trusts only `<prefix>:environment:prod:ref:refs/tags/v*`. A branch requesting `environment: prod` cannot assume the prod role, and the old environment-only subject is refused.
4. In repository Settings > Environments, create `staging` and `prod`. Under **Deployment branches and tags**, choose **Selected branches and tags**. For `staging`, allow only the `main` branch. For `prod`, allow only tags matching `v*`, with no branch rule. These rules are required; add required reviewers to prod where your plan supports them.
5. Run the initial `pnpm aws deploy --stage staging` (and `prod`) using your local AWS credentials. This creates the ref-bound `GithubDeployRole` and prints `githubDeployRoleArn`. Set each environment's `AWS_DEPLOY_ROLE_ARN` variable to its stage's ARN.
6. Set repository variables `ALARM_EMAIL` and `OIDC_SUBJECT` (the same prefix as `GITHUB_OIDC_SUBJECT`), and secrets `LOGO_DEV_TOKEN` and `MONOSPACE_LICENSE__KEY`. Copy secrets from `.env` without printing them. The license is only read on a stage's first deploy.

## Alarms

Each alarm's email subject says what's wrong, and the first line of the body says where to look. They all live in `operations.ts`.

| Alarm                                                                 | Usually means                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Monospace has fewer healthy tasks than it needs                       | Tasks crash-looping or failing `/api/system/ready`. A single replaced task heals in under a minute and doesn't alarm |
| The monoERP app is down                                               | No app task passing health checks                                                                                    |
| Monospace is returning server errors                                  | Check the Monospace logs; database connection errors point at the database alarms                                    |
| The load balancer is returning errors                                 | No healthy target, or targets timing out                                                                             |
| Monospace is slow                                                     | p95 over 1 second for 5 minutes: usually load                                                                        |
| Postgres CPU is high, running out of CPU credits, running out of disk | Size up Postgres in `stages.ts`                                                                                      |
| The Valkey cache is nearly full                                       | Size up Valkey; it evicts, so it's slowness, not an outage                                                           |

Each alarm also emails when it clears. AWS formats these emails; for production, route the SNS topic to Slack with Amazon Q Developer in chat apps for easier reading.

## Scaling

Monospace scales out on requests per task (6,000 a minute). Tune the request target and task limits for your workload.

A deploy resets the task count to the minimum; autoscaling brings it back up if the load is still there.

## Backups

RDS keeps automatic backups with point-in-time restore: 1 day on staging, 14 on prod. `pnpm aws restore-test` proves a restore works. To restore for real, use the RDS console's "Restore to point in time" into a new instance, then point the stage at it.

The assets bucket keeps old file versions for 30 days.

## Tearing down

```sh
pnpm aws destroy --stage staging
```

If Monospace is running, it first restarts it without its license key, which releases the license activation so the key can be used again. Then it deletes the stage. CloudFront and RDS take a while to delete.

Prod keeps its Postgres database (with a final snapshot), the assets bucket, and the key material, so destroying prod by accident doesn't lose data. That also means destroying prod stops at the network: the kept database still sits in it. To remove prod completely, turn off the database's deletion protection and delete it, empty and delete the bucket, delete the three key secrets, then run `pnpm aws destroy --stage prod` again:

```sh
aws rds modify-db-instance --db-instance-identifier <monoerp-postgres-prod-…> --no-deletion-protection --apply-immediately
aws rds delete-db-instance --db-instance-identifier <monoerp-postgres-prod-…> --skip-final-snapshot --delete-automated-backups
aws rds wait db-instance-deleted --db-instance-identifier <monoerp-postgres-prod-…>
```

A destroy that fails partway is safe to rerun. Don't run `pnpm aws deploy` to "fix" a half-destroyed stage: it rebuilds everything.

## Things that will bite you

- **Changing a stage's address breaks the license.** An online activation is tied to the installation and its `MONOSPACE_BASE_URL`, and Monospace won't start with a different address (`BindingMismatch`). To move it: release the license (deploy with `MONOERP_RELEASE_LICENSE=1`), then deploy with the new address. Adding a domain later is such a move.
- **Monospace prints the admin password in its startup log** when it creates the admin, so it's in CloudWatch after a first deploy. It's the same password as the Secrets Manager one. Change it in Studio after first sign-in, then put the new one in the same secret (the one in the command the deploy prints), because `pnpm aws setup` and the load test sign in with it: `aws secretsmanager put-secret-value --secret-id <that secret> --secret-string '<new password>'`. Monospace only reads the secret when it first creates the admin, so updating it doesn't change the password by itself.
- **`aws sso login` sessions expire.** The deploy scripts say so when they do. If a shell has old `AWS_ACCESS_KEY_ID` or `AWS_SESSION_TOKEN` variables exported, they override your profile; `unset` them.
- **Docker socket:** Alchemy talks to Docker directly. `alchemy.sh` finds OrbStack or Colima through `docker context`.
- **A new workspace can briefly be unknown to one Monospace task.** Tasks tell each other about changes through RabbitMQ; a task that missed the message (for example, still connecting during a first deploy) answers `Workspace ... not found` until it rechecks the database. The setup scripts wait and retry for up to a minute.
- **Alchemy is patched** (`deploy/aws/patches/alchemy@2.0.0-beta.79.patch`, applied by `pnpm install`): 2.0.0-beta.79 stops waiting for a new RDS instance after 10 minutes, too short for Multi-AZ, and a rerun then creates a second instance instead of adopting the first. The patch waits up to 30 minutes. Drop it when Alchemy fixes the wait.
- **Staging's MySQL has backups off.** Backups turn on binary logging, which stops the demo data's helper functions loading for a non-SUPER admin. It's disposable demo data.

## Files

| File             | Holds                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| `alchemy.run.ts` | The stack: wires everything together, and the outputs the scripts read                  |
| `stages.ts`      | Sizes per stage                                                                         |
| `network.ts`     | VPC, subnets, security groups                                                           |
| `data.ts`        | Postgres, MySQL, Valkey, Amazon MQ, the assets bucket, database passwords               |
| `secrets.ts`     | Key material, the license, the admin password, optional tokens                          |
| `services.ts`    | Load balancer, CloudFront, Monospace, the app, RabbitMQ on staging, one-off tasks       |
| `operations.ts`  | WAF, alarms, autoscaling                                                                |
| `alchemy.sh`     | Wrapper: AWS credentials, Docker, the two-pass first deploy, license release on destroy |
| `*.mjs`          | The `pnpm aws <command>` commands                                                       |

Alchemy's state (what it created) lives in an S3 bucket in the account, `alchemy-state-<account>-<region>-an`, so anyone with access to the account can deploy the same stages.

CloudFront-to-load-balancer traffic uses plain HTTP in this starter. Browser-to-CloudFront traffic is HTTPS. For end-to-end HTTPS, add a domain and ACM certificate to an HTTPS listener on the load balancer before changing the origin policy.

## Package and names

The optional package is `@monoerp/aws`. `pnpm aws <command>` forwards to its scripts; run `pnpm --filter @monoerp/aws typecheck` to check it alone. Rename stack/resource IDs, database/final snapshot names, `monoerp.internal`, and the sender in this folder together. Review `pnpm aws plan` first, since identity changes may replace resources.

A module may declare `x-monoerp.demoUserCredential` to name an environment variable used by deployed setup for demo users. Supply it separately from the admin credential.

## Lint

This target adds the Effect rules in [lint](lint) while installed. The plugin is named `strict-effect`; plugin names share one namespace with core and other targets.
