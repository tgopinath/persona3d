# Persona3D Studio

Turn photographs of a person into a textured, rigged, animated 3D character you can inspect, customise and export.

Out of the box the app runs with **no accounts and no API keys** (local mode + Demo provider). Add a Meshy key for real photo-to-3D reconstruction, and Supabase keys for accounts, Postgres and private cloud storage.

```bash
npm install
npm run dev            # http://localhost:3000
```

## What works today

| Area | Status |
| --- | --- |
| Guided creation (6 angles, drag-drop, camera capture, progress, replace/remove) | Working |
| Photo quality analysis (resolution, lighting, blur, face visibility, background, cross-photo consistency) | Working, client-side estimates |
| Styles, realism, body type and custom proportions, keep-from-photo options | Working |
| Generation jobs: persisted stages, real provider progress only, cancel, retry from failed stage, refresh-safe | Working |
| Demo provider: rigged parametric GLB (19-bone skeleton, morph targets, 26 clips) | Working, clearly labelled |
| Meshy provider: multi-image-to-3D, PBR textures, auto-rigging, walk/run clips | Implemented to the documented API; **not run against a live key yet** |
| Tripo provider | Experimental adapter, unverified |
| 3D viewer: orbit/zoom/pan, 6 camera views, 5 lighting presets, 5 backgrounds, full screen, look-at-cursor, auto-blink, expressions | Working |
| Animation Studio: 26 clips (basic, sports, fun), play/pause/speed/loop, sequences, return to idle, prompt → preset sequence | Working |
| Customisation: colours, skin finish, expressions, accessories, outfits, height/head size; only controls the model supports | Working |
| Export: GLB, GLTF, OBJ, PNG (incl. transparent), MP4/WebM animation and 5/10/15 s turntables, export history | Working |
| FBX export, mesh decimation | Needs the Blender worker (not bundled) |
| Text-to-motion AI | Not configured; prompts map to labelled presets |
| Auth (email/password, reset, Google), RLS, private storage, signed URLs | Implemented; local mode verified, Supabase mode not run against a live project yet |

## Modes

**Local mode** (default): one studio user, JSON database and files in `.data/`, files served through HMAC-signed links that expire after an hour. Good for development and demos.

**Supabase mode**: set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, then apply `supabase/migrations/0001_persona3d.sql`. Every API call requires a Supabase access token; data goes to Postgres and a private storage bucket.

## Configuration

Copy `.env.example` to `.env.local`. All keys are read on the server only; the browser only ever sees `NEXT_PUBLIC_*` values (the Supabase URL and anon key).

| Variable | Purpose |
| --- | --- |
| `MESHY_API_KEY` | Enables the Meshy provider (becomes the default) |
| `TRIPO_API_KEY` | Enables the experimental Tripo adapter |
| `PERSONA3D_PROVIDER` | Force the default provider: `demo`, `meshy` or `tripo` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase mode |
| `SUPABASE_STORAGE_BUCKET` | Private bucket name (default `persona3d-private`) |
| `NEXT_PUBLIC_GOOGLE_AUTH` | Show “Continue with Google” (enable the provider in Supabase first) |
| `PERSONA3D_MAX_UPLOAD_MB` | Per-photo limit (default 15) |
| `PERSONA3D_RATE_LIMIT_PER_MIN` | Per-user API rate limit (default 30) |
| `PERSONA3D_RETENTION_DAYS` | Default photo retention (7/30/90/365) |
| `PERSONA3D_SIGNING_SECRET` | Signs local file links. **Set this outside development.** |
| `PERSONA3D_IN_PROCESS_WORKER` | `false` when a separate worker runs jobs |
| `PERSONA3D_DEMO_STAGE_DELAY_MS` | Pause between demo stages so they're visible (demo only) |

## Provider evaluation

Checked against public docs on 18 Nov 2026. Re-check prices, limits and licence terms before production.

| Service | Fit | Notes |
| --- | --- | --- |
| **Meshy** (`multi-image-to-3d`, `rigging`) | Default real provider | 1–4 views as URLs or data URIs; geometry and PBR textures in one task with 0–100 progress; humanoid auto-rigging (≤380k triangles, textured GLB, facing +Z) returns a rigged GLB plus walking/running clips. Credit-billed. |
| **Tripo** (`multiview_to_model`, `animate_rig`) | Alternative | Four ordered views (front, left, back, right). Adapter written, not yet verified with a live key. |
| Rodin / Hyper3D | Candidate | Multi-view reconstruction with good detail; add as a `MultiViewReconstructionProvider`. |
| Mixamo | Not used directly | No public API. The app's skeleton map already understands Mixamo bone names, so Mixamo-rigged GLBs animate. |
| Blender (headless) | Planned worker | FBX conversion and decimation. Not bundled; the UI says so instead of pretending. |

## Architecture

