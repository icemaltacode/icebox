# ICEBox

ICEBox is a monorepo that combines a React front-end with an AWS Serverless back-end to streamline the submission, storage, and retrieval of student coursework. Students upload assignment folders through the web interface, while the back-end provisions secure pre-signed upload targets, persists metadata, notifies educators, and now ships with an invite-only admin area for course management.

## Features
- Student-facing upload flow built with Vite, React, and the TanStack query cache
- Invite-only admin console for assigning educators to courses and managing admin access (Cognito + React)
- Serverless API backed by AWS Lambda, API Gateway, DynamoDB, S3, SES, Cognito, and Secrets Manager
- Pre-signed upload sessions that keep large file transfers off the API tier
- Email notifications and download links that expire automatically for better security

## Repository Structure
- `frontend/` – Vite + React application, Tailwind UI primitives, API client
- `backend/` – Serverless Framework service with Lambda handlers under `src/functions`
- `src/` – Reserved for future shared libraries between packages

## Prerequisites
- Node.js 20.x (aligns with the Lambda runtime configured in `serverless.ts`)
- npm 9+ (or your preferred package manager) available on your PATH
- AWS credentials with permissions to deploy the Serverless stack (for back-end work)
- Serverless Framework CLI (`npm install -g serverless`) if you plan to deploy

## Getting Started
Install dependencies for the two workspaces:

```bash
cd frontend
npm install

cd ../backend
npm install
```

### Front-end
1. Create a `.env` file in `frontend/` with the API endpoint you want to target:
   ```bash
   VITE_API_BASE_URL="https://your-api.example.com"
   VITE_ADMIN_USER_POOL_ID="eu-south-1_XXXXXXXXX"
   VITE_ADMIN_USER_POOL_CLIENT_ID="yourWebClientId"
   # Optional override – defaults to the region embedded in the pool id
   VITE_ADMIN_USER_POOL_REGION="eu-south-1"
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open the URL printed by Vite (defaults to `http://localhost:5173`).

Linting and production build commands:
```bash
npm run lint
npm run build
```

### Back-end
The back-end is deployed with the Serverless Framework and bundles TypeScript Lambda handlers.

```bash
cd backend
npm install
npm run lint        # Type check without emitting files
npm run deploy:dev  # Deploy to the "dev" stage (requires AWS credentials)
```

Deployment relies on several environment variables (the Cognito values are injected automatically from CloudFormation, but are required if you invoke handlers locally):

- `SES_SOURCE_EMAIL` – Verified SES identity used when emailing educators
- `SECRETS_PREFIX` – Optional custom prefix for AWS Secrets Manager keys
- `ADMIN_USER_POOL_ID` – Cognito User Pool ID used for admin authentication
- `ADMIN_USER_POOL_CLIENT_ID` – Cognito app client id for the admin web application
- `ADMIN_USER_POOL_REGION` – Region for the Cognito User Pool (defaults to the Lambda region)
- `ADMIN_USER_POOL_AUDIENCE` – Optional override for expected JWT audience (defaults to the client id)
- `SERVERLESS_ORG` / `SERVERLESS_APP` (or CLI flags) if you use an alternative Serverless org/app

The stack provisions:
- S3 bucket for uploaded assignment artifacts (`icebox-<stage>-assignments`)
- DynamoDB tables for submission metadata and course lookups
- Cognito User Pool and web client for invite-only admin access
- HTTP API routes for creating upload sessions, finalising uploads, listing submissions, and generating download URLs
- Admin HTTP API routes for listing, creating, updating, and deleting course assignments

### Local Invocation
For quick handler tests you can use `serverless invoke local --function <name>` from the `backend/` directory after building.

## Admin onboarding

1. Deploy the updated stack so the Cognito resources are created.
2. Invite admins through the Cognito console or CLI (`aws cognito-idp admin-create-user`) to send a temporary password email.
3. Share the front-end environment variables above with the admin front-end so the `/admin` route can authenticate against the pool.
4. Admins sign in at `/admin`, complete the new password challenge, and manage course assignments (search, sort, paginate, edit, delete) as well as invite additional admins via `/admin/users`.

## Contributing
1. Branch from `main` and keep changes scoped.
2. Run the relevant lint/build commands before raising a PR.
3. Update documentation (including this README) when behaviour changes.

## Licence
This project is released under the ISC licence. See `LICENCE` for details.
