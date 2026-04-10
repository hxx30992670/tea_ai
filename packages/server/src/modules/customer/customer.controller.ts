import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF } from '../../common/constants/roles';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerService } from './customer.service';

@ApiTags('客户')
@ApiBearerAuth()
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @ApiOperation({ summary: '客户列表' })
  @ApiOkResponse({ description: '分页客户列表' })
  @Get()
  getCustomers(@Query() query: CustomerQueryDto) {
    return this.customerService.getCustomers(query);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '创建客户' })
  @ApiBody({ type: CreateCustomerDto })
  @ApiOkResponse({ description: '返回新建客户' })
  @Post()
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.customerService.createCustomer(dto);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '更新客户' })
  @ApiParam({ name: 'id', description: '客户 ID', example: 1 })
  @ApiBody({ type: UpdateCustomerDto })
  @ApiOkResponse({ description: '返回更新后的客户' })
  @Put(':id')
  updateCustomer(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    return this.customerService.updateCustomer(id, dto);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '删除客户（无关联订单时）' })
  @ApiParam({ name: 'id', description: '客户 ID', example: 1 })
  @ApiOkResponse({ description: '删除结果' })
  @Delete(':id')
  deleteCustomer(@Param('id', ParseIntPipe) id: number) {
    return this.customerService.deleteCustomer(id);
  }
}
