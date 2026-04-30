import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ProcessAfterSaleStockDto {
  @ApiPropertyOptional({ description: '处理结果：sellable 可继续销售；unsellable 不可售/报损', example: 'sellable' })
  @IsString()
  @IsIn(['sellable', 'unsellable'])
  result!: 'sellable' | 'unsellable';

  @ApiPropertyOptional({ description: '入库批次方式：same_batch 保留原批次；new_batch 新建批次', example: 'same_batch' })
  @IsOptional()
  @IsString()
  @IsIn(['same_batch', 'new_batch'])
  batchMode?: 'same_batch' | 'new_batch';

  @ApiPropertyOptional({ description: '新批次号，batchMode=new_batch 时使用', example: 'REPACK-20260430-001' })
  @IsOptional()
  @IsString()
  batchNo?: string;

  @ApiPropertyOptional({ description: '目标仓库 ID，不传则使用当前仓库', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  warehouseId?: number;

  @ApiPropertyOptional({ description: '目标仓位 ID，不传则使用当前仓位或默认仓位', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId?: number;

  @ApiPropertyOptional({ description: '处理说明', example: '检查包装完好，可继续销售' })
  @IsOptional()
  @IsString()
  remark?: string;
}
