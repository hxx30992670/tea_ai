/**
 * 数据看板控制器
 * 提供营业概览、销售趋势、热销商品及售后统计等数据接口
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { SalesTrendQueryDto } from './dto/sales-trend-query.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';

@ApiTags('看板')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({ summary: '核心概览指标' })
  @ApiOkResponse({ description: '今日营收、本月营收、库存总值、应收总额' })
  @Get('overview')
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @ApiOperation({ summary: '销售趋势' })
  @ApiOkResponse({ description: '按天/周/月聚合的销售趋势' })
  @Get('sales-trend')
  getSalesTrend(@Query() query: SalesTrendQueryDto) {
    return this.dashboardService.getSalesTrend(query);
  }

  @ApiOperation({ summary: '商品销量排行' })
  @ApiOkResponse({ description: '畅销或滞销商品排行' })
  @Get('top-products')
  getTopProducts(@Query() query: TopProductsQueryDto) {
    return this.dashboardService.getTopProducts(query);
  }

  @ApiOperation({ summary: '库存预警' })
  @ApiOkResponse({ description: '安全库存和临期预警列表' })
  @Get('stock-warnings')
  getStockWarnings() {
    return this.dashboardService.getStockWarnings();
  }

  @ApiOperation({ summary: '售后原因统计' })
  @ApiOkResponse({ description: '退货、仅退款、换货原因分类统计' })
  @Get('after-sales-reasons')
  getAfterSalesReasonStats() {
    return this.dashboardService.getAfterSalesReasonStats();
  }
}
