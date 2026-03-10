# AGENTS.md

This file orients agentic coding tools for this repository.
Keep changes aligned with existing patterns; avoid introducing new tooling unless requested.

## Repository Map
- `client/`: React + Vite + Apollo Client frontend.
- `server/`: Apollo Server + Prisma (SQLite) backend.
- `k8s/`, `Dockerfile.client`, `Dockerfile.server`, `nginx.conf`: deployment assets.

## Cursor/Copilot Rules
- No Cursor rules found in `.cursor/rules/` or `.cursorrules`.
- No Copilot instructions found in `.github/copilot-instructions.md`.

## Package Managers
- Client uses npm (`client/package-lock.json`).
- Server uses npm (`server/package-lock.json`).

## Build / Lint / Test Commands
Run commands from the appropriate directory.

### Client (`client/`)
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build` (runs `tsc -b` then `vite build`)
- Lint: `npm run lint`
- Preview build: `npm run preview`

### Server (`server/`)
- Install: `npm install`
- Dev server: `npm run dev` (uses `tsx watch`)
- Build: `npm run build` (TypeScript compile to `dist/`)
- Start prod build: `npm run start`
- Prisma generate: `npm run db:generate`
- Prisma push (SQLite): `npm run db:push`
- Tests: `npm run test` currently exits with error (no tests configured)

## Running a Single Test
- There is no test runner configured in either `client/` or `server/`.
- If tests are added later, document the single-test command here.
  - Example (if Vitest added): `npm run test -- -t "test name"`
  - Example (if Jest added): `npm run test -- -t "test name"`

## Environment
- Server reads `DATABASE_URL` (defaults to `file:./dev.db`).
- Server GraphQL endpoint runs on port `4000` in dev.
- Client Apollo HTTP link targets `http://localhost:4000`.
- SSE updates are served from `http://localhost:4001` by default; client reads `VITE_SSE_URL`.
- Local server config lives in `server/.env` (ignored); copy from `server/.env.example`.

## Code Style Guidelines (Project-Wide)
- Language: TypeScript (ESM modules).
- Indentation: 2 spaces.
- Quotes: single quotes for strings.
- Semicolons: present across most files; follow existing file style.
- Trailing commas: used where convenient, but not enforced.
- Avoid introducing formatting tools unless requested (no Prettier config).
- Prefer explicit types when inference is unclear (especially in GraphQL and Prisma code).
- Keep functions small; extract helpers when logic grows.

## Imports
- Prefer absolute package imports first, then local imports.
- Keep import lists minimal and sorted by usage scope.
- Server TS uses explicit `.js` extensions in relative imports (keep this for ESM).
- Client occasionally includes explicit `.tsx` in relative imports; match local file style.
- React hooks should be grouped and ordered consistently at the top of components.

## TypeScript Configuration
### Client
- `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`.
- `moduleResolution: "bundler"`, `verbatimModuleSyntax: true`.
- JSX runtime: `react-jsx`.

### Server
- `strict: true`, `moduleResolution: "bundler"`, output to `dist/`.
- Root source: `server/src`.

## Naming Conventions
- React components: `PascalCase` (files and component names).
- Hooks: `useSomething` (prefix `use`).
- Types/interfaces: `PascalCase`.
- Variables/functions: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` only when truly constant.
- GraphQL types and enums: `PascalCase` / `UPPER_SNAKE_CASE` in schema.
- Prisma models: `PascalCase` in schema; fields `camelCase`.

## React/Client Patterns
- Components are currently co-located in `client/src/App.tsx`.
- Apollo Client is initialized in `client/src/graphql/client.ts`.
- GraphQL operations live in `client/src/graphql/queries.ts` using `gql` strings.
- Use `useQuery`/`useMutation` from `@apollo/client/react` (Apollo Client v4).
- Keep UI state colocated with components unless shared.
- Tailwind classes are used directly in JSX; keep class order readable.
- Prefer controlled inputs and inline form layouts matching existing panels.
- Routing uses `react-router-dom` with routes declared in `client/src/App.tsx`.

## Server Patterns
- GraphQL schema lives in `server/src/schema/typeDefs.ts`.
- Resolvers live in `server/src/resolvers/index.ts`.
- Prisma client singleton is exported from `server/src/db/database.ts`.
- Do not instantiate new `PrismaClient` directly; use the singleton `prisma`.
- Job queue is abstracted in `server/src/services/JobQueueService.ts`.
- Use `emitMealEvent` for updates that should refresh SSE clients.

## Error Handling
- Prefer explicit errors for not-found conditions (`throw new Error('...')`).
- Do not swallow Prisma errors; surface them or handle with clear messages.
- Keep GraphQL resolver errors deterministic and actionable.
- Validate input early and return clear messages for missing IDs or empty payloads.

## Data Access
- Use Prisma for all DB interactions.
- Include relations explicitly in Prisma queries when needed.
- Normalize update inputs by excluding `undefined` fields before update.
- Use `$transaction` for multi-step updates that must be consistent.

## GraphQL Conventions
- Keep schema and resolvers in sync when changing fields or enums.
- Avoid breaking changes without updating client queries/mutations.
- Use `ID` for identifiers and `String` for timestamps in schema.
- Prefer `Float` for quantities and keep units as `String`.

## Formatting and Layout
- Keep JSX readable with line breaks for long props.
- Prefer early returns for empty states.
- Avoid deeply nested ternaries in JSX.
- Keep functions small; extract when logic grows.
- Reuse existing panel styles (`border`, `rounded`, `text-sm`) for consistency.

## Files to Avoid Editing
- Generated Prisma artifacts under `server/node_modules`.
- Vite cache and build outputs (`client/dist`, `server/dist`).

## If You Add Tests (Future Guidance)
- Prefer a single test runner per package (Vitest/Jest).
- Document `single test` commands once added.
- Avoid adding test tooling unless requested; keep config minimal.

## Quick References
- Client entry: `client/src/main.tsx`.
- Client UI: `client/src/App.tsx`.
- Server entry: `server/src/index.ts`.
- GraphQL schema: `server/src/schema/typeDefs.ts`.
- Prisma singleton: `server/src/db/database.ts`.
- Prisma schema: `server/prisma/schema.prisma`.

## Suggested Workflow
- Start server: `cd server && npm run dev`.
- Start client: `cd client && npm run dev`.
- Lint client before PRs: `cd client && npm run lint`.
- Build server before deploys: `cd server && npm run build`.
- After schema changes: `cd server && npm run db:push && npm run db:generate`.

## Kubernetes Notes
- Kustomize is used for non-secret config via `k8s/config.env` (ignored by git).
- Create local config: `cp k8s/config.env.example k8s/config.env`.
- Deploy with `kubectl apply -k k8s` or `./k8s/deploy.sh`.
- Secrets live in `k8s/secret.yaml` (ignored); start from `k8s/secret.example.yaml`.
