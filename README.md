# سوقي — Supermarket POS SaaS

Arabic RTL supermarket point-of-sale and store operations dashboard focused on the fastest path from **scan → find → add → total → invoice → stock update**.

## Delivered in this build

- Arabic RTL operator dashboard with persistent navigation.
- POS screen optimized for USB/Bluetooth keyboard-style barcode scanners.
- Sequential barcode queue: rapid scans are processed one at a time without dropping input.
- Phone camera barcode scanning through the rear camera, with permission/error states and direct queue insertion.
- Android-first PWA shell: portrait standalone mode, install manifest, service-worker shell cache, mobile bottom navigation, and safe-area spacing.
- POS opens the camera automatically and keeps scanning active; moving the barcode out of frame re-arms the reader for the next item.
- Spoken Arabic invoice total after a successful save using the browser Speech Synthesis API.
- Duplicate barcode protection at the tenant + database unique-index level.
- Cart aggregation: scanning the same product increments quantity instead of creating a duplicate row.
- Atomic invoice creation transaction: invoice, invoice items, stock decrement, inventory movement, and audit log are committed together.
- Product catalog with name/barcode/price/stock capture and search.
- Low-stock dashboard and inventory alert screen.
- Invoice history with search and print action.
- Users, branches, subscription, settings, and super-admin navigation surfaces.
- First authenticated user provisioning: supermarket, main branch, owner, free subscription, and plan limits.
- Shared catalog within each supermarket tenant: authorized staff use the same product/customer data and can update an existing product by barcode instead of creating a duplicate.
- Tenant-scoped procedures: all product, invoice, inventory, customer, branch, and user queries are filtered by `supermarketId`.
- Role gates for `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`, and `SUPER_ADMIN`.
- Server-side validation with Zod and database-safe parameterized Drizzle queries.
- Responsive layouts and large, keyboard-friendly scan input.

## Important runtime note

This project was initialized in the current WebDev environment using its supported `web-db-user` scaffold. That scaffold provides:

- React + Vite + TypeScript + Tailwind
- Express + tRPC server procedures
- Drizzle ORM over the managed MySQL-compatible TiDB database
- Manus OAuth session authentication

The original brief named Next.js, Supabase PostgreSQL, Prisma, Supabase Auth, and Vercel. Those are not the database/auth/deployment primitives exposed by this session's WebDev runtime, so this implementation uses the supported managed equivalents rather than pretending those services are connected. The business model and tenant boundaries are kept adapter-friendly; a later migration to Supabase/Prisma can use the same table concepts and procedure contracts.

## Local development

```bash
cd /home/ubuntu/supermarket-pos-saas
pnpm install
pnpm dev
```

The managed preview URL is exposed by the WebDev project runtime. Do not start a second long-lived server on the same project port.

## Database

Schema source:

```text
drizzle/schema.ts
drizzle/migrations/
```

Generate migrations after schema edits:

```bash
pnpm drizzle-kit generate
```

The initial migration was reviewed and applied to the managed TiDB database. The JSON columns (`users.permissions`, `subscription_plans.features`, and `audit_logs.metadata`) are nullable because the managed TiDB version rejects JSON defaults; server code treats missing values as empty collections/metadata.

For future schema changes, use the project migration workflow and inspect the generated SQL before applying it. Do not insert test data through migration tooling.

## Authentication and first-login provisioning

The scaffold uses Manus OAuth and the existing server session cookie. When an authenticated user is first seen, the server provisions:

1. A supermarket tenant.
2. A main branch.
3. An `OWNER` user record (or `SUPER_ADMIN` for the configured owner open ID).
4. A free plan and active subscription.

Configured environment values are injected by the WebDev runtime. Never hardcode `JWT_SECRET`, OAuth secrets, database credentials, or service keys. Only variables explicitly prefixed `VITE_` may be exposed to the browser.

## POS verification checklist

1. Sign in through the **تسجيل الدخول** action.
2. Open **نقطة البيع**. The barcode input is focused automatically.
3. Enter a product barcode followed by `Enter` to simulate a scanner.
4. Send several barcode + Enter sequences quickly. The scan queue processes them sequentially.
5. Press **فتح الكاميرا** from the barcode area, allow camera access, and hold a barcode inside the guide. The decoded value is inserted into the same sequential queue.
6. Repeat the same barcode. Quantity increments on the existing cart row.
7. Send an unknown barcode. The cart is unchanged and a clear toast is shown.
8. Press **إنشاء الفاتورة**. The transaction saves the invoice and snapshots, decreases stock, records `SALE`, and creates an audit log.
9. After save, the browser announces aloud: `تم حفظ الفاتورة. إجمالي الفاتورة 100.00 جنيه` in Arabic when speech synthesis is available.
10. Confirm the receipt under **الفواتير** and the alert under **المخزون** if a threshold is reached.
11. Use **Ctrl + P** in the invoice screen for browser printing; add thermal/A4 printer CSS and a print template before going live with a physical printer.

Camera access requires HTTPS and a browser permission. The managed preview is HTTPS; on a local non-HTTPS origin, use the keyboard-style scanner or serve the app through a secure local tunnel.

### Android installation

Open the HTTPS app URL in Chrome on Android and choose **Add to Home screen / تثبيت التطبيق**. The app launches in portrait standalone mode at `/pos`, with the camera opened automatically for the active cashier session. The PWA shell is cacheable, but authenticated API requests and database data always remain network-backed and are never stored in the service-worker cache.

### Shared data model

Products, customers, invoices, stock movements, and users are linked by the `supermarketId` tenant. Authorized users within the same supermarket therefore see the same catalog and inventory. A product barcode is unique inside that supermarket; a duplicate barcode lookup opens the existing product for editing. Cross-tenant data is intentionally not shared, so one store cannot modify another store's catalog.

## Permissions

- `CASHIER`: POS and invoice creation; no product price editing or user management.
- `MANAGER`: POS, invoices, inventory adjustment, and operational reports.
- `ADMIN` / `OWNER`: catalog and price management plus store operations.
- `SUPER_ADMIN`: platform-level overview.

Every mutation validates the authenticated session, derives the tenant from the session user, and applies the tenant predicate in the database query. Client-provided tenant IDs are not accepted by the core POS mutations.

## Quality checks

```bash
pnpm check
pnpm test
pnpm build
```

Current verification completed in this session:

- TypeScript: passed.
- Vitest: passed (`server/auth.logout.test.ts`).
- Production Vite + server build: passed.
- Live preview screenshots: landing, POS, products, and invoices rendered successfully.

## Deployment

Use the WebDev project's managed publish/deploy flow for this initialized project. The runtime is a managed Node server with a preview URL and database provisioning. Before production use:

- Configure the OAuth redirect/client settings for the published origin.
- Confirm the database migration is applied in the target environment.
- Configure the owner open ID for super-admin access.
- Configure the printer and run a real scanner test with the intended device.
- Add a dedicated print template for 58mm, 80mm, and A4 receipts.
- Add rate limiting and operational monitoring appropriate to the final hosting environment.

## Project map

```text
client/src/pages/Home.tsx      Unified RTL dashboard and POS feature surface
client/src/index.css           Design tokens and responsive styling
server/routers.ts              Typed tenant-scoped business procedures
server/db.ts                   DB connection and tenant provisioning helpers
drizzle/schema.ts              Tenant, catalog, invoice, stock, user, plan tables
```
