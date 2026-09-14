import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { JobsService } from './jobs.service';
import { CreateImportJobDto } from './dto/create-import-job.dto';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('import')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Submit asynchronous data import job',
    description:
      'Creates a job record in PostgreSQL with status PENDING, dispatches it to BullMQ/Redis queue, and returns HTTP 202 Accepted immediately (< 50ms).',
  })
  @ApiResponse({
    status: 202,
    description: 'Job accepted and queued for background processing',
    schema: {
      example: {
        jobId: '8f708239-165c-42cb-b1b0-96696b34190b',
        status: 'pending',
        totalRows: 3,
        message: 'Job accepted and queued for background processing',
        createdAt: '2026-09-14T15:40:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized: missing or invalid Bearer token' })
  async importData(
    @GetUser('id') userId: string,
    @Body() dto: CreateImportJobDto,
  ) {
    return this.jobsService.createImportJob(userId, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get job status, progress, and execution results',
    description:
      'Enforces strict row-level user data isolation. If the job does not exist or belongs to another user, returns 404.',
  })
  @ApiParam({ name: 'id', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Job details retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Job not found or access denied' })
  async getJob(
    @Param('id') id: string,
    @GetUser('id') userId: string,
  ) {
    return this.jobsService.getJobById(id, userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List all jobs for the authenticated user',
    description: 'Returns only jobs belonging to the requesting user.',
  })
  @ApiResponse({ status: 200, description: 'List of jobs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyJobs(@GetUser('id') userId: string) {
    return this.jobsService.getUserJobs(userId);
  }

  @Get(':id/records')
  @ApiOperation({
    summary: 'List imported records for a specific job',
    description: 'Returns only records belonging to the authenticated user and job.',
  })
  @ApiParam({ name: 'id', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Imported records' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobRecords(
    @Param('id') id: string,
    @GetUser('id') userId: string,
  ) {
    return this.jobsService.getJobRecords(id, userId);
  }
}
