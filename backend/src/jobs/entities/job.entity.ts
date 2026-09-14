import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum JobType {
  CSV_IMPORT = 'CSV_IMPORT',
  DATA_IMPORT = 'DATA_IMPORT',
}

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, (user) => user.jobs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: JobType,
    default: JobType.CSV_IMPORT,
  })
  type: JobType;

  @Column({
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.PENDING,
  })
  @Index()
  status: JobStatus;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ name: 'processed_rows', type: 'int', default: 0 })
  processedRows: number;

  @Column({ name: 'failed_rows', type: 'int', default: 0 })
  failedRows: number;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, any>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', type: 'int', default: 3 })
  maxAttempts: number;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
