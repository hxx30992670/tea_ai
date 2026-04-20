import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { CancelFollowUpDto } from './dto/cancel-follow-up.dto';
import { CompleteFollowUpDto } from './dto/complete-follow-up.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { FollowUpQueryDto } from './dto/follow-up-query.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { CustomerService } from './customer.service';

@ApiTags('客户跟进')
@ApiBearerAuth()
@Controller('follow-ups')
export class FollowUpController {
  constructor(private readonly customerService: CustomerService) {}

  @ApiOperation({ summary: '跟进记录列表' })
  @ApiOkResponse({ description: '分页跟进记录' })
  @Get()
  getFollowUps(@Query() query: FollowUpQueryDto) {
    return this.customerService.getFollowUps(query);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '新增跟进记录' })
  @ApiBody({ type: CreateFollowUpDto })
  @ApiOkResponse({ description: '返回新建跟进记录' })
  @Post()
  createFollowUp(@Body() dto: CreateFollowUpDto, @CurrentUser() user: AuthUser) {
    return this.customerService.createFollowUp(dto, user.sub);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '编辑跟进记录' })
  @ApiBody({ type: UpdateFollowUpDto })
  @ApiOkResponse({ description: '返回更新后的跟进记录' })
  @Put(':id')
  updateFollowUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customerService.updateFollowUp(id, dto, user.sub);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '确认完成跟进' })
  @ApiBody({ type: CompleteFollowUpDto })
  @ApiOkResponse({ description: '返回确认后的跟进记录' })
  @Post(':id/complete')
  completeFollowUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteFollowUpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customerService.completeFollowUp(id, dto, user.sub);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)
  @ApiOperation({ summary: '取消待跟进计划' })
  @ApiBody({ type: CancelFollowUpDto })
  @ApiOkResponse({ description: '返回取消后的跟进记录' })
  @Post(':id/cancel')
  cancelFollowUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelFollowUpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customerService.cancelFollowUp(id, dto, user.sub);
  }
}
