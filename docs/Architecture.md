# ICEBox Architecture Overview

This document provides a visual and conceptual overview of the ICEBox system — an AWS-based, serverless platform for managing course submissions, uploads, and administration for ICE Campus.  
It uses the **C4 model** (Context → Containers → Components → Deployment → Sequence) to progressively explain how ICEBox works.

---

## 1. System Context

```mermaid
graph TD
  subgraph Users
    Student["Student"]
    Educator["Educator/Admin"]
  end

  Frontend["ICEBox Frontend (Vite + React)\nS3 + CloudFront"]
  API["ICEBox API (API Gateway HTTP API)"]
  Auth["Amazon Cognito (Admin auth)"]

  Student -->|Upload assignments, search courses| Frontend
  Educator -->|Admin, invites, CRUD| Frontend
  Frontend -->|HTTPS| API
  Frontend -->|OIDC/JWT| Auth
```

**Explanation:**  
The System Context diagram shows the main actors (students and educators) and how they interact with the ICEBox frontend, backend API, and authentication layer.

---

## 2. Container Diagram

```mermaid
graph TD
  CF["CloudFront + ACM cert"] --> FE["S3 Static Site (Frontend)"]
  FE --> APIGW["API Gateway (HTTP API)"]
  APIGW --> Lambdas["Lambda Handlers (TypeScript)"]
  Lambdas --> S3["S3 Assignments Bucket"]
  Lambdas --> DDB1["DynamoDB: Assignments"]
  Lambdas --> DDB2["DynamoDB: Courses"]
  Lambdas --> SQS["SQS: Archive Queue"]
  Lambdas --> SES["SES: Email (student/educator/admin)"]
  FE --> Cognito["Cognito: Admin User Pool"]
  Lambdas --> Secrets["Secrets Manager (/icebox/<stage>/...)"]
```

**Explanation:**  
This view identifies the major application containers — front-end hosting, API gateway, AWS Lambda backend functions, and the key data stores and integrations used to deliver functionality.

---

## 3. Component Diagram

```mermaid
flowchart LR
  U[Student/Educator] --> FE["React App (Vite)"]
  FE -->|/api/*| APIGW
  APIGW --> UP["Lambda: UploadInit/Complete"]
  APIGW --> ADM["Lambda: Admin (CRUD courses, invites, users)"]
  APIGW --> MET["Lambda: Metadata (list/search submissions)"]

  UP --> S3[(S3 Assignments)]
  UP --> DDB1[(DDB Assignments)]
  MET --> DDB1
  ADM --> DDB2[(DDB Courses)]
  ADM --> SES

  UP -->|enqueue| Q[SQS Archive Queue]
  Q --> ARC["Lambda: Archive Worker (zip, clean originals)"]
  ARC --> S3
  ARC --> SES
```

**Explanation:**  
At the component level, the system consists of modular Lambda functions — each responsible for a bounded concern such as uploads, admin actions, metadata, or archival processing.

---

## 4. Deployment Diagram

```mermaid
graph TB
  subgraph AWS["AWS eu-south-1"]
    subgraph Networking
      CF["CloudFront + ACM (us-east-1 cert)"]
      DNS["Route53: icebox.icecampus.com"]
    end

    DNS --> CF --> S3FE["S3: Static Site (Frontend)"]

    APIGW["API Gateway (HTTP API)"]
    Lambdas["Lambda Functions (Node.js 20)"]
    DDB1["DynamoDB: Assignments"]
    DDB2["DynamoDB: Courses"]
    S3A["S3: Assignments Bucket\n(lifecycle → Glacier 30d, purge 180d)"]
    Q["SQS: Archive Queue"]
    SES["SES: Email"]
    COG["Cognito: Admin User Pool"]
    SM["Secrets Manager: /icebox/<stage>/*"]

    S3FE --> APIGW
    S3FE --> COG
    APIGW --> Lambdas
    Lambdas --> DDB1
    Lambdas --> DDB2
    Lambdas --> S3A
    Lambdas --> Q
    Q --> Lambdas
    Lambdas --> SES
    Lambdas --> SM
  end
```

**Explanation:**  
This diagram illustrates the AWS infrastructure layout — including networking, compute, data, and communication paths across the ICEBox deployment.

---

## 5. Sequence Diagram — Upload Lifecycle

```mermaid
sequenceDiagram
  participant User as Student
  participant FE as React Frontend
  participant API as API Gateway
  participant UP as Lambda UploadInit/Complete
  participant S3 as S3 Assignments
  participant DDB as DDB Assignments
  participant Q as SQS Archive Queue
  participant ARC as Lambda Archive Worker
  participant SES as SES

  User->>FE: Select files, submit
  FE->>API: POST /uploads/init
  API->>UP: Invoke
  UP->>S3: Pre-signed URLs
  UP-->>FE: URLs
  FE->>S3: PUT file parts
  FE->>API: POST /uploads/complete (metadata)
  API->>UP: Invoke
  UP->>DDB: Put submission record
  UP->>Q: Enqueue archive job
  ARC->>S3: Read originals, create zip
  ARC->>S3: Store zip, delete originals
  ARC->>DDB: Update status (archived)
  ARC->>SES: Send emails (student/educator)
```

**Explanation:**  
The upload sequence shows the full asynchronous workflow: file upload via pre-signed URLs, metadata registration, background archiving, and notification delivery.

---

## 6. Operations and Deployment Notes

- **Frontend:** built with **Vite + React**, deployed to **S3 + CloudFront**, protected by **Cognito** (admin access only).  
- **Backend:** fully serverless stack built with **Serverless Framework**, using **API Gateway + Lambda + DynamoDB + SQS + SES + Secrets Manager**.  
- **Storage Lifecycle:** uploaded files transition to **Glacier after 30 days** and are **purged after 180 days**.  
- **Deployment Flow:**  
  - Backend: `npm run deploy:<stage>`  
  - Frontend: `npm run build` → upload to S3 → CloudFront invalidation.  
- **Domain:** [https://icebox.icecampus.com](https://icebox.icecampus.com), certificate in **us-east-1**.

---

**Last updated:** October 2025  
Maintainer: *Keith Vassallo*
