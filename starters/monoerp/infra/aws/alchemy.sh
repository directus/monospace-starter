#!/bin/sh
# Runs the Alchemy CLI with AWS credentials and the local Docker socket found, a heads-up on
# slow resources, a two-pass first deploy, and the stage's next steps after a deploy.
set -e
cd "$(dirname "$0")"

# Alchemy can't read an `aws sso login` session, so hand it the profile's credentials. A set
# AWS_PROFILE wins over keys already in the environment, which may be stale.
if [ -n "${AWS_PROFILE:-}" ]; then
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
fi
if [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
  if ! creds=$(aws configure export-credentials --format env 2>/dev/null); then
    echo "Not signed in to AWS${AWS_PROFILE:+ (profile $AWS_PROFILE)}. Run: aws sso login${AWS_PROFILE:+ --profile $AWS_PROFILE}" >&2
    exit 1
  fi
  eval "$creds"
fi
if ! AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null); then
  echo "AWS sign-in expired${AWS_PROFILE:+ (profile $AWS_PROFILE)}. Run: aws sso login${AWS_PROFILE:+ --profile $AWS_PROFILE}" >&2
  exit 1
fi
export AWS_ACCOUNT_ID
export AWS_REGION="${AWS_REGION:-us-east-1}"

# Alchemy talks to the Docker API directly and ignores `docker context`, so OrbStack or Colima
# sockets need to be passed as DOCKER_HOST.
if [ -z "$DOCKER_HOST" ] && command -v docker >/dev/null 2>&1; then
  DOCKER_HOST=$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)
  [ -n "$DOCKER_HOST" ] && export DOCKER_HOST
fi

case "$1" in
  deploy | destroy)
    echo "Heads-up: RDS, Valkey, and Amazon MQ take 5 to 20 minutes each and print nothing while"
    echo "they wait. Quiet output here is normal; check the RDS or ElastiCache console if unsure."
    echo
    ;;
esac

if [ "$1" = destroy ]; then
  shift
  # An online license stays bound to this stage until Monospace releases it, which it does
  # when it starts without a key. Skipped when Monospace isn't running.
  if node license-held.mjs "$@"; then
    echo "Releasing the Monospace license: restarting Monospace without its key."
    MONOERP_RELEASE_LICENSE=1 alchemy deploy "$@"
  fi
  exec alchemy destroy "$@"
fi
if [ "$1" != deploy ]; then
  exec alchemy "$@"
fi
shift

# Services can't start until the keys, license, and database users exist, and those need the
# data layer first. So a stage's first deploy runs in two passes.
first=false
status=0
node first-deploy.mjs "$@" || status=$?
if [ "$status" -ne 0 ] && [ "$status" -ne 10 ] && [ "$status" -ne 11 ]; then
  exit "$status"
fi
if [ "$status" -eq 0 ]; then
  echo "First deploy of this stage: data layer first, then keys, license, and database users."
  MONOERP_DATA_ONLY=1 alchemy deploy "$@"
  node keys.mjs "$@"
elif [ "$status" -eq 11 ]; then
  echo "Resuming this stage's unfinished first deploy."
fi
if [ "$status" -ne 10 ]; then
  first=true
  node license.mjs "$@"
  node db-init.mjs "$@"
  echo
  echo "Now the services."
fi
alchemy deploy "$@"
if [ "$first" = true ]; then
  node setup.mjs "$@"
fi
node next-steps.mjs "$@"
