// Replays the CRM's real reads (org list, org detail + portal, command search) against
// MONOSPACE_URL at stepped concurrency. Prints throughput, latency percentiles, and errors per step.
//   node load.mjs [concurrency steps, default 4,8,16,32,64] [seconds per step, default 60]
//   BYPASS_CACHE=1 sends Cache-Control: no-cache. PRINT_URLS=1 prints one URL per request kind.
// Request shapes mirror starters/monoerp/apps/web/src/modules/crm/data.ts and search.ts; keep them in sync.
import {
  authenticate,
  request,
  workspacePath,
} from "../../../starters/monoerp/infra/monospace/setup/lib.mjs";

const steps = (process.argv[2] ?? "4,8,16,32,64").split(",").map(Number);

const stepSeconds = Number(process.argv[3] ?? 60);

const bypassCache = process.env.BYPASS_CACHE === "1";

// SDK-style bracket params: {a: {b: [1]}} -> a[b][0]=1
function flatten(value, prefix, out) {
  // oxlint-disable-next-line strict/no-runtime-typeof -- walks the query literals below, not outside input
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value))
      flatten(child, prefix ? `${prefix}[${key}]` : key, out);
  } else out.push([prefix, String(value)]);

  return out;
}

const qs = (query) => new URLSearchParams(flatten(query, "", [])).toString();

const f = (...fields) => fields;

const listQuery = (offset) => ({
  fields: f(
    "id",
    "name",
    "domain",
    "industry",
    "status",
    "ownerUserId",
    "portalAccountId",
    "updatedAt",
  ),
  include: {
    owner: { fields: f("id", "fullName", "email", "avatarId") },
    deals: { fields: f("id"), filter: { status: "open" }, limit: 100 },
    portalAccount: {
      fields: f("id", "status"),
      include: {
        subscriptions: {
          fields: f("id", "status", "seats", "startedAt", "renewsAt", "canceledAt"),
          include: { plan: { fields: f("id", "code", "name", "seatsIncluded", "monthlyPrice") } },
          sort: [{ startedAt: { direction: "desc" } }],
          limit: 1,
        },
        users: { fields: f("id"), limit: 500 },
        tickets: { fields: f("id", "status"), filter: { status: "open" }, limit: 100 },
      },
    },
  },
  sort: [{ name: { direction: "asc" } }],
  limit: 50,
  offset,
});

const detailQuery = {
  fields: f(
    "id",
    "name",
    "domain",
    "industry",
    "status",
    "notes",
    "ownerUserId",
    "portalAccountId",
    "createdAt",
    "updatedAt",
  ),
  include: {
    owner: { fields: f("id", "fullName", "email", "avatarId") },
    affiliations: {
      fields: f("id", "title", "startedAt", "endedAt", "isPrimary"),
      include: { contacts: { fields: f("id", "firstName", "lastName", "email", "status") } },
      sort: [{ isPrimary: { direction: "desc" } }],
      limit: 100,
    },
    deals: {
      fields: f("id", "title", "status", "valueAmount", "currency", "expectedCloseDate"),
      include: {
        pipeline_stages: { fields: f("id", "name", "position", "color", "isClosed", "isWon") },
      },
      sort: [{ updatedAt: { direction: "desc" } }],
      limit: 100,
    },
    activities: {
      fields: f(
        "id",
        "type",
        "status",
        "direction",
        "subject",
        "body",
        "occurredAt",
        "dueAt",
        "completedAt",
        "ownerUserId",
        "organizationId",
        "contactId",
        "dealId",
      ),
      include: {
        owner: { fields: f("id", "fullName", "email", "avatarId") },
        organizations: { fields: f("id", "name", "domain") },
        contacts: { fields: f("id", "firstName", "lastName", "email") },
        deals: {
          fields: f("id", "title", "valueAmount", "currency"),
          include: { pipeline_stages: { fields: f("name") } },
        },
        attachments: { fields: f("id"), limit: 100 },
      },
      sort: [{ occurredAt: { direction: "desc" } }],
      limit: 100,
    },
  },
};

const portalQuery = {
  fields: f("id", "name", "slug", "status", "createdAt", "updatedAt"),
  include: {
    subscriptions: {
      fields: f("id", "status", "seats", "startedAt", "renewsAt", "canceledAt"),
      include: { plan: { fields: f("id", "code", "name", "seatsIncluded", "monthlyPrice") } },
      sort: [{ startedAt: { direction: "desc" } }],
      limit: 1,
    },
    users: {
      fields: f("id", "email", "name", "role", "status", "lastLoginAt"),
      include: { contacts: { fields: f("id") } },
      sort: [{ lastLoginAt: { direction: "desc" } }],
      limit: 500,
    },
    tickets: {
      fields: f("id", "subject", "body", "status", "priority", "openedAt", "resolvedAt"),
      include: {
        user: { fields: f("id", "name", "email"), include: { contacts: { fields: f("id") } } },
      },
      sort: [{ openedAt: { direction: "desc" } }],
      limit: 100,
    },
    events: {
      fields: f("id", "type", "detail", "occurredAt"),
      include: { user: { fields: f("id", "name") } },
      sort: [{ occurredAt: { direction: "desc" } }],
      limit: 100,
    },
  },
};

