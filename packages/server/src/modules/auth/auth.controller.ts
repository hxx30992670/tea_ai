/**
 * 认证控制器
 * 处理用户登录、Token 刷新、获取个人信息及修改密码等请求
 * 使用 Swagger 装饰器生成 API 文档
 */
import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyLoginCaptchaDto } from './dto/verify-login-captcha.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 用户登录：无需鉴权，返回 access_token 和 refresh_token */
  @Public()
  @ApiOperation({ summary: '登录' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: '登录成功，返回 access_token 与 refresh_token',
    schema: {
      example: {
        code: 200,
        message: 'success',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1Ni...',
          refreshToken: 'eyJhbGciOiJIUzI1Ni...',
          user: { id: 1, username: 'admin', realName: '系统管理员', role: 'admin', status: 1 },
        },
      },
    },
  })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @ApiOperation({ summary: '获取登录行为验证码' })
  @ApiOkResponse({ description: '返回滑块验证码挑战' })
  @Post('captcha/challenge')
  getLoginCaptcha() {
    return this.authService.getLoginCaptcha();
  }

  @Public()
  @ApiOperation({ summary: '校验登录行为验证码' })
  @ApiBody({ type: VerifyLoginCaptchaDto })
  @ApiOkResponse({ description: '返回一次性验证码通过令牌' })
  @Post('captcha/verify')
  verifyLoginCaptcha(@Body() dto: VerifyLoginCaptchaDto) {
    return this.authService.verifyLoginCaptcha(dto);
  }

  /** 刷新 Token：使用 refresh_token 获取新的访问令牌 */
  @Public()
  @ApiOperation({ summary: '刷新 token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: '返回新的 access_token 与 refresh_token' })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  /** 获取当前登录用户信息 */
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiOkResponse({ description: '返回当前登录用户资料' })
  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.authService.getProfile(user.sub);
  }

  /** 修改密码：需验证原密码 */
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改密码' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ description: '修改密码成功' })
  @Put('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }
}
