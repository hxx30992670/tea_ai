import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '登录账号', example: 'admin' })
  @IsString()
  username!: string;

  @ApiProperty({ description: '登录密码', example: 'Admin@123456' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ description: '验证码挑战 ID' })
  @IsUUID()
  captchaId!: string;

  @ApiProperty({ description: '验证码验证通过后的一次性令牌' })
  @IsString()
  @MinLength(16)
  captchaToken!: string;
}
