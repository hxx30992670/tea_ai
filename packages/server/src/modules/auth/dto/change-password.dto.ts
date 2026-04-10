import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: '原密码', example: 'Admin@123456' })
  @IsString()
  @MinLength(6)
  oldPassword!: string;

  @ApiProperty({ description: '新密码', example: 'NewAdmin@123456' })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
