import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ description: '客户名称', example: '杭州茶庄' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '联系人', example: '张三' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ description: '电话', example: '13800138000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: '地址', example: '杭州市西湖区龙井路 1 号' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: '备注', example: '重点客户' })
  @IsOptional()
  @IsString()
  remark?: string;
}
