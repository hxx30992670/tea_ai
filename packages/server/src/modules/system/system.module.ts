import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationLogEntity } from '../../entities/operation-log.entity';
import { SysUserEntity } from '../../entities/sys-user.entity';
import { SystemSettingEntity } from '../../entities/system-setting.entity';
import { OperationLogService } from './operation-log.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemSettingEntity, OperationLogEntity, SysUserEntity])],
  controllers: [SystemController],
  providers: [SystemService, OperationLogService],
  exports: [SystemService, OperationLogService],
})
export class SystemModule {}
