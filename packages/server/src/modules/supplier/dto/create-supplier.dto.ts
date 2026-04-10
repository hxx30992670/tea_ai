import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ description: '供应商名称', example: '云南茶厂' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '联系人', example: '李四' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ description: '电话', example: '13900139000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: '地址', example: '云南西双版纳' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: '供应品类', example: '普洱茶' })
  @IsOptional()
  @IsString()
  supplyCategory?: string;

  @ApiPropertyOptional({ description: '账期类型：cash=现结 / contract=合同账期 / days=X天后结', example: 'contract' })
  @IsOptional()
  @IsIn(['cash', 'contract', 'days'])
  paymentTermsType?: 'cash' | 'contract' | 'days';

  @ApiPropertyOptional({ description: '账期天数（contract/days 类型时填写）', example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  paymentDays?: number;

  @ApiPropertyOptional({ description: '备注', example: '长期合作' })
  @IsOptional()
  @IsString()
  remark?: string;
}
