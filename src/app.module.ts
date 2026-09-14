import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        let host = configService.get<string>('REDIS_HOST', 'localhost');
        let port = configService.get<number>('REDIS_PORT', 6380);
        let password: string | undefined = undefined;

        if (redisUrl) {
          try {
            const parsed = new URL(redisUrl);
            host = parsed.hostname || host;
            port = parsed.port ? parseInt(parsed.port, 10) : port;
            if (parsed.password) {
              password = parsed.password;
            }
          } catch (e) {
            // fallback to default host and port
          }
        }

        return {
          connection: {
            host,
            port,
            password,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    AuthModule,
    UsersModule,
    JobsModule,
  ],
})
export class AppModule {}
