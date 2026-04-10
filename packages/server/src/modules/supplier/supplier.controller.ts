import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ROLE_ADMIN, ROLE_MANAGER } from '../../common/constants/roles';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierService } from './supplier.service';

@ApiTags('供应商')
@ApiBearerAuth()
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @ApiOperation({ summary: '供应商列表' })
  @ApiOkResponse({ description: '分页供应商列表' })
  @Get()
  getSuppliers(@Query() query: SupplierQueryDto) {
    return this.supplierService.getSuppliers(query);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '创建供应商' })
  @ApiBody({ type: CreateSupplierDto })
  @ApiOkResponse({ description: '返回新建供应商' })
  @Post()
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.supplierService.createSupplier(dto);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '更新供应商' })
  @ApiParam({ name: 'id', description: '供应商 ID', example: 1 })
  @ApiBody({ type: UpdateSupplierDto })
  @ApiOkResponse({ description: '返回更新后的供应商' })
  @Put(':id')
  updateSupplier(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) {
    return this.supplierService.updateSupplier(id, dto);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '删除供应商（无关联采购订单时）' })
  @ApiParam({ name: 'id', description: '供应商 ID', example: 1 })
  @ApiOkResponse({ description: '删除结果' })
  @Delete(':id')
  deleteSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.supplierService.deleteSupplier(id);
  }
}
