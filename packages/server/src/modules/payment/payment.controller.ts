import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentService } from './payment.service';

@ApiTags('收付款')
@ApiBearerAuth()
@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Roles('admin', 'manager')
  @ApiOperation({ summary: '新增收付款记录' })
  @ApiBody({ type: CreatePaymentDto })
  @ApiOkResponse({ description: '返回新建收付款记录' })
  @Post('payments')
  createPayment(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.paymentService.createPayment(dto, user);
  }

  @ApiOperation({ summary: '收付款流水' })
  @ApiOkResponse({ description: '分页收付款记录' })
  @Get('payments')
  getPayments(@Query() query: PaymentQueryDto) {
    return this.paymentService.getPayments(query);
  }

  @ApiOperation({ summary: '应收汇总' })
  @ApiOkResponse({ description: '按销售订单汇总应收金额' })
  @Get('receivables')
  getReceivables() {
    return this.paymentService.getReceivables();
  }

  @ApiOperation({ summary: '应付汇总' })
  @ApiOkResponse({ description: '按采购订单汇总应付金额' })
  @Get('payables')
  getPayables() {
    return this.paymentService.getPayables();
  }
}
