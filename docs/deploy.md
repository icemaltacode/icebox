# Production Deployment Guide

This document walks through promoting ICEBox to production. The flow covers both the Serverless back-end stack and the static front-end hosted on S3 + CloudFront at `https://icebox.icecampus.com`.

---

## 1. Back-end (Serverless)

### Prerequisites
- AWS credentials with permission to deploy the `icebox` Serverless stack.
- Production-specific environment values:
  - `SES_SOURCE_EMAIL` (verified in SES)
  - `ADMIN_PORTAL_URL` (defaults to `https://icebox.icecampus.com/admin` if not provided)
  - `VLE_TOKEN_CHECK=true` (enforce Circle launch token validation in prod)
  - Any other overrides you need (e.g., `SECRETS_PREFIX` if you’re not using the default `/icebox/prod/`).
- Secrets under `/icebox/prod/…` if/when Lambdas start reading from Secrets Manager (none required yet).

### Environment Files
- `backend/.env.dev` already exists for the dev stage.
- Create `backend/.env.prod` with the production values mentioned above.

### Deployment Commands
The `package.json` scripts automatically load the correct env file via `dotenv-cli`.

```bash
cd backend
npm install           # only needed the first time
npm run deploy:prod   # loads .env.prod and runs serverless deploy --stage prod
```

This provisions:
- S3 bucket `icebox-prod-assignments` (with transition to Glacier at 30 days, deletion at 180)
- DynamoDB tables `icebox-prod-metadata` and `icebox-prod-courses`
- SQS queue + DLQ for asynchronous archive processing (`icebox-prod-archive`, `icebox-prod-archive-dlq`)
- Cognito admin user pool/client
- Lambda handlers and API Gateway routes

### Post-Deploy Checks
- Confirm the CloudFormation stack completed successfully.
- Verify `AWS::SQS::Queue` resources exist and have the correct tags.
- Send a test admin invite/reset to ensure the SES-powered HTML emails arrive.
- Monitor CloudWatch logs for the new stage on first uploads.

---

## 2. Front-end (React + Vite)

### Prerequisites
- ACM certificate for `icebox.icecampus.com` in **us-east-1** (required by CloudFront). Example request:
  ```bash
  aws acm request-certificate \
    --profile ice \
    --region us-east-1 \
    --domain-name icebox.icecampus.com \
    --validation-method DNS \
    --subject-alternative-names '*.icebox.icecampus.com'
  ```
  Add the DNS validation records and wait until status is `ISSUED`.
- S3 bucket for the static site (e.g., `icebox-prod-frontend`) in `eu-south-1`.
- CloudFront distribution whose origin is that bucket (use an Origin Access Control so the bucket stays private). Configure:
  - Alternate domain name: `icebox.icecampus.com`
  - Viewer protocol policy: Redirect HTTP → HTTPS
  - Default root object: `index.html`
  - Error responses (403/404) → `index.html` with HTTP 200 (SPA support)
  - SSL/TLS certificate: the ACM cert above
- Route 53 alias A-record for `icebox.icecampus.com` → CloudFront distribution.

### Environment Files
- Create `frontend/.env.prod` with production API values:
  ```
  VITE_API_BASE_URL=https://ID_HERE.execute-api.REGION_HERE.amazonaws.com/prod
  VITE_ADMIN_USER_POOL_ID=REGION_HERE_XXXXXXXXX
  VITE_ADMIN_USER_POOL_CLIENT_ID=abcd1234example
  VITE_ADMIN_USER_POOL_REGION=REGION_HERE
  VITE_REQUIRE_VLE_TOKEN=true
  ```

### Deployment Script
`frontend/package.json` includes scripts that use `dotenv-cli`:

```bash
cd frontend
npm install             # first time only
npm run deploy:prod     # builds with .env.prod, syncs to S3, invalidates CloudFront
```

The script expands to:
1. `dotenv -e .env.prod -- vite build` (outputs to `dist/`)
2. `aws s3 sync dist/ s3://icebox-prod-frontend --delete`
3. `aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths '/*'`

Replace `<DIST_ID>` with your CloudFront distribution id in `package.json`.

### CI/CD Option (GitHub Actions)
You can automate the build & deploy with a workflow similar to:

```yaml
name: Deploy frontend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
        working-directory: frontend
      - run: npm install --save-dev dotenv-cli
        working-directory: frontend
      - run: npm run deploy:prod
        working-directory: frontend
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: eu-south-1
          VITE_API_BASE_URL: https://aovodzwveg.execute-api.eu-south-1.amazonaws.com/prod
          VITE_ADMIN_USER_POOL_ID: eu-south-1_XXXXXXXXX
          VITE_ADMIN_USER_POOL_CLIENT_ID: abcd1234example
          VITE_ADMIN_USER_POOL_REGION: eu-south-1
```

(Pass the Vite env vars directly instead of relying on `.env.prod` in CI.)

### Post-Deploy Checks
- Load `https://icebox.icecampus.com` and ensure the React app pulls the prod API.
- Run through the admin login flow and a test upload to verify the new async archive path.
- Confirm CloudFront cache invalidation completed (status `Completed`).

---

## 3. General Tips
- Keep `.env.dev` / `.env.prod` out of version control (`.gitignore` already covers them).
- Consider enabling S3 versioning for the frontend bucket to allow rollbacks.
- Tag the new resources (queues, distributions, buckets) for cost tracking.
- Update documentation/runbooks whenever env variables or resource names change.

With these steps in place, you can deploy to prod by running:

```bash
# Back-end
cd backend
npm run deploy:prod

# Front-end
cd ../frontend
npm run deploy:prod
```

Verify the site, watch CloudWatch & CloudFront metrics, and you’re live. 🚀
