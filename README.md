# NexaFlow marketing website

## Local development

Prerequisites:

- Node.js 20.9 or newer
- npm

Install the locked dependencies and start the site on port 3001 so it can run
alongside the CRM frontend on port 3000:

```bash
npm ci
npm run dev -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001).

The website currently requires no environment variables. Do not copy backend
or CRM credentials into this directory. If configuration is added later,
browser-visible values must use the `NEXT_PUBLIC_` prefix and must never
contain secrets; server-only values must remain unprefixed and be read only by
server code.

## Verification

```bash
npm run lint
npm run build
```

These instructions cover local development only; they do not claim hosted or
production readiness.
