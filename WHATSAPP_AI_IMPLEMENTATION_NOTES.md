# WhatsApp AI implementation notes

## Changes made

- Added verified Trust knowledge sourced from this repository's About, Activities, Contact, and Donate pages.
- Added `npm run prisma:seed-knowledge -w apps/api`, which only creates/updates the `Trust FAQ & Policies` KnowledgeDocument. It does not reset admin credentials or seed sample products.
- Updated the assistant service to load active products from the database and use order/donation records only when the supplied WhatsApp phone matches the record owner and an exact reference is provided.
- Added Hindi/Hinglish intent patterns for donation, product, order, and human-support messages.
- Added safe fallback messages when Gemini is not configured, Gemini errors, or verified records are unavailable.
- Passed the sender phone into the assistant from the WhatsApp webhook and assistant routes.
- Excluded the three known demo product slugs created by the existing seed from AI product answers so the assistant does not advertise those demo records as real products.
- No Prisma schema or migration changes were made.

## Deploy/run steps

1. Ensure the API's production environment has a valid `DATABASE_URL` and `GEMINI_API_KEY` configured. Never put secrets in source code or share them in chat.
2. Deploy the code.
3. Run `npm run prisma:seed-knowledge -w apps/api` once against the intended production database. This command only updates the Trust knowledge document.
4. Test the live WhatsApp flow with a general Trust question, product query, an order number owned by the sender, a mismatched order number, a donation reference owned by the sender, and an unknown donation reference.

## Audit limitations

The source was statically reviewed. A full TypeScript/Prisma build could not be completed in this environment because dependency installation timed out and the Prisma CLI was unavailable. Do not treat this as a successful build or deploy until CI/build succeeds. No live database or production WhatsApp credentials were used, and no production data was changed.

The current assistant requires a Gemini API key for natural-language answers from the knowledge document. Without the key, it uses conservative fixed fallbacks. The AI does not crawl the live website at runtime; the knowledge is stored in `KnowledgeDocument`.
