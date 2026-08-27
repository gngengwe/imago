# Imago

Upload a set of photos, get the strongest subset for a coherent narrative,
then a professionally enhanced version of each — with a revision loop
before you export the finals.

## How it works

1. **Upload** a batch of photos plus an optional narrative brief.
2. **Evaluate** — Claude (vision) scores each photo for narrative fit,
   technical quality, and redundancy, and recommends a subset.
3. **Enhance** — the selected photos are sent to fal.ai
   (`fal-ai/nano-banana-pro/edit`) for a professional retouch pass.
4. **Review & revise** — compare before/after, request revisions in plain
   language, approve a version as final per photo.
5. **Export** — download a zip of the approved finals.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in the keys below
npm run dev
```

Required environment variables (see `.env.local.example`):

- `ANTHROPIC_API_KEY` — Claude vision calls for evaluation.
- `FAL_KEY` — fal.ai API key for the enhancement pass. Get one at
  [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys). (OpenArt itself
  has no server-callable REST API — only an MCP/OAuth connection for agent
  sessions — so enhancement goes through fal.ai, which hosts the same
  underlying image models, instead.)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob store token, for storing uploaded
  originals and enhanced outputs.
- `ACCESS_PASSWORD` — shared passphrase gating the app (it spends paid API
  credits per use). Leave unset to disable the gate locally.

## Deploy

1. Push to GitHub (`gngengwe/imago`).
2. Create a Vercel project from the repo, add a Blob store, and set the env
   vars above in the Vercel project settings.
3. Add `imago` as a custom domain on the Vercel project; add a CNAME for
   `imago` in the `ngengwe.com` Cloudflare zone pointing at the Vercel
   deployment target Vercel gives you.
4. Verify: `curl -s -o /dev/null -w "%{http_code}" https://imago.ngengwe.com`
