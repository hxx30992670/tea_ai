/**
 * 采购订单控制器
 * 处理采购订单创建、确认（自动入库）、退货、付款及列表查询等请求
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { StockInPurchaseOrderDto } from './dto/stock-in-purchase-order.dto';
import { PurchaseOrderService } from './purchase-order.service';

@ApiTags('采购订单')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @ApiOperation({ summary: '采购订单列表' })
  @ApiOkResponse({ description: '分页采购订单列表' })
  @Get()
  getPurchaseOrders(@Query() query: PurchaseOrderQueryDto) {
    return this.purchaseOrderService.getPurchaseOrders(query);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '创建采购订单' })
  @ApiBody({ type: CreatePurchaseOrderDto })
  @ApiOkResponse({ description: '返回新建采购订单及明细' })
  @Post()
  createPurchaseOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchaseOrderService.createPurchaseOrder(dto, user);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '获取采购订单详情（含明细）' })
  @ApiParam({ name: 'id', description: '采购订单 ID', example: 1 })
  @Get(':id')
  getPurchaseOrderById(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrderService.getPurchaseOrderById(id);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '编辑草稿采购订单' })
  @ApiParam({ name: 'id', description: '采购订单 ID', example: 1 })
  @ApiBody({ type: CreatePurchaseOrderDto })
  @Put(':id')
  updatePurchaseOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchaseOrderService.updatePurchaseOrder(id, dto, user);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '删除草稿采购订单' })
  @ApiParam({ name: 'id', description: '采购订单 ID', example: 1 })
  @ApiOkResponse({ description: '删除结果' })
  @Delete(':id')
  deletePurchaseOrder(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.purchaseOrderService.deletePurchaseOrder(id, user);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '采购订单入库' })
  @ApiParam({ name: 'id', description: '采购订单 ID', example: 1 })
  @ApiBody({ type: StockInPurchaseOrderDto })
  @ApiOkResponse({ description: '入库完成结果' })
  @Put(':id/stock-in')
  stockInPurchaseOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StockInPurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchaseOrderService.stockInPurchaseOrder(id, dto, user);
  }

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '采购订单退货' })
  @ApiParam({ name: 'id', description: '采购订单 ID', example: 1 })
  @ApiBody({ type: CreatePurchaseReturnDto })
  @ApiOkResponse({ description: '采购退货结果' })
  @Post(':id/returns')
  createPurchaseReturn(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePurchaseReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchaseOrderService.createPurchaseReturn(id, dto, user);
  }
}
