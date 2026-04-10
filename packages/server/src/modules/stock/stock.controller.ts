/**
 * 库存控制器
 * 处理入库、出库、库存流水查询及安全预警等请求
 */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockRecordQueryDto } from './dto/stock-record-query.dto';
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
