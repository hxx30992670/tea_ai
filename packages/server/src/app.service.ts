import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'smartstock-server',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
