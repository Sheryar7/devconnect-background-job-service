import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Job } from './entities/job.entity';
import { ImportedRecord } from './entities/imported-record.entity';
import { JobsController } from './jobs.controller';
import { JobsService, IMPORT_QUEUE_NAME } from './jobs.service';
import { JobsProcessor } from './jobs.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, ImportedRecord]),
    BullModule.registerQueue({
      name: IMPORT_QUEUE_NAME,
    }),
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsProcessor],
  exports: [JobsService, TypeOrmModule],
})
export class JobsModule {}
