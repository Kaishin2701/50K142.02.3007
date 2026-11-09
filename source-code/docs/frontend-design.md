# Frontend design implementation

## Design authority

Figma: https://www.figma.com/design/OnepPW7ISkZvDXf6bsxf52/KAI---MIS?node-id=0-1

The Main page contains 209 visible GD screen frames across 28 sections. The hidden frame marked as outside the updated specification is excluded. The screen list and original node IDs are recorded in figma/screens.json.

All visible UI text, sample data, colors, typography, geometry, images, and SVGs come from the high-fidelity Figma design contexts. The original contexts are retained as text in frontend/design-context/. The compiler converts their styling declarations to plain CSS without installing Tailwind. Screens are grouped under frontend/src/features/.

## Preview behavior

- Start the frontend with `npm run dev` in frontend/.
- The initial screen is the empty login form.
- Authentication calls the backend and uses an HttpOnly session cookie. There is no frontend demo-password bypass. The local setup generates random credentials in `backend/.local/access.json`.
- Original Figma frames are wrapped by `DesignRoot`; native inputs, buttons and repeated rows use their original geometry. Business data replaces Figma examples. Successful mutation screens are entered after the corresponding API succeeds.
- In Vite development only, `?design` shows the original static reference markup for comparison. It does not provide authentication or permission bypasses for APIs.
- Open a particular state with `http://127.0.0.1:5173/#261:28311`, replacing the node ID with one from figma/screens.json.
- Manager calendar cards open assignment. Shift-click or right-click opens the existing edit dialog.
- The 1440 by 1024 design canvas is preserved. Smaller viewports scale it proportionally; no separate mobile layout has been invented.

## Assets and typography

Figma image and SVG assets are downloaded to frontend/public/assets/figma/. Screens use local paths. Fonts are bundled through @fontsource/plus-jakarta-sans, including Vietnamese characters and weights 400, 500, 600, and 700. Design screenshots are not used as implementation images.

## Regeneration

In frontend/:

```sh
npm run design:compile
npm run design:assets
npm run build
```

The asset manifest contains the original temporary download sources for regeneration only. They expire; refresh the Figma contexts before downloading again after expiry. Runtime source files use local assets.

## Validation and limits

Validation completed: TypeScript and the production build pass; all 209 generated screens preserve the original context content after the intended CSS/local-path conversion; all 1,740 referenced local assets exist and are non-empty; the preview endpoint returns HTTP 200. Browser visual comparison could not be completed: the host stopped Windows browser control because URL policy enforcement is not supported for the current Coc Coc browser. Pixel-level fidelity has therefore not been verified in a rendered browser.

This is the frontend design preview phase. Server authentication, authorization, database changes, real payments, stock reservations, report generation, and persistence remain backend/integration work. The interface preview must not be used to record real transactions.

All project changes remain in the local Code directory, corresponding to source-code/ in the GitHub repository. No GitHub push is performed by this design task.
