# Initial data

Run `npm run seed` from backend/ after migrations. Supply ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_FULL_NAME, and ADMIN_PHONE in backend/.env. The command creates the first manager only; it refuses to overwrite an existing manager.

Menu prices, recipes, ingredients, and schedules must be entered from approved business data through the manager APIs. Automated tests use an isolated PostgreSQL database in memory and never seed demonstration data into the business database.
