# Me Ca Phe

Source code for the Me Ca Phe business management system.

## Repository location

This local Code directory corresponds to source-code/ in the GitHub repository Kaishin2701/50K142.02.3007. Repository content outside source-code/ is maintained separately.

## Project structure

- frontend/: shared application for Manager and Employee interfaces on POS and mobile devices.
- backend/: API and business modules for authentication, users, menu, orders, payments, shifts, inventory, and reports.
- database/: PostgreSQL migrations, database functions, access policies, and seed data for Supabase.
- docs/: technical documentation for the source code.

## Three-layer architecture

1. Presentation: frontend/.
2. Business logic: services within backend/src/modules/.
3. Data access: repositories within backend/src/modules/.

Each backend module will contain routes, controllers, services, repositories, and input validation as implementation begins. The database directory contains database definitions and does not represent a fourth application layer.

## Status

The frontend uses React, TypeScript, Vite, and plain CSS. A persistent application shell hosts business pages for sales, orders, accounts, schedules, inventory and reports. Forms, dialogs and checkout phases update locally within these pages. The original 209 Figma contexts remain in frontend/design-context/ as design references. Runtime components use responsive layouts, local image assets and local Plus Jakarta Sans fonts.

The backend uses Express, TypeScript, and PostgreSQL, with authentication, role checks, menu/recipes, orders/payments, shifts, inventory, closing reports, exports, and refresh events. Database migrations target Supabase PostgreSQL. The application is deployed on Render with Supabase PostgreSQL. SePay QR and authenticated transaction webhooks require bank/service configuration before real payment verification.

See backend/README.md for backend setup and docs/backend-api.md for the API contract.

## Run locally with persistent data

From this directory, with Node.js 24 or newer:

```sh
npm run setup
npm run build
npm run local
```

Open http://127.0.0.1:3000/. Generated local credentials are stored in `backend/.local/access.json`. Local PostgreSQL data persists in `backend/.local/postgres/`; both are ignored by Git. On an empty local database, this command creates two test accounts, three fictional menu items and an employee shift for today. It never populates a remote Supabase database. To prepare another day's demo, create and assign a shift using the manager account.

`npm test` runs backend business/HTTP/storage tests and frontend application interaction tests. Build first because the static-serving test checks the frontend build. DOM interaction tests cover persistence of the shell, local dialog operations, checkout restoration, scheduling and stock reconciliation. Browser visual review is a separate check.

## Frontend development

From this directory:

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. Run `npm run build` from frontend/ to check TypeScript and create a production build.

The Vite development server proxies `/api` to port 3000. Run the local server in a second terminal. See docs/deployment.md for Supabase, Render and SePay setup, and docs/frontend-design.md for design references and review limitations. Empty scaffold directories contain .gitkeep so Git can track them.

## Shop menu data

The photographed shop menu is available as an optional import: 160 item/size choices across 11 categories, with explicitly approved demo recipes and stock. No menu-management screen is added. See [docs/menu-data.md](docs/menu-data.md) for commands, omitted unreadable rows and the distinction between real menu prices and demo inventory. This import never runs automatically during startup or deployment.
