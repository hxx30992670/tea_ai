import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { AppService } from './app.service';

@ApiTags('基础')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @ApiOperation({ summary: '健康检查' })
  @ApiOkResponse({
    description: '服务健康状态',
    schema: {
      example: {
        code: 200,
        message: 'success',
        data: { service: 'smartstock-server', status: 'ok', timestamp: '2026-04-05T12:00:00.000Z' },
      },
    },
  })
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
