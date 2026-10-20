# Cloudinary signed upload hardening

## Upload signer
- `POST /api/cloudinary/sign` accepts **only** `{ "folder": "avatars"|"products"|"sliders" }`. Unknown fields/folders fail with 400 instead of silently defaulting to avatars.
- Avatars use a per-account folder `avatars/<current-user-id>`; the active DB user must exist. Catalog uploads require fresh `catalog:write` permission.
- The server generates an unpredictable 128-bit public ID and signs **every** upload parameter: timestamp, folder, public ID, allowed image formats, and `overwrite=false`. The browser appends exactly this parameter set, not the originally requested folder.
- A signature can be replayed while valid, but cannot overwrite that asset. A repeated upload with the same public ID should not create a new version. Cloudinary verifies signed request parameters itself.
- Database-backed signer rate limits per account/area (10 avatars, 40 product and 20 slider signatures per hour).
- Browser rejects non-image MIME types or files above 5 MB (avatars) / 10 MB (catalog).

## Remote URL imports
- Only `catalog:write` users can use `POST /api/cloudinary/upload-url`; avatar URL uploads are disabled.
- Accepts only externally named HTTPS hostnames, no IP literal, port, local/special domains, fragment, or URL credentials. Cloudinary performs the remote fetch. This is NOT a universal DNS rebinding defense: restrict catalog access to trusted staff.
- Rate limit: 20 imports per staff member per hour.
- Server signs the same image-only/unique-ID/non-overwrite constraints and refuses a returned non-Cloudinary asset URL.

## Production checklist
1. Confirm Cloudinary product environment supports the existing `folder` upload parameter (dynamic folders may require `asset_folder` and public ID prefix instead); verify uploads in staging.
2. Confirm `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and **server-only** `CLOUDINARY_API_SECRET` are properly set. No secret returned to the browser.
3. Run `npm run test:cloudinary`, `npm run typecheck`, `npm run lint`; simulate custom folder/forged public ID and extra upload parameters and ensure Cloudinary rejects signature.
4. **IMPORTANT:** The browser file-size check does NOT protect against forged clients using a previously issued signed policy. Signed Cloudinary upload parameters do not expose a verified `max_file_size` limit. Configure account-level storage/bandwidth quotas, delivery restrictions and monitoring in Cloudinary. To guarantee hard server-enforced per-file sizes, proxy/buffer validated uploads with a dedicated upload service rather than allowing direct browser uploads.
5. Existing images are not moved. No SQL migration is needed. Image URLs saved in other profile/catalog endpoints may still be externally supplied; reviewing URL persistence as a distinct security concern is recommended.

No live Cloudinary tenant was used and no integration/CI tests were executed in this connector-only draft.
