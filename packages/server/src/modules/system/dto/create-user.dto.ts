import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { APP_ROLES } from '../../../common/constants/roles';

export class CreateUserDto {
  @ApiProperty({ description: '登录账号', example: 'staff001' })
  @IsString()
  username!: string;

  @ApiProperty({ description: '登录密码', example: 'Staff@123456' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ description: '姓名', example: '门店店员' })
  @IsString()
  realName!: string;

  @ApiPropertyOptional({ description: '手机号', example: '13800138000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: '角色编码', example: 'staff', enum: APP_ROLES })
  @IsString()
  @IsIn(APP_ROLES)
  role!: string;

  @ApiPropertyOptional({ description: '账号状态 1 启用 0 停用', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  status?: number;
}
