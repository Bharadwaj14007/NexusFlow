# NexusFlow

NexusFlow is a multi-tenant workflow automation workspace built with Next.js, PostgreSQL, Prisma, and server actions. Organizations contain projects, tasks, documents, conversations, workflows, members, notifications, audit records, and API keys.

## Local setup

1. Install Node.js 20+ and PostgreSQL 15+ with the `vector` extension available if AI document retrieval is enabled.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` and `AUTH_SECRET`.
4. Apply the schema with `npx prisma migrate deploy` (or use `npx prisma migrate dev` during local development).
5. Start the app with `npm run dev`.

Authentication and organization context are resolved on the server. Mutations use the current session and membership rather than accepting a client-supplied organization ID.

## Optional capabilities

- `OPENAI_API_KEY` enables document embeddings, retrieval-augmented answers, and AI Workspace responses. It is only read on the server.
- `WORKFLOW_CRON_SECRET` protects `GET /api/cron/workflows`. Configure the same value in Vercel Cron or another HTTP scheduler and send `Authorization: Bearer <secret>`.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` enable invitation and workflow email delivery. Without both values, email actions fail with a controlled configuration error.
- `RAZORPAY_WEBHOOK_SECRET` enables signature verification for `POST /api/webhooks/razorpay`. Verified event IDs are persisted and duplicate deliveries are ignored. Subscription state is not changed until provider/order mapping is added to the billing model.
- `CLOUDINARY_*` is intentionally optional: the current Documents feature stores text for RAG and does not require binary file storage.
- `SENTRY_DSN` is reserved for optional error monitoring setup; it is not required to run the application.

## Main server capabilities

- Projects and tasks: tenant-scoped CRUD, Kanban status changes, comments, subtasks, dependencies, activity, and authorization.
- AI Workspace: persistent conversations, organization-scoped project/task context, document chunking, embeddings, source citations, and indexing states.
- Workflows: validated definitions, event triggers, conditions, actions, durable execution records, retries, schedules, overdue processing, replay, and cancellation.
- Organization platform: invitations, member roles, notifications, API keys stored as hashes, audit logs, and organization-wide search.

Documents are indexed asynchronously from the request's perspective. A document is searchable only after all chunks and embeddings have been written successfully; failures leave it in `FAILED` state for retry.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npx prisma validate
git diff --check
```

Runtime database, OpenAI, email, and billing checks require the corresponding local or hosted services and credentials. Never commit `.env` or provider secrets.

## Production deployment

Configure the variables in `.env.example` as Vercel project environment variables, then deploy migrations with `npx prisma migrate deploy` during the release step. Configure Razorpay to POST to `/api/webhooks/razorpay` with the same webhook secret, and configure the workflow scheduler to call `/api/cron/workflows` with its bearer secret. The credentials supplied through chat or local files must be revoked and rotated before use; this repository does not contain or consume those values.