```
Browser (Next.js, React, R3F)                Server (Next.js route handlers)            Worker (in-process or `npm run worker`)
─────────────────────────────                ───────────────────────────────            ──────────────────────────────────────
Wizard ──photos──▶ /api/characters/:id/photos ─▶ ImageUpload + ImageValidation ─▶ Storage (local │ Supabase, private)
       ──settings─▶ /api/characters/:id/generate ─▶ GenerationJob (queued) ──────────────▶ Runner leases job, runs stages:
Poll ◀── /api/jobs/:id ◀───────────────────────── persisted stage state ◀──────────────── analyse → appearance → geometry →
                                                                                         texture → rig → animations → finalise
Viewer ◀── signed GLB URL                                                                 via provider adapters (Demo, Meshy, Tripo)
Exports (GLB/GLTF/OBJ/PNG/MP4 rendered from the live scene) ─▶ /api/characters/:id/exports
```

- **Provider adapters** (`src/server/providers`): `ImageTo3DProvider`, `MultiViewReconstructionProvider`, `TextureProvider`, `RiggingProvider`, `MotionGenerationProvider`. Each covers auth, input validation, job creation, polling, result download, retries (network, 429, 5xx with backoff) and usage tracking. The pipeline only talks to these interfaces.
- **Services** (`src/server/services`): ImageUpload, ImageValidation, MultiViewAnalysis, CharacterGeneration, TextureGeneration, MeshOptimization, CharacterRigging, AnimationGeneration, CharacterExport, VideoRendering.
- **Jobs** (`src/server/jobs`): each stage is saved before and after it runs, with provider task ids. Refreshing the browser or restarting the server resumes polling rather than starting over. Retrying restarts from the failed stage. Progress shown is what the provider reports; if it reports only queued/running, the UI says that.
- **Completed work is kept**: the model is stored and viewable as soon as geometry succeeds, even if rigging later fails.
- **Animation** (`src/lib/animation`): clips are defined against a canonical 19-bone skeleton and sampled into real three.js keyframe tracks, then retargeted by bone name (Mixamo, Meshy, UE-style aliases). A rig without the required bones is reported as not animatable; no animation is faked.
- **Demo provider**: builds a parametric character (style-driven proportions, colours sampled from the photos) as a real skinned GLB. It is not a likeness of the person, and the UI labels it everywhere.

## Privacy and security

- **Public demo guard**: local mode keeps one shared studio, so on a public host (Vercel, or `PERSONA3D_PUBLIC_DEMO=true`) without Supabase the server refuses photos and the create page explains why; only the sample character, built in the browser, is shown. Set `PERSONA3D_ALLOW_SHARED_LOCAL=true` only for a private, password-protected deployment.
- Ownership and processing consent are required before upload and before generation.
- Photos and models are private; access is only through signed URLs (1 hour).
- File type is checked by magic bytes, plus size and minimum resolution. Only JPEG/PNG/WEBP are stored; nothing is served inline with a sniffable type. Hook an AV scanner into `ImageValidationService` if your threat model requires it.
- Per-user rate limits on uploads, generation and exports (in-process; use Redis or similar across instances).
- Users can delete photos, characters or their whole account, and choose a photo retention period. Training use is off unless the user turns it on.
- RLS policies and a private bucket with per-user prefixes are in `supabase/migrations`.

## Deployment

1. Supabase: create a project, run the migration, enable the auth providers you want.
2. Vercel: deploy the Next.js app with the environment variables above and `PERSONA3D_IN_PROCESS_WORKER=false`.
3. Worker: run `npm run worker` on a long-running host (Fly, Render, a VM) with the same environment. Generation can take minutes, longer than serverless timeouts allow.

## Testing

```bash
npm test               # unit + pipeline integration tests (vitest)
npm run typecheck
npm run lint
npx tsx scripts/e2e.mts   # full browser journey in headless Chrome; needs `npm run dev -- -p 3410`
```

The e2e script uploads two photos, walks every wizard step, generates, opens the viewer, plays animations and a prompt sequence, saves a customisation, exports GLB, PNG and an MP4 turntable, and checks mobile layouts.

## Roadmap

| Phase | Status |
| --- | --- |
| 1. UI foundation: shell, dashboard, library, responsive layouts | Done |
| 2. Photo upload: angles, previews, guidance, validation, storage | Done |
| 3. AI generation: adapters, jobs, assets | Done for Demo; Meshy needs a live-key test |
| 4. 3D viewer: GLB loading, cameras, lighting, environment | Done |
| 5. Rigging and animation: skeleton validation, library, playback, retargeting | Done; retargeting onto third-party rigs needs per-rig tuning |
| 6. Customisation: materials, accessories, outfits | Done for supported controls |
| 7. Export: GLB/GLTF/OBJ/PNG/MP4, turntable | Done; FBX waits on the Blender worker |
| 8. Production readiness: auth, RLS, tests, deployment | Code done; needs a live Supabase project, error monitoring (e.g. Sentry) and a shared rate-limit store |

Next steps: run the Meshy path end-to-end with a real key, add the Blender worker (FBX, decimation), connect a text-to-motion provider behind `MotionGenerationProvider`, and add error monitoring.