const or3 = (keys, q) => ({ _or: keys.map((key) => ({ [key]: { _icontains: q } })) });

const searchQueries = (q) => [
  [
    "contacts",
    {
      fields: f("id", "firstName", "lastName", "email"),
      filter: or3(["firstName", "lastName", "email"], q),
      sort: [{ lastName: { direction: "asc" } }, { firstName: { direction: "asc" } }],
      limit: 5,
    },
  ],
  [
    "organizations",
    {
      fields: f("id", "name", "industry", "domain"),
      filter: or3(["name", "industry", "domain"], q),
      sort: [{ name: { direction: "asc" } }],
      limit: 5,
    },
  ],
  [
    "deals",
    {
      fields: f("id", "title"),
      include: { organizations: { fields: f("name") } },
      filter: {
        _or: [{ title: { _icontains: q } }, { organizations: { name: { _icontains: q } } }],
      },
      sort: [{ updatedAt: { direction: "desc" } }],
      limit: 5,
    },
  ],
];

await authenticate();

const items = (collection) => `${workspacePath}/items/${collection}`;

const headers = bypassCache ? { "cache-control": "no-cache" } : {};

const get = (path) => request(path, { headers });

const orgs = (
  await request(
    `${items("organizations")}?${qs({ fields: f("id", "portalAccountId"), limit: 500 })}`,
  )
).data;

const terms = [
  "ac",
  "an",
  "co",
  "in",
  "st",
  "ma",
  "er",
  "on",
  "li",
  "te",
  "ra",
  "de",
  "tech",
  "soft",
  "data",
  "john",
  "sa",
  "ex",
];

if (process.env.PRINT_URLS) {
  const org = orgs.find((o) => o.portalAccountId);
  console.log(
    JSON.stringify({
      list: `${items("organizations")}?${qs(listQuery(0))}`,
      detail: `${items("organizations")}/${org.id}?${qs(detailQuery)}`,
      portal: `${items("accounts")}/${org.portalAccountId}?${qs(portalQuery)}`,
      searchOrgs: `${items("organizations")}?${qs(searchQueries("co")[1][1])}`,
      searchOpps: `${items("deals")}?${qs(searchQueries("co")[2][1])}`,
      simple: `${items("organizations")}?fields[0]=id&limit=1`,
    }),
  );
  process.exit(0);
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

console.log(
  `${orgs.length} organizations, cache ${bypassCache ? "bypassed" : "on"}, ${stepSeconds}s per step`,
);

// One user action = what the browser fires for it. Latency is the action's wall time.
const actions = {
  list: () => get(`${items("organizations")}?${qs(listQuery(0))}`),
  detail: async () => {
    const org = pick(orgs);
    await get(`${items("organizations")}/${org.id}?${qs(detailQuery)}`);

    if (org.portalAccountId)
      await get(`${items("accounts")}/${org.portalAccountId}?${qs(portalQuery)}`);
  },
  search: () => {
    const q = pick(terms);

    return Promise.all(searchQueries(q).map(([c, query]) => get(`${items(c)}?${qs(query)}`)));
  },
};

const mix = [
  "list",
  "list",
  "list",
  "detail",
  "detail",
  "detail",
  "detail",
  "search",
  "search",
  "search",
];

const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

for (const concurrency of steps) {
  const end = Date.now() + stepSeconds * 1000;
  const times = Object.fromEntries(Object.keys(actions).map((k) => [k, []]));
  let failed = 0;
  const errors = new Map();

  const worker = async () => {
    while (Date.now() < end) {
      const name = pick(mix);
      const started = performance.now();

      try {
        await actions[name]();
        times[name].push(performance.now() - started);
      } catch (error) {
        failed++;

        const key = String(error.message)
          .replace(/\d{4,}/g, "N")
          .replace(/\?[^ ]*/, "")
          .slice(0, 300);

        errors.set(key, (errors.get(key) ?? 0) + 1);
      }
    }
  };

  const started = new Date().toISOString().slice(11, 19);
  await Promise.all(Array.from({ length: concurrency }, worker));

  const all = Object.values(times)
    .flat()
    .sort((a, b) => a - b);

  const row = {
    at: started,
    concurrency,
    actionsPerSec: +(all.length / stepSeconds).toFixed(1),
    failed,
  };

  for (const [name, list] of Object.entries(times)) {
    list.sort((a, b) => a - b);
    row[name] =
      `p50 ${pct(list, 50).toFixed(0)} p95 ${pct(list, 95).toFixed(0)} p99 ${pct(list, 99).toFixed(0)}`;
  }

  console.log(JSON.stringify(row));

  for (const [message, count] of errors) console.log(`  ${count}x ${message}`);
}
