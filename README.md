# Asynchronous Background Job Processing Service

[![NestJS](https://img.shields.io/badge/NestJS-10.3-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Tests](https://img.shields.io/badge/Tests-E2E%20Passing-brightgreen?style=flat)](./test/jobs.e2e-spec.ts)

A production-grade, distributed asynchronous data import and processing engine built with **NestJS**, **TypeScript**, **PostgreSQL 16**, and **Redis (BullMQ)**. Designed strictly according to the *Final Project: Service with a Job Running Behind It (Brief B)* specification.

---

## ?? Table of Contents
- [1. Architecture Overview](#1-architecture-overview)
- [2. Interactive API Documentation & Swagger](#2-interactive-api-documentation--swagger)
- [3. Fast Request Path & Asynchronous Decoupling](#3-fast-request-path--asynchronous-decoupling)
- [4. Worker Failure Recovery (When the Worker Dies Mid-Job)](#4-worker-failure-recovery-when-the-worker-dies-mid-job)
- [5. Idempotent Processing Guarantees](#5-idempotent-processing-guarantees)
- [6. Authentication & User Row Isolation](#6-authentication--user-row-isolation)
- [7. Local Setup & Docker Compose](#7-local-setup--docker-compose)
- [8. Automated Test Suite](#8-automated-test-suite)
- [9. Production Cloud Deployment Guide](#9-production-cloud-deployment-guide)

---

## 1. Architecture Overview

```mermaid
flowchart TD
    Client([Client / Frontend / Postman])
    
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
    Client -->|Polling: GET /jobs/:id| Controller
    Controller -->|Read current progress & status| PG
```

### Architectural Highlights
- **Decoupled Request-Response Cycle**: The HTTP layer never handles data processing. It validates input, creates a persistent job record in PostgreSQL (`PENDING`), enqueues the task in Redis via BullMQ, and immediately responds with `HTTP 202 Accepted` (< 50ms latency).
- **Independent Scalability**: HTTP API nodes and background worker nodes can be scaled independently horizontally.
- **Fail-Safe Persistence**: Every state transition (`PENDING` -> `PROCESSING` -> `COMPLETED` / `FAILED`) is logged to PostgreSQL with timestamped telemetry.

---

## 2. Interactive API Documentation & Swagger

When running locally or deployed, interactive Swagger documentation with OpenAPI 3.0 schema definitions is available at:
```
http://localhost:3001/api/docs
```
*(Or `http://localhost:3000/api/docs` depending on mapped port)*

### Core Endpoints Reference

| Method | Endpoint | Description | Auth Required | Success Status |
| :--- | :--- | :--- | :---: | :--- |
| `POST` | `/auth/register` | Register a new user | No | `201 Created` |
| `POST` | `/auth/login` | Log in and obtain Bearer JWT | No | `200 OK` |
| `POST` | `/jobs/import` | Submit data/CSV import job | **Yes** | `202 Accepted` |
| `GET` | `/jobs/:id` | Get job status, progress, results | **Yes** | `200 OK` (or `404`) |
| `GET` | `/jobs` | List all jobs of authenticated user | **Yes** | `200 OK` |
| `GET` | `/jobs/:id/records` | List records imported by job | **Yes** | `200 OK` |

---

## 3. Fast Request Path & Asynchronous Decoupling

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

### Raw CSV String Ingestion Support
The endpoint also supports raw CSV text payloads:
```bash
curl -X POST http://localhost:3001/jobs/import \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "csvContent": "externalId,name,price,category\nSKU-2001,4K Monitor,399.99,Displays\nSKU-2002,USB-C Hub,59.99,Accessories"
  }'
```

---

## 4. Worker Failure Recovery (When the Worker Dies Mid-Job)

A major requirement of resilient distributed systems is answering the critical question:
> **"What happens if the worker process is killed or crashes halfway through a job?"**

In poorly architected systems, jobs remain stuck in `PROCESSING` forever and *"nobody finds out"*. This service provides comprehensive crash and failure recovery:

### 1. Lock Duration & Heartbeat Mechanism
When a worker picks up a job from Redis, BullMQ acquires a distributed lock:
- `lockDuration`: Set to **30,000 ms (30s)**.
- While active and healthy, the worker periodically renews the lock.

### 2. Stalled Job Detection & Automatic Re-Queue
If the worker process abruptly dies (e.g., `SIGKILL`, OOM crash, container restart):
1. The worker stops sending heartbeats and the 30-second lock expires.
2. BullMQ's built-in **Stalled Job Supervisor** (`stalledInterval: 15000`) detects the lock expiration every 15 seconds.
3. The supervisor moves the orphaned job back into the active queue and triggers a retry.
4. An alert event `@OnWorkerEvent('stalled')` is emitted:
   ```
   [WORKER HEARTBEAT ALERT] Job <id> has stalled! Worker may have crashed or timed out. BullMQ is triggering recovery.
   ```

### 3. Exponential Backoff Retries
- Each job is configured with `attempts: 3` and exponential backoff:
  ```ts
  backoff: {
    type: 'exponential',
    delay: 1000,
  }
  ```
- Attempt 1: Immediate execution.
- Attempt 2: Re-attempted after 1,000 ms delay.
- Attempt 3: Re-attempted after 2,000 ms delay.

### 4. Poison Pills & Permanent Failure Transitions
If a job is inherently defective (e.g., corrupt payload, database constraint violation, or persistent crash) and all 3 retry attempts are exhausted:
1. The job transitions to the terminal status **`FAILED`** in PostgreSQL.
2. Complete failure telemetry (error message, stack trace, attempt counts, timestamps) is persisted to `jobs.error_message`.
3. A critical telemetry alert is logged:
   ```
   [CRITICAL ALERT] Job <id> (User: <user_id>) permanently FAILED after 3 attempts! Telemetry: <stack_trace>
   ```
4. Callers polling `GET /jobs/:id` immediately receive:
   ```json
   {
     "id": "cc461a85-dfab-4bf5-bfb9-d687b400315e",
     "status": "FAILED",
     "progress": 0,
     "attempts": 3,
     "maxAttempts": 3,
     "errorMessage": "Permanent failure after 3 attempts: Simulated worker process crash / corrupt data payload",
     "completedAt": "2026-09-14T15:45:00.000Z"
   }
   ```
5. **The answer is NEVER "nobody finds out."**

---

## 5. Idempotent Processing Guarantees

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

### Verification
If a job with 5 records is executed:
- **1st Run**: 5 records inserted, total count in DB = 5.
- **2nd Run (Replay)**: 5 records updated/upserted, 0 duplicates created, total count in DB = 5.

---

## 6. Authentication & User Row Isolation

This service adheres strictly to **Variant A** data isolation standards:

1. **JWT Authentication**:
   - Protected routes require a valid HTTP Bearer header: `Authorization: Bearer <token>`.
   - Missing or expired tokens return `HTTP 401 Unauthorized`.

2. **Strict Row-Level Isolation**:
   - `GET /jobs/:id`: Verifies `job.user_id === authenticatedUser.id`. If a user attempts to access a job belonging to another user, the service returns **`404 Not Found`** (preventing user enumeration or data leaks).
   - `GET /jobs`: Scoped strictly by `WHERE user_id = :userId`.
   - `GET /jobs/:id/records`: Verifies ownership and returns only records belonging to the caller.

---

## 7. Local Setup & Docker Compose

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/) installed.
- Node.js 20+ (for local CLI development).

### 1. Clone & Configure Environment
```bash
cp .env.example .env
```
Default ports configured to avoid standard port collisions:
- Application API: `3001` (mapped to container port `3000`)
- PostgreSQL: `5434`
- Redis: `6380`

### 2. One-Command Full Stack Boot
Run the entire production stack (PostgreSQL, Redis, and API) via Docker Compose:
```bash
docker compose up --build -d
```

### 3. Verify Container Health
```bash
docker compose ps
```
Expected output:
```
NAME                      IMAGE                        STATUS                    PORTS
background_job_api        background-job-service-api   Up                        0.0.0.0:3001->3000/tcp
background_job_postgres   postgres:16-alpine           Up (healthy)              0.0.0.0:5434->5432/tcp
background_job_redis      redis:7-alpine               Up (healthy)              0.0.0.0:6380->6379/tcp
```

### 4. View Container Logs
```bash
docker compose logs api -f
```

---

## 8. Automated Test Suite

The project includes an end-to-end (E2E) test suite (`test/jobs.e2e-spec.ts`) validating all acceptance criteria:
1. Route protection: Unauthenticated requests return `401 Unauthorized`.
2. Asynchronous Decoupling: `POST /jobs/import` returns `202 Accepted` within `< 100ms` (measured ~25ms - 45ms).
3. User Row Isolation: User A cannot read, query, or view User B's jobs or records (returns `404`).
4. Worker Execution: Background worker transitions job status to `COMPLETED` and progress to `100%`.
5. Worker Idempotency: Re-submitting identical datasets updates existing records with 0 duplicate rows.
6. CSV String Parsing: Asynchronously ingests raw CSV format.
7. Worker Crash & Failure Recovery: Retries poison-pill jobs up to 3 times, transitions to `FAILED`, and records telemetry.

### Running the E2E Suite
```bash
npm run test:e2e
```

---

## 9. Production Cloud Deployment Guide

The multi-stage `Dockerfile` is optimized for zero-configuration deployment on modern container platforms (e.g. **Railway**, **Render**, **Fly.io**).

### Free Cloud Deployment on Railway

1. **Create a Railway Account & New Project**:
   - Go to [railway.app](https://railway.app/) and click **New Project**.

2. **Provision PostgreSQL & Redis Services**:
   - Click **+ New** -> **Database** -> **Add PostgreSQL**.
   - Click **+ New** -> **Database** -> **Add Redis**.

3. **Deploy the Service Container**:
   - Click **+ New** -> **GitHub Repo** (or deploy via Railway CLI: `railway up`).
   - Railway automatically detects the root `Dockerfile` and builds the production multi-stage image.

4. **Configure Environment Variables**:
   In your Service settings, add the following variables:
   | Variable | Value Reference / Example |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` |
   | `JWT_SECRET` | Strong production secret (e.g. `openssl rand -hex 32`) |
   | `JWT_EXPIRES_IN`| `1d` |

5. **Generate Public Domain**:
   - Under Service -> **Settings** -> **Networking**, click **Generate Domain**.
   - Your service is now live with public SSL (e.g., `https://background-job-service-production.up.railway.app`).
   - Access Swagger docs at `https://<your-domain>/api/docs`.

---

## ?? License
This project is licensed under the MIT License.
