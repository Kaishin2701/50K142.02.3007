# Frontend architecture and design

## Design references

The supplied Figma file defines the visual language and business copy. Its 209 original contexts remain in `frontend/design-context/`, with node metadata in `docs/figma/screens.json`. Local image assets and Plus Jakarta Sans fonts are used by the application. [Figma design](https://www.figma.com/design/OnepPW7ISkZvDXf6bsxf52/KAI---MIS?node-id=0-1)

## Runtime structure

- `frontend/src/app/App.tsx` composes authentication, data, navigation and checkout providers.
- `frontend/src/components/AppShell.tsx` owns the persistent sidebar, profile, mobile navigation and main content region.
- `frontend/src/features/` contains business pages and their domain dialogs.
- `frontend/src/components/ui.tsx` provides shared native controls, tables, dialogs, status messages and pagination.
- `frontend/src/services/` contains the API client and business response types.
- `frontend/src/styles/application.css` supplies responsive layouts and shared visual tokens.

Business pages are loaded by feature. The shell stays mounted when navigating between features. Forms, field errors, calendar dialogs, category selection and checkout phases update component state within the current page.

## Navigation and state

The hash route identifies a business page, such as `#/sales`, `#/accounts` or `#/shifts`. Form submission, payment selection and dialog opening do not change the route. `legacy-routes.json` maps existing Figma-node bookmarks to the appropriate business page.

Session state is supplied by the backend through an HttpOnly cookie. Permission checks also run on the server. Session expiry clears the authenticated workspace and its in-memory data cache.

Checkout state lives above the page outlet. Unchecked cart contents and pending order identifiers are stored per user in session storage. Checked orders are restored from server snapshots, including data saved by the previous frontend. Creating an order and retrying its creation use the same idempotency key.

Each data resource cancels obsolete requests. Existing cached data remains visible during background refresh. SSE events trigger refreshes without replacing the page. A stock-count submission keeps its payload and idempotency key until the count and closing report are saved.

## Responsive layout

Layout uses normal document flow, CSS Grid and Flexbox. Desktop navigation stays visible, smaller screens use a drawer, tables become labelled rows on phones, and form fields retain readable sizes. The design is adapted from the supplied desktop references.

## Design regeneration

Run these commands in `frontend/` when updating saved design references.

```sh
npm run design:compile
npm run design:assets
```

The compiler writes static snapshots under `frontend/design-context/generated/`. It does not generate runtime pages or overwrite application routing. Temporary Figma asset URLs may need refreshing before downloading assets again.

## Verification

Run `npm run build` and `npm test` in `frontend/`. Application interaction tests use the real application entry point and mocked API responses. They check shell and list identity, dialog submissions, cart persistence across routes, order restoration, payment errors, scheduling and stock reconciliation. Resource tests cover stale responses and background refresh.

These checks verify application behavior. Visual comparison on desktop, tablet and phone requires an available browser session.

To run the application interaction test against the real isolated local API, start `npm run dev:local -- --demo --qa` in `backend/` and set `ME_CAFE_LOCAL_API_BASE_URL=http://127.0.0.1:3000` when running frontend tests. This opt-in test reads the ignored QA credential file and uses only the local QA database. It exercises both roles and the full cash-sale flow through the application components.
