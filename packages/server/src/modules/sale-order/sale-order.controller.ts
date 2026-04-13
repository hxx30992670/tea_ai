/**
 * 销售订单控制器
 * 处理销售订单创建、确认（自动出库）、换货/退货/退款、收款及列表查询等请求
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreateSaleOrderDto } from './dto/create-sale-order.dto';
import { QuickCompleteSaleOrderDto } from './dto/quick-complete-sale-order.dto';
import { CreateSaleExchangeDto } from './dto/create-sale-exchange.dto';
import { UpdateSaleExchangeDraftDto } from './dto/update-sale-exchange.dto';
import { CreateSaleRefundDto } from './dto/create-sale-refund.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { SaleOrderQueryDto } from './dto/sale-order-query.dto';
import { StockOutSaleOrderDto } from './dto/stock-out-sale-order.dto';
import { SaleOrderService } from './sale-order.service';

@ApiTags('销售订单')
@ApiBearerAuth()
@Controller('sale-orders')
export class SaleOrderController {
  constructor(private readonly saleOrderService: SaleOrderService) {}

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '销售订单列表' })
  @ApiOkResponse({ description: '分页销售订单列表' })
  @Get()
  getSaleOrders(@Query() query: SaleOrderQueryDto, @CurrentUser() user: AuthUser) {
    return this.saleOrderService.getSaleOrders(query, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '创建销售草稿订单' })
  @ApiBody({ type: CreateSaleOrderDto })
  @ApiOkResponse({ description: '返回新建销售订单及明细' })
  @Post()
  createSaleOrder(@Body() dto: CreateSaleOrderDto, @CurrentUser() user: AuthUser) {
    return this.saleOrderService.createSaleOrder(dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '一键完成销售（建单+出库+收款）' })
  @ApiBody({ type: QuickCompleteSaleOrderDto })
  @ApiOkResponse({ description: '返回已完成的销售订单' })
  @Post('quick-complete')
  quickCompleteSaleOrder(@Body() dto: QuickCompleteSaleOrderDto, @CurrentUser() user: AuthUser) {
    return this.saleOrderService.quickCompleteSaleOrder(dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '获取销售订单详情（含明细）' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @Get(':id')
  getSaleOrderById(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.saleOrderService.getSaleOrderById(id, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '编辑草稿销售订单' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiBody({ type: CreateSaleOrderDto })
  @Put(':id')
  updateSaleOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSaleOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.updateSaleOrder(id, dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '销售订单出库' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiBody({ type: StockOutSaleOrderDto })
  @ApiOkResponse({ description: '销售订单出库结果' })
  @Put(':id/stock-out')
  stockOutSaleOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StockOutSaleOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.stockOutSaleOrder(id, dto.remark, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '销售订单退货' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiBody({ type: CreateSaleReturnDto })
  @ApiOkResponse({ description: '销售退货结果' })
  @Post(':id/returns')
  createSaleReturn(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSaleReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.createSaleReturn(id, dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '销售订单仅退款' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiBody({ type: CreateSaleRefundDto })
  @ApiOkResponse({ description: '销售仅退款结果' })
  @Post(':id/refunds')
  createSaleRefund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSaleRefundDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.createSaleRefund(id, dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '销售订单换货' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiBody({ type: CreateSaleExchangeDto })
  @ApiOkResponse({ description: '销售换货结果' })
  @Post(':id/exchanges')
  createSaleExchange(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSaleExchangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.createSaleExchange(id, dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '获取订单关联的换货单列表' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @Get(':id/exchanges')
  getSaleExchangesByOrder(@Param('id', ParseIntPipe) id: number) {
    return this.saleOrderService.getSaleExchangesByOrder(id);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '编辑换货草稿' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiParam({ name: 'exchangeId', description: '换货单 ID', example: 1 })
  @ApiBody({ type: UpdateSaleExchangeDraftDto })
  @Put(':id/exchanges/:exchangeId')
  updateSaleExchangeDraft(
    @Param('id', ParseIntPipe) id: number,
    @Param('exchangeId', ParseIntPipe) exchangeId: number,
    @Body() dto: UpdateSaleExchangeDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.updateSaleExchangeDraft(exchangeId, dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '取消换货草稿' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiParam({ name: 'exchangeId', description: '换货单 ID', example: 1 })
  @Delete(':id/exchanges/:exchangeId')
  cancelSaleExchange(
    @Param('id', ParseIntPipe) id: number,
    @Param('exchangeId', ParseIntPipe) exchangeId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.cancelSaleExchange(exchangeId, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '执行换货草稿发货动作' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiParam({ name: 'exchangeId', description: '换货单 ID', example: 1 })
  @Post(':id/exchanges/:exchangeId/ship')
  executeSaleExchangeStock(
    @Param('id', ParseIntPipe) id: number,
    @Param('exchangeId', ParseIntPipe) exchangeId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.executeSaleExchangeStock(exchangeId, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '执行换货草稿退款或补差动作' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiParam({ name: 'exchangeId', description: '换货单 ID', example: 1 })
  @Post(':id/exchanges/:exchangeId/settle')
  settleSaleExchangeDraft(
    @Param('id', ParseIntPipe) id: number,
    @Param('exchangeId', ParseIntPipe) exchangeId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.saleOrderService.settleSaleExchangeDraft(exchangeId, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '删除草稿销售订单' })
  @ApiParam({ name: 'id', description: '销售订单 ID', example: 1 })
  @ApiOkResponse({ description: '删除结果' })
  @Delete(':id')
  deleteSaleOrder(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.saleOrderService.deleteSaleOrder(id, user);
  }
}
