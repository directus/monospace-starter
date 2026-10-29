# Capped local benchmark of Monospace with the CRM's own reads. See compose.yml for the sizes.
#   sh tooling/monoerp/bench/bench.sh up                       start the stack and run CRM setup (first time takes a few minutes)
#   sh tooling/monoerp/bench/bench.sh run <label> [steps] [s]  restart Monospace with the settings below, then replay load
#   sh tooling/monoerp/bench/bench.sh down                     remove the stack and its volumes
# Settings for `run`: MS_CPUS (default 1), THREADS (Tokio workers, default: CPU count),
# BYPASS_CACHE=1, NETEM_DELAY (default 0.25ms), OTEL=true (metrics at :18889/metrics).
# Results land in tooling/monoerp/bench/results/<label>.{load,samples}.
set -eu
cd "$(dirname "$0")/../../../starters/monoerp"
bench=../../tooling/monoerp/bench

export COMPOSE_PROJECT_NAME=monospace-bench
export MONOSPACE_PORT=18100 MONOSPACE_SYSTEM_POSTGRES_PORT=15434 APP_POSTGRES_PORT=15433
export CUSTOMER_MYSQL_PORT=13306 MAILPIT_PORT=18025 APP_PORT=13000
export MONOSPACE_ADMIN_EMAIL=admin@example.com MONOSPACE_ADMIN_PASSWORD=monospace
export MONOSPACE_URL=http://127.0.0.1:18100
node infra/compose-sync.mjs
dc() {
  if [ -f connectors/portal/connector.json ]; then
    docker compose -f docker-compose.yml -f $bench/compose.yml -f $bench/portal.bench.yml "$@"
  else
    docker compose -f docker-compose.yml -f $bench/compose.yml "$@"
  fi
}

# Every 2 s: Monospace CPU (100% = one core) and connections (active/open) per database.
sample() {
  container_id=$(dc ps -q monospace)
  while :; do
    cpu=$(docker stats --no-stream --format '{{.CPUPerc}}' "$container_id")
    sys=$(dc exec -T system-postgres psql -U postgres -d monospace -Atc \
      "select count(*) filter (where state<>'idle')||'/'||count(*) from pg_stat_activity where datname='monospace' and pid<>pg_backend_pid()")
    app=$(dc exec -T app-postgres psql -U app -d app -Atc \
      "select count(*) filter (where state<>'idle')||'/'||count(*) from pg_stat_activity where datname='app' and pid<>pg_backend_pid()")
    my=$(dc exec -T customer-mysql mysql -uroot -pmonospace -N -e \
      "select count(*) from information_schema.processlist where user='monospace_reader'" 2>/dev/null) || my=unavailable
    echo "$(date +%T) cpu=$cpu systemDb=$sys appDb=$app mysql=$my"
    sleep 2
  done
}

case "${1:-}" in
  up)
    rm -f $bench/.tokio.env
    echo "Starting monospace-bench (first run pulls images and seeds the databases)..."
    dc up -d --wait
    node infra/monospace/setup/setup.mjs
    echo "Ready: $MONOSPACE_URL. Next: sh $bench/bench.sh run <label>"
    ;;
  run)
    label=${2:?usage: bench.sh run <label> [steps] [seconds]}
    mkdir -p $bench/results
    if [ -n "${THREADS:-}" ]; then echo "TOKIO_WORKER_THREADS=$THREADS" > $bench/.tokio.env; else rm -f $bench/.tokio.env; fi
    echo "Restarting Monospace: cpus=${MS_CPUS:-1} threads=${THREADS:-auto} delay=${NETEM_DELAY:-0.25ms} bypass=${BYPASS_CACHE:-0}"
    dc up -d --wait --force-recreate monospace netem > /dev/null 2>&1
    node $bench/load.mjs 8 5 > /dev/null # warm-up
    sample > $bench/results/$label.samples 2>&1 &
    sampler=$!
    node $bench/load.mjs "${3:-8,16,32,64,128}" "${4:-30}" | tee $bench/results/$label.load
    kill $sampler && wait $sampler 2>/dev/null || true
    echo "Busiest samples:"
    sort -t= -k2 -rn $bench/results/$label.samples | head -3
    ;;
  down)
    dc down -v --remove-orphans
    rm -f $bench/.tokio.env
    ;;
  *)
    sed -n '2,8p' "$0"
    exit 1
    ;;
esac
