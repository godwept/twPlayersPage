# Miramichi Timberwolves Photo Gallery

A responsive roster and player photo gallery backed by one Cloudflare Worker, D1, and a private R2 bucket. The public gallery does not require sign-in. Administrative content changes require a password-protected session.

## Local development

```sh
npm ci
npm run dev
```

Local Worker storage is emulated by the Cloudflare Vite plugin. Tests use Vitest, React Testing Library, and Cloudflare’s Workers Vitest plugin.

```sh
npm run test:unit
npm run test:ui
npm run test:worker
npm run typecheck
npm run build
npm run verify
```

## Content and deployment

The supplied roster and image collection are local content inputs and are excluded from Git. See [the import instructions](docs/import.md) for their locations and filename matching rules. See [the deployment guide](docs/deployment.md) for Cloudflare resource setup, the administrator secret, and the required Free plan checks.

The design and implementation plan are in [`docs/specs`](docs/specs/2026-09-27-timberwolves-photo-gallery-design.md) and [`docs/plans`](docs/plans/2026-09-27-timberwolves-photo-gallery.md).
