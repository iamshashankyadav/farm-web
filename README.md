# farm-web

Website for the Farm Platform, built by **Team 2**. One React app with role-based sections: farmers (V1 produce listings and orders, V2 plots and reservations), customers (V2 plot search and reservation), quality inspectors and admins.

All data comes from the shared backend ([farm-backend](https://github.com/lakshayg2005/farm-backend)) through the API gateway at `/api/v1`.
The typed API client is generated from the backend's OpenAPI specs (`pnpm gen:api`), and a mock server built from the same specs (`pnpm mock`) lets screens be built before a service is ready.

## Stack

React 18 + Vite + TypeScript, React Router, TanStack Query, Tailwind CSS, React-Leaflet (+ leaflet-draw), Vitest + Playwright, pnpm.

## Layout

```text
src/
  api/          generated client + query hooks
  features/     farmer/, customer/, inspector/, admin/, auth/, team/
  components/   shared UI
  routes/       route definitions and role guards
```

## Workflow (all repos)

- `main` is protected: changes go in only through a pull request with 1 approval.
- One issue per branch: `feat/<area>-<short-name>` or `fix/<area>-<short-name>`. Merge within 2 to 3 days.
- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`.
- Squash-merge PRs and write `Closes #<issue>` in the PR description.
- Never commit `.env`; copy `.env.example` instead.
- Issues are labelled by team (`team-app` = Team 1, `team-web` = Team 2, `team-joint`) and by member slot (`M1`–`M4` Team 1, `M5`–`M8` Team 2). Pick your slot and assign yourself.

## Getting started

Setup instructions are added by the Sprint 1 scaffold issue.
