# Tests

## Unit (pure language rules, no DB) — runs anywhere
    npm test

## End-to-end WhatsApp + payments replay (real Postgres, fake WhatsApp/Razorpay)
Wipes every table, so point it at a THROWAWAY database.

    # 1. apply migrations to the throwaway DB
    for m in prisma/migrations/*/migration.sql; do psql "$E2E_DATABASE_URL" -f "$m"; done
    # 2. engine-free test client (copy schema, add engineType + output)
    sed 's#provider = "prisma-client-js"#provider = "prisma-client-js"\n  engineType = "client"\n  output = "../.e2e-client"#' prisma/schema.prisma > /tmp/schema.e2e.prisma
    npx prisma generate --schema /tmp/schema.e2e.prisma
    npm i --no-save @prisma/adapter-pg pg
    # 3. run
    E2E_DATABASE_URL=postgresql://user:pass@localhost/throwaway npx tsx test/e2e.ts
