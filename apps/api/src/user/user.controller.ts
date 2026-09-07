import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  profile(@Req() req: { user: { userId: string } }) {
    return this.users.profile(req.user.userId);
  }
}
