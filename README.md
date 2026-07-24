# Keepsake (React)

A cozy little place for your pictures, videos, and favorite songs — rebuilt in React + Vite, with Supabase for auth, database, and storage. The Pictures screen uses a rotating 3D dome gallery.

## 1. Local setup

```bash
npm install
cp .env.example .env   # already pre-filled with your Supabase project — check it's correct
npm run dev
```

Opens at `http://localhost:5173`.

## 2. Supabase requirements

You should already have this set up from the vanilla version, but double check:

**Storage**
- A bucket named `media`, set to **Public** (Storage → media → toggle "Public bucket"). This is required — `getPublicUrl()` only returns working links for public buckets.

**Tables** (adjust if yours differ)
- `media_items`: `id`, `user_id`, `kind` (`"image"` | `"video"`), `storage_path`, `file_name`, `created_at`
- `favorite_songs`: `id`, `user_id`, `url`, `platform`, `created_at`

**Row Level Security**
- Both tables should have RLS enabled, with policies that scope `select`/`insert`/`delete` to rows where `user_id = auth.uid()`.
- Storage bucket policies should similarly scope uploads to `auth.uid()`-prefixed paths (the code uploads to `{userId}/images/...` and `{userId}/videos/...`).

## 3. Deploy to Vercel

```bash
npm i -g vercel   # if you don't have it
vercel
```

Or connect the GitHub repo in the Vercel dashboard. Either way, add these two Environment Variables in your Vercel project settings (Settings → Environment Variables), same values as your `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Vercel auto-detects Vite — build command `vite build`, output directory `dist`. No extra config needed.

## What changed from the vanilla JS version

- Everything is now a proper React component tree (`Auth`, `Desk`, `PicturesScreen`, `VideosScreen`, `MusicPanel`, `DomeGallery`) instead of manual DOM manipulation in `app.js`.
- The dome gallery is the official React + `@use-gesture/react` version, and images load `eager` (no more browser lazy-load interventions silently blanking tiles).
- No service worker / offline caching this time — that was the source of the "my edits aren't showing up" pain before. If you want offline support back later, it's worth adding deliberately with `vite-plugin-pwa` rather than a hand-rolled cache-first worker, since Vite can then fingerprint asset filenames and the cache busts itself automatically on every deploy.
- Visual refresh: swapped the cream/terracotta palette for a slightly more distinctive "heirloom" look — warm linen background, brass accents, and a wax-seal stamp as the upload button (the recurring signature element). Card and folder tops have a subtle torn-paper edge.
