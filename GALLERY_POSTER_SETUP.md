# Gallery and event posters

- Public gallery: `/gallery`. Homepage displays the featured event poster.
- Admin Console includes Gallery and Event Posters tools. Uploaded image binaries live in Cloudinary; metadata is stored in PostgreSQL.

## Cloudinary setup
1. In Cloudinary, create an unsigned upload preset named `avt-gallery-upload` (or use your own name). Restrict allowed formats to JPG/JPEG/PNG/WEBP.
2. Add `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` to the **API service environment** (local `apps/api/.env` and Render/API host). The API upload endpoint uses these values; no Cloudinary API secret is required.
3. Redeploy/restart the API. Ensure API JSON body limit is 12 MB and the website origin is allowed in `WEB_URL`.
4. Deploy the migration with `npm run db:deploy` from the repository root (or let the API start command run `prisma migrate deploy`). If starter media are desired, run `npm run seed` once.
5. Log in at `/login`, then open Admin → Gallery or Event Posters. Choose a JPG/PNG/WEBP image under 7 MB and publish. Mark one event poster featured to show it on the homepage.

Never put a Cloudinary API secret in frontend code or a `NEXT_PUBLIC_` variable.
