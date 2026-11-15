# Seed data

`menu-photo.json` is imported only by the explicit local/QA menu command documented in [../../docs/menu-data.md](../../docs/menu-data.md). It is not a migration or an automatic seed. The importer can connect only to the embedded databases in `backend/.local/postgres/` (`--local`) or `backend/.local/qa/postgres/` (`--qa`); it never reads `DATABASE_URL`.

The photographed menu prices are imported only where a size and price are clear. Its recipes and inventory quantities are fictional test data, not the shop's real recipes or stock figures. Normal startup, deployment and the manager-account seed do not load this file.

The `npm run seed` command from `backend/` creates the first manager from the `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, and `ADMIN_PHONE` values in `backend/.env`; it refuses to overwrite an existing manager.
