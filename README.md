# Asynchronous Background Job Processing Service & Dashboard (Monorepo)

[![NestJS](https://img.shields.io/badge/NestJS-10.3-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Tests](https://img.shields.io/badge/Tests-11%2F11%20E2E%20Passing-brightgreen?style=flat)](./backend/test/jobs.e2e-spec.ts)

A clean, decoupled monorepo containing a production-grade asynchronous background data ingestion engine built with **NestJS**, **TypeScript**, **PostgreSQL 16**, and **Redis (BullMQ)**, alongside a real-time **Next.js (App Router) & Tailwind CSS Frontend Dashboard**. Designed strictly according to the *Final Project: Service with a Job Running Behind It (Brief B)* specification.

---

## 📑 Table of Contents
- [1. Monorepo Structure](#1-monorepo-structure)
- [2. System Architecture](#2-system-architecture)
- [3. Next.js Frontend Dashboard (UI Features)](#3-nextjs-frontend-dashboard-ui-features)
- [4. Fast Request Path & Asynchronous Decoupling](#4-fast-request-path--asynchronous-decoupling)
- [5. Worker Failure Recovery (When the Worker Dies Mid-Job)](#5-worker-failure-recovery-when-the-worker-dies-mid-job)
- [6. Idempotent Processing Guarantees](#6-idempotent-processing-guarantees)
- [7. Authentication & User Row Isolation](#7-authentication--user-row-isolation)
- [8. Quick-Start & Monorepo Orchestration](#8-quick-start--monorepo-orchestration)
- [9. Automated Test Suite](#9-automated-test-suite)
- [10. Production Cloud Deployment Guide](#10-production-cloud-deployment-guide)

---

## 1. Monorepo Structure

```text
background-job-service/
├── backend/                  # Complete NestJS API & Worker
│   ├── src/                  # Controllers, services, entities, auth & processors
│   ├── test/                 # Automated E2E test suite (11 test cases)
│   ├── Dockerfile            # Multi-stage production container build
│   ├── nest-cli.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── .env.example          # Sample environment variables template
│   ├── .env                  # Local backend configuration
│   └── package.json          # Backend-specific dependencies & scripts
├── frontend/                 # Complete Next.js 14 & Tailwind Dashboard
│   ├── app/                  # App Router pages and layout
│   ├── components/           # UI components (Tracker, Import Panel, Latency Meter, Table)
│   ├── context/              # Authentication context & session manager
│   ├── lib/                  # Typed API fetch client with latency tracking
│   ├── Dockerfile            # Multi-stage production container build for frontend
│   ├── .env.local            # Frontend environment (NEXT_PUBLIC_API_URL)
│   └── package.json          # Frontend-specific dependencies & scripts
├── docker-compose.yml        # Orchestrates Postgres, Redis, backend, frontend
├── .gitignore                # Strictly ignores root, backend/, and frontend/ build & node_modules
├── package.json              # Root orchestrator with concurrently
└── README.md                 # Complete project documentation
```

---

## 2. System Architecture

```mermaid
flowchart TD
    Client(["Next.js Frontend (Port 3000 / 3002)"])
    
    subgraph "HTTP Request Ingestion Layer (<50ms)"
        Controller["JobsController\n(POST /jobs/import)"]
        Guard["JwtAuthGuard\n(Strict Authentication)"]
    end
    
    subgraph "Persistence Layer"
        PG[("PostgreSQL 16\n(Jobs & Records Tables)")]
    end

    subgraph "Distributed Queue"
        Queue[("Redis 7 / BullMQ\n(data-import-queue)")]
    end

    subgraph "Asynchronous Background Worker Layer"
        Worker["BullMQ Worker Host\n(JobsProcessor)"]
        Heartbeat["Lock Renewal & Heartbeat\n(30s TTL / 15s Check)"]
        Supervisor["Stalled Job Supervisor\n(Auto-Requeue on Crash)"]
    end

    Client -->|1. POST /jobs/import with Bearer JWT| Guard
    Guard --> Controller
    Controller -->|2. Insert Job record status=PENDING| PG
    Controller -->|3. Push job payload to queue| Queue
    Controller -->|4. Return HTTP 202 Accepted (<50ms)| Client

    Queue -.->|5. Pull job with distributed lock| Worker
    Worker <-->|6. Maintain heartbeat & renew lock| Heartbeat
    Worker -->|7. Update status to PROCESSING| PG
    Worker -->|8. Transactional atomic batch upsert ON CONFLICT| PG
    Worker -->|9. Incremental progress updates| PG
    Worker -->|10. Final status: COMPLETED or FAILED with Telemetry| PG
    
    Supervisor -.->|Monitors stalled jobs if worker killed mid-run| Queue
    Client -->|Polling: GET /jobs/:id every 1.5s| Controller
    Controller -->|Read current progress & status| PG
```

---

## 3. Next.js Frontend Dashboard (UI Features)

Located in `frontend/`, the web dashboard provides an interface to observe background processing:

1. **Authentication (Sign In / Register Modal)**:
   - Modern glassmorphic dialog with tabbed Login & Register forms.
   - Saves JWT in `localStorage` and automatically attaches `Bearer <token>` to requests.
   - **Quick-Fill Demo Users**: One-click `User A` and `User B` buttons to easily switch accounts and verify strict user row isolation.

2. **Data Import Panel**:
   - Accepts CSV or JSON payloads.
   - **Quick Action**: `Load Sample Dataset (1,000 records)` instantly generates 1,000 realistic product records (`SKU-1001` to `SKU-2000`) with prices, categories, and stock numbers.
   - **Quick Action**: `Load Small Batch (5 records)` for rapid verification.

3. **Live Latency Meter Banner**:
   - Visually benchmarks asynchronous decoupling:
     ```
     ⚡ API responded in 27 ms with HTTP 202 Accepted (Job ID: a0ffe0f9-7cfb...)
     ```
   - Confirms that the request was acknowledged in under 50ms without waiting for worker execution.

4. **Real-Time Job Progress Tracker**:
   - Polls `GET /jobs/:id` every 1.5 seconds.
   - Animated status badge with color coding:
     - 🟡 **PENDING** (Queued in Redis) with pulse effect
     - 🔵 **PROCESSING** (Background worker active) with spinning indicator
     - 🟢 **COMPLETED** (All rows inserted into PostgreSQL)
     - 🔴 **FAILED** (Worker crash or poison pill failure details displayed)
   - Dynamic progress bar showing `0%` to `100%` processing progress.
   - Row counter: `Processed: 1,000 / 1,000 rows`.
   - Execution metrics: total rows, new inserts, deduplicated count, execution time in ms.

5. **Idempotency Test Action**:
   - Dedicated **"Test Duplicate Execution"** button: Re-submits the exact same payload/hash and observes the worker processing it again with:
     ```
     Deduplicated/Updated: 1,000, New Records: 0 (0 duplicates created!)
     ```

6. **Job History & Row Isolation Table**:
   - Displays all historical jobs for the authenticated user.
   - Inspect button allows clicking any historical job to load its telemetry and progress into the tracker.
   - Proves that logging in as User B shows zero records from User A.

---

## 4. Fast Request Path & Asynchronous Decoupling

The `POST /jobs/import` endpoint returns immediately with `HTTP 202 Accepted` rather than forcing the caller to wait for CSV/data processing:

### Sample Request
```bash
curl -X POST http://localhost:3001/jobs/import \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      { "externalId": "SKU-1001", "name": "Studio Headphones", "price": 199.99, "category": "Electronics" },
      { "externalId": "SKU-1002", "name": "Mechanical Keyboard", "price": 149.50, "category": "Accessories" }
    ]
  }'
```

### Immediate Response (Benchmark: ~25ms - 45ms)
```json
{
  "jobId": "8f708239-165c-42cb-b1b0-96696b34190b",
  "status": "pending",
  "totalRows": 2,
  "message": "Job accepted and queued for background processing",
  "createdAt": "2026-09-14T15:40:00.000Z"
}
```

---

## 5. Worker Failure Recovery (When the Worker Dies Mid-Job)

A major requirement of resilient distributed systems is answering the critical question:
> **"What happens if the worker process is killed or crashes halfway through a job?"**

In poorly architected systems, jobs remain stuck in `PROCESSING` forever and *"nobody finds out"*. This service provides comprehensive crash and failure recovery:

1. **Lock Duration & Heartbeat Mechanism**:
   When a worker picks up a job from Redis, BullMQ acquires a distributed lock:
   - `lockDuration`: Set to **30,000 ms (30s)**.
   - While active and healthy, the worker periodically renews the lock.

2. **Stalled Job Detection & Automatic Re-Queue**:
   If the worker process abruptly dies (e.g., `SIGKILL`, OOM crash, container restart):
   - The worker stops sending heartbeats and the 30-second lock expires.
   - BullMQ's built-in **Stalled Job Supervisor** (`stalledInterval: 15000`) detects the lock expiration every 15 seconds.
   - The supervisor moves the orphaned job back into the active queue and triggers a retry.
   - An alert event `@OnWorkerEvent('stalled')` is emitted.

3. **Exponential Backoff Retries**:
   - Each job is configured with `attempts: 3` and exponential backoff (`delay: 1000`).

4. **Poison Pills & Permanent Failure Transitions**:
   If a job is defective and all 3 retry attempts are exhausted:
   - The job transitions to the terminal status **`FAILED`** in PostgreSQL.
   - Complete failure telemetry (error message, stack trace, attempt counts, timestamps) is persisted to `jobs.error_message`.
   - A critical telemetry alert is logged:
     ```
     [CRITICAL ALERT] Job <id> (User: <user_id>) permanently FAILED after 3 attempts! Telemetry: <stack_trace>
     ```
   - **The answer is NEVER "nobody finds out."**

---

## 6. Idempotent Processing Guarantees

Because background jobs may be retried after a worker crash or re-triggered by users, background execution must be **strictly idempotent**:
> **"Running the exact same background job twice produces the EXACT same final outcome without inserting duplicate rows."**

### Implementation Strategy

1. **Deterministic Hashing**:
   For each incoming row, a deterministic SHA-256 fingerprint is calculated using the user ID and the record's natural external ID:
   ```ts
   const recordHash = crypto
     .createHash('sha256')
     .update(`${userId}:${externalId}`)
     .digest('hex');
   ```

2. **Database Unique Constraint**:
   The `imported_records` table enforces a composite unique constraint:
   ```sql
   CREATE UNIQUE INDEX "IDX_user_external_id" ON imported_records (user_id, external_id);
   ```

3. **Atomic Upsert (`ON CONFLICT DO UPDATE`)**:
   Within a database transaction, records are inserted using PostgreSQL's atomic conflict resolution:
   ```sql
   INSERT INTO imported_records (id, user_id, job_id, external_id, record_hash, data, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
   ON CONFLICT (user_id, external_id)
   DO UPDATE SET
     record_hash = EXCLUDED.record_hash,
     data = EXCLUDED.data,
     job_id = EXCLUDED.job_id,
     updated_at = NOW()
   RETURNING (xmax = 0) AS is_inserted;
   ```
   - If the record does not exist: it is inserted as a new row (`insertedCount++`).
   - If the record already exists: it safely updates data and pointers without inserting a duplicate (`updatedCount++`).

---

## 7. Authentication & User Row Isolation

This service adheres strictly to **Variant A** data isolation standards:

1. **JWT Authentication**:
   - Protected routes require a valid HTTP Bearer header: `Authorization: Bearer <token>`.
   - Missing or expired tokens return `HTTP 401 Unauthorized`.

2. **Strict Row-Level Isolation**:
   - `GET /jobs/:id`: Verifies `job.user_id === authenticatedUser.id`. If a user attempts to access a job belonging to another user, the service returns **`404 Not Found`** (preventing user enumeration or data leaks).
   - `GET /jobs`: Scoped strictly by `WHERE user_id = :userId`.
   - `GET /jobs/:id/records`: Verifies ownership and returns only records belonging to the caller.

---

## 8. Quick-Start & Monorepo Orchestration

### Root NPM Scripts Reference

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs both NestJS API (`start:dev`) and Next.js Frontend (`dev`) concurrently |
| `npm run build` | Compiles both `backend/` and `frontend/` production bundles |
| `npm test` | Runs backend unit tests |
| `npm run test:e2e` | Runs complete 11-case automated E2E test suite |
| `npm run docker:up` | Boots PostgreSQL 16, Redis 7, NestJS API, and Frontend in Docker Compose |
| `npm run docker:down` | Gracefully stops all Docker containers and networks |

### 1. Local Development Mode
```bash
# 1. Start PostgreSQL (port 5434) and Redis (port 6380)
docker compose up -d postgres redis

# 2. Launch both Backend & Frontend simultaneously with colored log multiplexing
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

### 2. Full Docker Stack Mode
```bash
npm run docker:up
```

### Port Mappings
| Service | Host Port | Internal Port | Description |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | `3000` (or `3002`) | `3000` | Next.js Web Dashboard |
| **Backend API** | `3001` | `3000` | NestJS REST API & Swagger |
| **PostgreSQL** | `5434` | `5432` | PostgreSQL 16 Database |
| **Redis** | `6380` | `6379` | Redis 7 BullMQ Queue |

---

## 9. Automated Test Suite

Run the full end-to-end suite from the root monorepo directory:
```bash
npm run test:e2e
```
Validates:
- Protected routes return `401 Unauthorized`.
- Fast HTTP 202 decoupling (`< 100ms`).
- Strict user row isolation (cross-user queries return `404`).
- Background worker execution to `COMPLETED` and 100% progress.
- Idempotent duplicate replay produces 0 duplicate records.
- CSV string ingestion format support.
- Worker crash & poison pill retry exhaustion to `FAILED` with telemetry.

---

## 10. Production Cloud Deployment Guide

### Deployment on Railway (Full Stack)

1. **Create a Railway Account & New Project**:
   - Go to [railway.app](https://railway.app/) and click **New Project**.

2. **Provision PostgreSQL & Redis Services**:
   - Click **+ New** -> **Database** -> **Add PostgreSQL**.
   - Click **+ New** -> **Database** -> **Add Redis**.

3. **Deploy Backend Service**:
   - Click **+ New** -> **GitHub Repo** -> select this repository.
   - Set root directory: `backend`.
   - Railway builds `backend/Dockerfile`.
   - Set environment variables:
     - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
     - `REDIS_URL`: `${{Redis.REDIS_URL}}`
     - `JWT_SECRET`: Generate a random 32-char secret
     - `PORT`: `3000`

4. **Deploy Frontend Service**:
   - Click **+ New** -> **GitHub Repo** -> select this repository.
   - Set root directory: `frontend`.
   - Railway builds `frontend/Dockerfile`.
   - Set environment variables:
     - `NEXT_PUBLIC_API_URL`: Public URL of your deployed Backend service.

5. **Access Live Services**:
   - Open frontend domain in browser.
   - Test user registration, sample dataset load (1,000 records), live latency meter, and real-time worker tracking!

---

## 📄 License
This project is licensed under the MIT License.