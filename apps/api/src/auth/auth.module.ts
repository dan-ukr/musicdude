import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy, JWT_FALLBACK_SECRET } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    // registerAsync, not register: a static `process.env.JWT_SECRET` here is read
    // at import time — before ConfigModule loads .env — so tokens would be signed
    // with the fallback while the strategy verifies with the real secret (401s).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? JWT_FALLBACK_SECRET,
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
