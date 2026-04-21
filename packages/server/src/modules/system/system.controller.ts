/**
 * 系统管理控制器
 * 处理用户管理、系统设置（含 AI 配置）及操作日志查询等请求
 */
import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLE_ADMIN } from '../../common/constants/roles';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreateUserDto } from './dto/create-user.dto';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';
import { UpdateSystemSettingsDto } from './dto/system-settings.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { SystemService } from './system.service';

@ApiTags('系统')
@ApiBearerAuth()
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @ApiOperation({ summary: '获取系统设置' })
  @ApiOkResponse({ description: '返回系统设置与 AI 配置' })
  @Get('settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.systemService.getSettings(user);
  }

  @ApiOperation({ summary: '获取语音识别能力' })
  @ApiOkResponse({ description: '返回语音识别是否可用、供应商与模型信息' })
  @Get('speech-capabilities')
  getSpeechCapabilities(@CurrentUser() user: AuthUser) {
    return this.systemService.getSpeechCapabilities(user);
  }

  @ApiOperation({ summary: '获取语音识别能力（兼容旧版路径）' })
  @ApiOkResponse({ description: '返回语音识别是否可用、供应商与模型信息' })
  @Get('speech-config')
  getSpeechConfigCompat(@CurrentUser() user: AuthUser) {
    return this.systemService.getSpeechCapabilities(user);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: '更新系统设置' })
  @ApiBody({ type: UpdateSystemSettingsDto })
  @ApiOkResponse({ description: '返回更新后的系统设置' })
  @Put('settings')
  updateSettings(@Body() dto: UpdateSystemSettingsDto, @CurrentUser() user: AuthUser) {
    return this.systemService.updateSettings(dto, user);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: '系统用户列表' })
  @ApiOkResponse({ description: '分页用户列表和角色选项' })
  @Get('users')
  getUsers(@Query() query: UserQueryDto) {
    return this.systemService.getUsers(query);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: '创建系统用户' })
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ description: '返回新建用户' })
  @Post('users')
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.systemService.createUser(dto, user);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: '编辑系统用户' })
  @ApiParam({ name: 'id', description: '用户 ID', example: 2 })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ description: '返回更新后的用户' })
  @Put('users/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.systemService.updateUser(id, dto, user);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: '启用或停用系统用户' })
  @ApiParam({ name: 'id', description: '用户 ID', example: 2 })
  @ApiBody({ type: UpdateUserStatusDto })
  @ApiOkResponse({ description: '返回状态更新后的用户' })
  @Put('users/:id/status')
  updateUserStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.systemService.updateUserStatus(id, dto, user);
  }

  @Roles(ROLE_ADMIN)
  @ApiOperation({ summary: '操作日志列表' })
  @ApiOkResponse({ description: '分页操作日志' })
  @Get('operation-logs')
  getOperationLogs(@Query() query: OperationLogQueryDto) {
    return this.systemService.getOperationLogs(query);
  }
}
