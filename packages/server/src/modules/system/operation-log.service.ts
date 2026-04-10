import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLogEntity } from '../../entities/operation-log.entity';
import { SysUserEntity } from '../../entities/sys-user.entity';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';

@Injectable()
export class OperationLogService {
  constructor(
    @InjectRepository(OperationLogEntity)
    private readonly operationLogRepository: Repository<OperationLogEntity>,
  ) {}

  async createLog(params: {
    module: string;
    action: string;
    operatorId?: number | null;
    detail?: string | null;
  }) {
    const log = this.operationLogRepository.create({
      module: params.module,
      action: params.action,
      operatorId: params.operatorId ?? null,
      detail: params.detail ?? null,
    });

    return this.operationLogRepository.save(log);
  }

  async getLogs(query: OperationLogQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.operationLogRepository
      .createQueryBuilder('log')
      .leftJoin(SysUserEntity, 'user', 'user.id = log.operator_id')
      .select([
        'log.id AS id',
        'log.module AS module',
        'log.action AS action',
        'log.operator_id AS operatorId',
        'log.detail AS detail',
        'log.created_at AS createdAt',
        'user.real_name AS realName',
        'user.username AS username',
      ]);

    if (query.module) {
      qb.andWhere('log.module = :module', { module: query.module });
    }

    if (query.keyword) {
      qb.andWhere(
        '(user.real_name LIKE :keyword OR user.username LIKE :keyword OR log.action LIKE :keyword OR log.detail LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    qb.orderBy('log.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);
    return { list, total, page, pageSize };
  }
}
