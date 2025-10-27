# ICEBox

ICEBox is a two-part system that streamlines assignment hand‑offs between students and educators. The React front-end provides the upload and admin experiences, while a Serverless back-end on AWS handles secure storage, background zipping, notifications, and admin management.

- **Frontend** – Vite + React app with a student upload flow, rich public course search, and an invite-only admin area.
- **Backend** – Serverless Framework service using Lambda, API Gateway (HTTP API), DynamoDB, S3, Cognito, SQS, and SES.
- **Asynchronous archives** – Uploads finish quickly; an SQS-driven processor zips files, deletes originals, and emails the educator/student when complete.

![Architecture](docs/media/architecture.png) <!-- Replace or remove if no diagram is available -->

---

## Repository layout

| Path        | Description                                                            |
|-------------|------------------------------------------------------------------------|
| `frontend/` | Vite + React application (student upload UI and admin console)         |
| `backend/`  | Serverless service with TypeScript Lambda handlers                     |
| `docs/`     | Additional documentation (e.g., `docs/deploy.md`)                      |
| `integration/` | Integration helpers/scripts (if any future automation is added)    |

---

## Features

- Drag-and-drop uploads with folder support and consolidated progress indicators.
- Asynchronous archive creation (zip + cleanup) processed via SQS/Lambda to avoid API timeouts.
- HTML email templates (SES) for educator, student, and admin communications.
- Invite-only admin portal backed by Cognito with user management (invite, edit, reset password, delete).
- Course assignment CRUD with search, sort, pagination, and guard rails for deleting.
- S3 lifecycle management: transition uploads to Glacier after 30 days, purge after 180.
- Front-end theme controls, reusable UI primitives, and course dropdowns populated from DynamoDB.

---

## Prerequisites

- **Node.js 20.x** (aligned with Lambda runtime) and **npm 9+**
- **AWS CLI** and credentials with permissions to deploy serverless stacks, create S3 buckets, CloudFront distributions, ACM certificates, etc.
- **Serverless Framework CLI** (`npm install -g serverless`) if deploying manually
- **dotenv-cli** is installed as a dev dependency in both apps for loading stage-specific env files.

---

## Getting started (local development)

### 1. Clone and install

```bash
git clone <repo-url>
cd ICEBox

# Front-end
cd frontend
npm install

# Back-end
cd ../backend
npm install
```

### 2. Configure environment variables

#### Backend (`backend/.env.dev`)

Copy or create `.env.dev` with values like:

```
AWS_REGION=eu-south-1
STAGE=dev
SES_SOURCE_EMAIL=verified-sender@example.com
ASSIGNMENTS_BUCKET=icebox-dev-assignments
ASSIGNMENTS_TABLE=icebox-dev-metadata
COURSES_TABLE=icebox-dev-courses
SECRETS_PREFIX=/icebox/dev/
ADMIN_PORTAL_URL=http://localhost:5173/admin   # optional override
```

For other stages create `.env.<stage>` (e.g., `.env.prod`) and the deploy scripts will load them automatically.

#### Frontend (`frontend/.env.local`)

Create `.env.local` for local dev:

```
VITE_API_BASE_URL=http://localhost:3000    # or deployed dev API
VITE_ADMIN_USER_POOL_ID=eu-south-1_XXXXX
VITE_ADMIN_USER_POOL_CLIENT_ID=XXXXXXXX
VITE_ADMIN_USER_POOL_REGION=eu-south-1
```

For production builds use `.env.prod` (see deployment section).

### 3. Run the dev servers

```bash
# Back-end (invoke or deploy to dev)
cd backend
npm run lint         # Type-check Lambda handlers
npm run deploy:dev   # Deploy to dev (loads .env.dev automatically)

# Front-end
cd ../frontend
npm run dev          # Start Vite dev server on http://localhost:5173
```

---

## Deployment summary

A full production deployment involves publishing both the Serverless stack and the static front-end. A detailed step-by-step guide lives in [`docs/deploy.md`](docs/deploy.md). Below is the high-level flow.

### Back-end

```bash
cd backend
cp .env.dev .env.prod   # adjust values for prod
npm run deploy:prod     # dotenv-cli loads .env.prod then runs serverless deploy --stage prod
```

This provisions/updates S3 buckets, DynamoDB tables, SQS queues, Lambda functions, Cognito resources, and API Gateway routes for the `prod` stage.

### Front-end

Host the built assets in an S3 bucket fronted by CloudFront with an ACM certificate (us-east-1) for `https://icebox.icecampus.com`. Once the bucket and distribution exist:

