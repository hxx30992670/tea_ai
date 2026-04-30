/**
 * 库存控制器
 * 处理入库、出库、库存流水查询及安全预警等请求
 */
import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockRecordQueryDto } from './dto/stock-record-query.dto';
import { CreateInventoryCountDto } from './dto/inventory-count.dto';
import { StockBatchQueryDto } from './dto/stock-batch-query.dto';
import { ProcessAfterSaleStockDto } from './dto/after-sale-stock.dto';
import { CreateStockTransferDto } from './dto/stock-transfer.dto';
import {
  CreateStockLocationDto,
  CreateWarehouseDto,
  UpdateStockLocationDto,
  UpdateStockLocationStatusDto,
  UpdateWarehouseDto,
  UpdateWarehouseStatusDto,
} from './dto/warehouse.dto';
import { StockService } from './stock.service';

@ApiTags('库存')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '入库' })
  @ApiBody({ type: StockInDto })
  @ApiOkResponse({ description: '返回入库后的库存结果' })
  @Post('in')
  stockIn(@Body() dto: StockInDto, @CurrentUser() user: AuthUser) {
    return this.stockService.stockIn(dto, user);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '出库' })
  @ApiBody({ type: StockOutDto })
  @ApiOkResponse({ description: '返回出库后的库存结果' })
  @Post('out')
  stockOut(@Body() dto: StockOutDto, @CurrentUser() user: AuthUser) {
    return this.stockService.stockOut(dto, user);
  }

  @ApiOperation({ summary: '库存流水查询' })
  @ApiOkResponse({ description: '分页库存流水' })
  @Get('records')
  getStockRecords(@Query() query: StockRecordQueryDto) {
    return this.stockService.getStockRecords(query);
  }

  @ApiOperation({ summary: '批次库存列表' })
  @Get('batches')
  getBatches(@Query() query: StockBatchQueryDto) {
    return this.stockService.getBatches(query);
  }

  @ApiOperation({ summary: '批次库存矩阵' })
  @Get('matrix')
  getMatrix(@Query() query: StockBatchQueryDto) {
    return this.stockService.getBatches(query);
  }

  @ApiOperation({ summary: '仓库仓位列表' })
  @Get('warehouses')
  getWarehouses(@Query() query: { includeDisabled?: string }) {
    return this.stockService.getWarehouses(query);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '新增仓库' })
  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.stockService.createWarehouse(dto);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '更新仓库' })
  @Put('warehouses/:id')
  updateWarehouse(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.stockService.updateWarehouse(Number(id), dto);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '更新仓库状态' })
  @Patch('warehouses/:id/status')
  updateWarehouseStatus(@Param('id') id: string, @Body() dto: UpdateWarehouseStatusDto) {
    return this.stockService.updateWarehouseStatus(Number(id), dto.status);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '新增仓位' })
  @Post('locations')
  createLocation(@Body() dto: CreateStockLocationDto) {
    return this.stockService.createLocation(dto);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '更新仓位' })
  @Put('locations/:id')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateStockLocationDto) {
    return this.stockService.updateLocation(Number(id), dto);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '更新仓位状态' })
  @Patch('locations/:id/status')
  updateLocationStatus(@Param('id') id: string, @Body() dto: UpdateStockLocationStatusDto) {
    return this.stockService.updateLocationStatus(Number(id), dto.status);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '更新批次库存状态' })
  @Patch('batches/:id/status')
  updateBatchStatus(@Param('id') id: string, @Body() dto: { status: number }) {
    return this.stockService.updateBatchStatus(Number(id), dto.status);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '处理售后库存' })
  @Post('after-sale-batches/:id/process')
  processAfterSaleBatch(@Param('id') id: string, @Body() dto: ProcessAfterSaleStockDto, @CurrentUser() user: AuthUser) {
    return this.stockService.processAfterSaleBatch(Number(id), dto, user);
  }

  @ApiOperation({ summary: '盘点单列表' })
  @Get('inventory-counts')
  getInventoryCounts() {
    return this.stockService.getInventoryCounts();
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '创建盘点单' })
  @Post('inventory-counts')
  createInventoryCount(@Body() dto: CreateInventoryCountDto, @CurrentUser() user: AuthUser) {
    return this.stockService.createInventoryCount(dto, user);
  }

  @ApiOperation({ summary: '调拨单列表' })
  @Get('transfers')
  getTransfers() {
    return this.stockService.getTransfers();
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '创建调拨单' })
  @Post('transfers')
  createTransfer(@Body() dto: CreateStockTransferDto, @CurrentUser() user: AuthUser) {
    return this.stockService.createTransfer(dto, user);
  }

  @ApiOperation({ summary: '库存预警列表' })
  @ApiOkResponse({ description: '返回安全库存和临期预警' })
  @Get('warnings')
  getWarnings() {
    return this.stockService.getWarnings();
  }

  @ApiOperation({ summary: '库存今日统计' })
  @ApiOkResponse({ description: '返回今日入库与出库汇总' })
  @Get('stats')
  getStats() {
    return this.stockService.getStats();
  }
}
