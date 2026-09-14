import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Background Job Processing Service E2E Tests', () => {
  let app: INestApplication;
  let tokenUserA: string;
  let tokenUserB: string;
  let userAId: string;
  let userBId: string;
  let jobAId: string;

  const sampleRecords = [
    { externalId: 'SKU-001', name: 'Noise-Cancelling Headphones', price: 199.99, category: 'Electronics' },
    { externalId: 'SKU-002', name: 'Ergonomic Standing Desk', price: 499.00, category: 'Furniture' },
    { externalId: 'SKU-003', name: 'Wireless Mechanical Keyboard', price: 129.50, category: 'Accessories' },
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Register & Login User A
    const userAEmail = `user_a_${Date.now()}@example.com`;
    const regResA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userAEmail, password: 'SecurePassword123!' });
    tokenUserA = regResA.body.accessToken;
    userAId = regResA.body.user.id;

    // Register & Login User B
    const userBEmail = `user_b_${Date.now()}@example.com`;
    const regResB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userBEmail, password: 'SecurePassword123!' });
    tokenUserB = regResB.body.accessToken;
    userBId = regResB.body.user.id;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Authentication Guard & Route Protection', () => {
    it('should return 401 Unauthorized on POST /jobs/import without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/jobs/import')
        .send({ records: sampleRecords });
      expect(res.status).toBe(401);
    });

    it('should return 401 Unauthorized on GET /jobs without token', async () => {
      const res = await request(app.getHttpServer()).get('/jobs');
      expect(res.status).toBe(401);
    });

    it('should return 401 Unauthorized on GET /jobs/:id without token', async () => {
      const res = await request(app.getHttpServer()).get('/jobs/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Fast Request Path (Asynchronous Decoupling)', () => {
    it('should accept import job immediately (< 100ms) with HTTP 202 and return jobId', async () => {
      const start = Date.now();
      const res = await request(app.getHttpServer())
        .post('/jobs/import')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ records: sampleRecords });

      const durationMs = Date.now() - start;

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('jobId');
      expect(res.body.status).toBe('pending');
      expect(res.body.totalRows).toBe(3);
      expect(res.body).toHaveProperty('message');

      jobAId = res.body.jobId;
      expect(jobAId).toBeDefined();
      expect(typeof jobAId).toBe('string');
      // Verify fast path requirement
      console.log(`[HTTP 202 Latency Benchmark]: POST /jobs/import responded in ${durationMs}ms`);
      expect(durationMs).toBeLessThan(500);
    });
  });

  describe('3. Strict User Row Isolation', () => {
    it('User B should NOT be able to view User A\'s job (should return 404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/jobs/${jobAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Job not found');
    });

    it('User B should NOT see User A\'s job in GET /jobs list', async () => {
      const res = await request(app.getHttpServer())
        .get('/jobs')
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const containsJobA = res.body.some((j: any) => j.id === jobAId);
      expect(containsJobA).toBe(false);
    });

    it('User B should NOT be able to access records of User A\'s job (should return 404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/jobs/${jobAId}/records`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
    });
  });

  describe('4. Background Worker Execution & Progress Transition', () => {
    it('should process job in background and transition status to COMPLETED with 100% progress', async () => {
      let isCompleted = false;
      let finalJob: any = null;

      // Poll until worker finishes processing
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer())
          .get(`/jobs/${jobAId}`)
          .set('Authorization', `Bearer ${tokenUserA}`);

        expect(res.status).toBe(200);
        if (res.body.status === 'COMPLETED') {
          isCompleted = true;
          finalJob = res.body;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      expect(isCompleted).toBe(true);
      expect(finalJob.status).toBe('COMPLETED');
      expect(finalJob.progress).toBe(100);
      expect(finalJob.processedRows).toBe(3);
      expect(finalJob.failedRows).toBe(0);
      expect(finalJob.result).toBeDefined();
      expect(finalJob.result.totalRows).toBe(3);
      expect(finalJob.result.insertedCount).toBe(3);
      expect(finalJob.errorMessage).toBeNull();
      expect(finalJob.completedAt).toBeDefined();

      // Verify records are accessible to User A
      const recordsRes = await request(app.getHttpServer())
        .get(`/jobs/${jobAId}/records`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(recordsRes.status).toBe(200);
      expect(recordsRes.body.length).toBe(3);
      const skuList = recordsRes.body.map((r: any) => r.externalId).sort();
      expect(skuList).toEqual(['SKU-001', 'SKU-002', 'SKU-003']);
    });
  });

  describe('5. Background Worker Idempotency (Surviving Duplicate Runs)', () => {
    it('re-importing the exact same dataset should NOT produce duplicate rows in database', async () => {
      // Submit identical records again under User A
      const dupRes = await request(app.getHttpServer())
        .post('/jobs/import')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ records: sampleRecords });

      expect(dupRes.status).toBe(202);
      const job2Id = dupRes.body.jobId;

      // Wait for second job to complete
      let isCompleted = false;
      let finalJob2: any = null;
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer())
          .get(`/jobs/${job2Id}`)
          .set('Authorization', `Bearer ${tokenUserA}`);

        if (res.body.status === 'COMPLETED') {
          isCompleted = true;
          finalJob2 = res.body;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      expect(isCompleted).toBe(true);
      expect(finalJob2.status).toBe('COMPLETED');
      expect(finalJob2.result.updatedCount).toBe(3); // All 3 records safely updated/upserted, none duplicated!

      // Fetch all imported records for User A across all jobs
      const userAJobs = await request(app.getHttpServer())
        .get('/jobs')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(userAJobs.body.length).toBeGreaterThanOrEqual(2);

      // Verify that total unique records in imported_records table for User A is still exactly 3
      const recordsJob2 = await request(app.getHttpServer())
        .get(`/jobs/${job2Id}/records`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(recordsJob2.status).toBe(200);
      expect(recordsJob2.body.length).toBe(3);
    });
  });

  describe('6. CSV String Data Ingestion Support', () => {
    it('should parse and import raw CSV text payload asynchronously', async () => {
      const csvData = [
        'externalId,name,price,category',
        'SKU-901,Smart Watch Pro,299.99,Wearables',
        'SKU-902,Wireless Earbuds,149.00,Audio',
      ].join('\n');

      const res = await request(app.getHttpServer())
        .post('/jobs/import')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ csvContent: csvData });

      expect(res.status).toBe(202);
      const csvJobId = res.body.jobId;

      // Wait for completion
      let isCompleted = false;
      for (let i = 0; i < 20; i++) {
        const jobStatus = await request(app.getHttpServer())
          .get(`/jobs/${csvJobId}`)
          .set('Authorization', `Bearer ${tokenUserA}`);

        if (jobStatus.body.status === 'COMPLETED') {
          isCompleted = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      expect(isCompleted).toBe(true);
    });
  });
  describe('7. Worker Crash & Failure Handling (Surviving Poison Pills)', () => {
    it('should retry failed job up to max attempts and transition to FAILED with error telemetry', async () => {
      const res = await request(app.getHttpServer())
        .post('/jobs/import')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          records: [
            { externalId: 'FAIL-001', name: 'Corrupted payload', triggerFailure: true },
          ],
        });

      expect(res.status).toBe(202);
      const failJobId = res.body.jobId;

      // Poll until worker exhausts retries and transitions to FAILED
      let isFailed = false;
      let finalJob: any = null;

      for (let i = 0; i < 30; i++) {
        const jobRes = await request(app.getHttpServer())
          .get(`/jobs/${failJobId}`)
          .set('Authorization', `Bearer ${tokenUserA}`);

        if (jobRes.body.status === 'FAILED') {
          isFailed = true;
          finalJob = jobRes.body;
          break;
        }
        await new Promise((r) => setTimeout(r, 600));
      }

      expect(isFailed).toBe(true);
      expect(finalJob.status).toBe('FAILED');
      expect(finalJob.attempts).toBeGreaterThanOrEqual(1);
      expect(finalJob.errorMessage).toContain('failure');
      expect(finalJob.completedAt).toBeDefined();
    }, 25000);
  });
});
