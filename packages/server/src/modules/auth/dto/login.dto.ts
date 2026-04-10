import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '登录账号', example: 'admin' })
  @IsString()
  username!: string;

  @ApiProperty({ description: '登录密码', example: 'Admin@123456' })
  @IsString()
  @MinLength(6)
  password!: string;
}
