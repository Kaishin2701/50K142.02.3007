# Frontend architecture and design

## Design references

The supplied Figma file defines the visual language and business copy. Its 209 original contexts remain in `frontend/design-context/`, with node metadata in `docs/figma/screens.json`. Local image assets and Plus Jakarta Sans fonts are used by the application. [Figma design](https://www.figma.com/design/OnepPW7ISkZvDXf6bsxf52/KAI---MIS?node-id=0-1)

## Runtime structure

- `frontend/src/app/App.tsx` composes authentication, data, navigation and checkout providers.
- `frontend/src/components/AppShell.tsx` owns the persistent sidebar, profile and main content region.
- `frontend/src/features/` contains business pages and their domain dialogs.
- `frontend/src/components/ui.tsx` provides shared native controls, tables, dialogs, status messages and pagination.
- `frontend/src/services/` contains the API client and business response types.
- `frontend/src/styles/application.css` supplies the single Figma composition and shared visual tokens.
- `frontend/src/app/designViewport.ts` fits the 1440px Figma canvas to the available window width without changing page composition.

Business pages are loaded by feature. The shell stays mounted when navigating between features. Forms, field errors, calendar dialogs, category selection and checkout phases update component state within the current page.

## Navigation and state

The hash route identifies a business page, such as `#/sales`, `#/accounts` or `#/shifts`. Form submission, payment selection and dialog opening do not change the route. `legacy-routes.json` maps existing Figma-node bookmarks to the appropriate business page.

Session state is supplied by the backend through an HttpOnly cookie. Permission checks also run on the server. Session expiry clears the authenticated workspace and its in-memory data cache.

Checkout state lives above the page outlet. Unchecked cart contents and pending order identifiers are stored per user in session storage. Checked orders are restored from server snapshots, including data saved by the previous frontend. Creating an order and retrying its creation use the same idempotency key.

Each data resource cancels obsolete requests. Existing cached data remains visible during background refresh. SSE events trigger refreshes without replacing the page. A stock-count submission keeps its payload and idempotency key until the count and closing report are saved.

## Single Figma layout

Layout uses normal document flow, CSS Grid and Flexbox within one 1440px-wide composition matching the supplied desktop Figma reference. There are no narrow-desktop or mobile alternatives: the sidebar stays visible, tables keep their columns, calendars keep seven days in a row, and forms keep their desktop grids. Window resizing scales the whole document proportionally, including text, controls and native dialogs; it does not remount pages or reset checkout state. On phones this deliberately produces smaller text and controls rather than a separate mobile layout, as requested by the user.

Horizontal scrolling remains prohibited for the page and nested content. The canvas scale reserves browser scrollbar space; document-height limits use the corresponding unscaled viewport height. Dynamic long content can wrap inside its original column. Page and nested list scrolling remain vertical. All width-based media queries and container queries that changed composition have been removed; the reduced-motion preference remains supported.

The employee calendar hides ended shifts and derives remaining availability from the original registrations. It removes elapsed time and every assigned interval, keeps each remaining fragment only when it lasts at least two hours, and sorts assigned shifts and availability fragments together by start time. Fragment boundaries round inward to whole minutes to prevent displayed overlap with second-precision assignments. The clock updates at each minute boundary and when the window regains focus or visibility. Original registration records remain available for subsequent manager assignments; manager shift history remains visible. Availability may end at `24:00`, represented as midnight of the following day.

## Local Figma alignment (2026-11-11)

The local revision restores the supplied sidebar icons, typography, colors, panel spacing and table treatments. Report filters, account forms, scheduling, inventory counts and closing reports follow the corresponding Figma compositions. Cash and QR payment controls appear inside the sales processing column. Shared navigation, cached resources and checkout state remain mounted across interactions.

The report screen was visually inspected in the VS Code local preview. Automated interaction tests and an isolated local API cash-sale test passed. These checks do not establish pixel parity for every Figma state or every viewport; desktop, tablet and phone comparison remains necessary before claiming that level of fidelity. Publication of this revision was approved by the user on 2026-11-11.

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

`ME_CAFE_LOCAL_CREDENTIAL_FILE` can override the QA credential-file path when running a separate disposable local server on another port. Keep the QA database separate from the preview database.

## Account and authentication QA revision (local, 2026-11-15)

The Word QA findings are addressed in login validation, the dedicated logout dialog, account-table column allocation, read-only account details, and account creation/confirmation. Field errors use the Figma messages and red borders; duplicate username/phone errors come from the database constraints through explicit API codes, including accounts outside the current list page. The account detail dialog uses a two-column form with full-width status. Account actions stay together in the single desktop table composition.

The subsequent full Word QA revision also covers checkout and QR state reset, cash validation, an invoice preview and 80 mm PDF copies, account status updates, shift forms and availability details, stock counts and deviations, closing-report notifications and resend requests, and empty revenue states. Existing active-shift sales rules and automatic payment verification remain in effect. No database migration is required.

Validation: frontend and backend production builds succeeded; 43 frontend tests (including the real isolated local API sale integration) and 32 backend tests passed. Figma design contexts and existing assets were cross-checked. Browser comparison and actual viewport/overflow measurements remain pending because the browser host was unavailable. These automated checks do not establish pixel parity.

## Confirmation and button audit revision (local, 2026-11-15)

Confirmation actions use the dimensions and spacing of their individual Figma frames. Account lock/reactivation, shift changes, closing-report confirmation and registration cancellation have separate styles. Closing-report confirmation retains its close icon. Logout retains the divider shown in Figma; the small confirmations omit it. Empty confirmation bodies no longer add unnecessary vertical padding. Success notices use the reference border, font weight and spacing.

The low-stock message has one primary "Yêu cầu gửi lại" action. Order detail dialogs are read-only and retain "Đóng"; checkout and preparation actions stay in Sales. The shift-change form uses its close icon instead of an additional cancel action. Registration details use "Hủy" for cancellation and "Đổi hoặc xoay ca" for the existing request form. The request must reference an actual future shift assigned to the employee; when several exist, its source-shift field lets the employee choose. With no eligible assigned shift, the request action is disabled. Availability identifiers are never submitted as shift identifiers.

Validation: frontend production build passed; 46 frontend tests passed, with the opt-in local API integration test skipped. Regression coverage includes read-only order details, the closing-confirmation close action, low-stock actions and registration-to-shift request routing. The existing local preview responds with HTTP 200. This revision is local only; browser visual comparison remains pending.