```bash
cd frontend
cp .env.local .env.prod            # update with prod endpoints & user pool ids
npm run deploy:prod                # builds, syncs dist/ to S3, invalidates CloudFront
```

Refer to [`docs/deploy.md`](docs/deploy.md) for certificate creation, CloudFront configuration, DNS, and GitHub Actions automation.

---

## Environment variables reference

### Backend

| Key                     | Description                                                                                               |
|-------------------------|-----------------------------------------------------------------------------------------------------------|
| `AWS_REGION`            | Deploy region (defaults to `eu-south-1` if not provided)                                                  |
| `STAGE`                 | Serverless stage (e.g., `dev`, `prod`)                                                                    |
| `SES_SOURCE_EMAIL`      | Verified SES identity for outbound emails                                                                 |
| `ASSIGNMENTS_BUCKET`    | Name of the S3 bucket for uploads (usually `icebox-<stage>-assignments`)                                  |
| `ASSIGNMENTS_TABLE`     | DynamoDB table for submission metadata                                                                    |
| `COURSES_TABLE`         | DynamoDB table for course assignments                                                                     |
| `SECRETS_PREFIX`        | Optional Secrets Manager prefix (defaults to `/icebox/<stage>/`)                                          |
| `ADMIN_PORTAL_URL`      | URL rendered in admin invite/reset emails (defaults to `https://icebox.icecampus.com/admin`)              |
| `SERVERLESS_ORG/APP`    | Override Serverless org/app if you use a different Org/App                                               |
| Cognito env vars        | Injected automatically from CloudFormation (User Pool ID, Client ID, Region, Audience)                    |

### Frontend

| Key                               | Description                                                          |
|-----------------------------------|----------------------------------------------------------------------|
| `VITE_API_BASE_URL`               | Base URL for the API Gateway stage                                   |
| `VITE_ADMIN_USER_POOL_ID`         | Cognito User Pool ID for admin authentication                        |
| `VITE_ADMIN_USER_POOL_CLIENT_ID`  | Cognito app client id                                                |
| `VITE_ADMIN_USER_POOL_REGION`     | Cognito region (optional if same as pool id prefix)                  |

---

## Development tasks

- **Type checking** – `npm run lint` in both `backend/` and `frontend/`.
- **React app build** – `npm run build` (or `npm run build:prod`) in `frontend/`.
- **Serverless invoke** – `serverless invoke local --function <name>` for local handler tests after building.
- **Archive processor testing** – upload multiple files and confirm the UI polls until status is `COMPLETED`; monitor the `processUploadArchive` Lambda logs in CloudWatch.

---

## Admin portal highlights

- Invite admins via the `/admin/users` page.
- Display names auto-fill from given/family names but remain editable.
- Admin invites and password resets send HTML email via SES with the shared design.
- Resetting an admin password generates a new temporary password, emails the admin, and enforces a new password on next login.
- Status badges reflect Cognito state (e.g., `CONFIRMED`, `FORCE_CHANGE_PASSWORD` shown as “Temp Password”, `UNCONFIRMED`).

---

## Upload flow (student-facing)

1. Student arrives via a URL that may prefill query parameters (`studentEmail`, `studentName`, `class`, `studentId`).
2. Required fields adjust dynamically:
   - Prefilled data hides redundant inputs.
   - Missing parameters require manual entry.
   - Course codes populate from public courses (grouped by course name); unknown codes prompt a dropdown with warnings.
3. Files can be dropped individually or as folders; UI groups folder uploads into a single progress row.
4. After uploads complete, the API returns `PENDING_ARCHIVE` and the frontend polls `/uploads/{submissionId}` until `COMPLETED`.
5. Once archived, the UI reveals the download link(s); educator/student emails contain matching links.

---

## Testing & monitoring checklist

- Upload flow with single and multiple files.
- Admin invite, edit, reset password, delete actions.
- Queue processing & DLQ (CloudWatch alarms recommended).
- SES bounce complaints (monitor in the SES console).
- CloudFront cache invalidations after deployments.

---

## Deployment playbook

See [`docs/deploy.md`](docs/deploy.md) for an end-to-end production rollout covering:
- ACM certificate creation and validation
- S3 + CloudFront configuration with custom domain
- DNS updates
- Back-end and front-end deploy commands
- Optional GitHub Actions automation
- Post-deployment smoke tests

---

## Contributing

1. Branch from `main`, keep PRs focused.
2. Run `npm run lint` in `backend/` and `frontend/` before pushing.
3. Update documentation (especially this README and `docs/`) if behaviour or env requirements change.

---

## Licence

ICEBox is released under the GNU AFFERO GENERAL PUBLIC LICENSE licence – see [`LICENCE`](LICENCE) for details.
