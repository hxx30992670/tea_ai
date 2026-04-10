import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { FollowUpQueryDto } from './dto/follow-up-query.dto';
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
}
