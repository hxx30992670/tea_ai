import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CustomerEntity } from '../../entities/customer.entity';
import { FollowUpEntity } from '../../entities/follow-up.entity';
import { SaleOrderEntity } from '../../entities/sale-order.entity';
import { SysUserEntity } from '../../entities/sys-user.entity';
import { CancelFollowUpDto } from './dto/cancel-follow-up.dto';
import { CompleteFollowUpDto } from './dto/complete-follow-up.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { FollowUpQueryDto } from './dto/follow-up-query.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type FollowUpDisplayStatus = 'pending' | 'completed' | 'cancelled' | 'overdue';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepository: Repository<CustomerEntity>,
    @InjectRepository(FollowUpEntity)
    private readonly followUpRepository: Repository<FollowUpEntity>,
    @InjectRepository(SysUserEntity)
    private readonly userRepository: Repository<SysUserEntity>,
  ) {}

  async getCustomers(query: CustomerQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin(SaleOrderEntity, 'saleOrder', 'saleOrder.customer_id = customer.id')
      .select([
        'customer.id AS id',
        'customer.name AS name',
        'customer.contact_name AS contactName',
        'customer.phone AS phone',
        'customer.address AS address',
        'customer.remark AS remark',
        'customer.created_at AS createdAt',
        'COALESCE(SUM(saleOrder.total_amount), 0) AS totalAmount',
        'COALESCE(SUM(saleOrder.total_amount - saleOrder.returned_amount - saleOrder.received_amount), 0) AS receivableAmount',
      ])
      .groupBy('customer.id');

    if (query.keyword) {
      qb.andWhere(
        '(customer.name LIKE :keyword OR customer.contact_name LIKE :keyword OR customer.phone LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    qb.orderBy('customer.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await Promise.all([qb.getRawMany(), this.customerRepository.count()]);

    const customerIds = list
      .map((item: { id?: number | string }) => Number(item.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (customerIds.length === 0) {
      return { list, total, page, pageSize };
    }

    const followUps = await this.followUpRepository
      .createQueryBuilder('followUp')
      .where('followUp.customer_id IN (:...customerIds)', { customerIds })
      .andWhere('followUp.next_follow_date IS NOT NULL')
      .andWhere("(followUp.status IS NULL OR followUp.status = 'pending')")
      .select([
        'followUp.id AS id',
        'followUp.customer_id AS customerId',
        'followUp.intent_level AS intentLevel',
        'followUp.next_follow_date AS nextFollowDate',
        'followUp.status AS status',
        'followUp.created_at AS createdAt',
      ])
      .orderBy('followUp.next_follow_date', 'ASC')
      .addOrderBy('followUp.created_at', 'DESC')
      .getRawMany();

    const nearestFollowUpMap = new Map<number, { intentLevel?: string; nextFollowDate?: string; status?: FollowUpDisplayStatus }>();

    for (const row of followUps) {
      const customerId = Number(row.customerId);
      const nextFollowDate = row.nextFollowDate as string | undefined;
      if (!customerId || !nextFollowDate) continue;

      if (!nearestFollowUpMap.has(customerId)) {
        nearestFollowUpMap.set(customerId, {
          intentLevel: (row.intentLevel as string | undefined) ?? undefined,
          nextFollowDate,
          status: this.resolveFollowUpDisplayStatus({
            nextFollowDate,
            status: (row.status as string | undefined) ?? 'pending',
          }),
        });
      }
    }

    const mergedList = list.map((item: { id?: number | string } & Record<string, unknown>) => {
      const customerId = Number(item.id);
      const nearest = nearestFollowUpMap.get(customerId);
      return {
        ...item,
        latestIntentLevel: nearest?.intentLevel,
        nextFollowDate: nearest?.nextFollowDate,
        nextFollowStatus: nearest?.status,
      };
    });

    return { list: mergedList, total, page, pageSize };
  }

  async createCustomer(dto: CreateCustomerDto) {
    const customer = this.customerRepository.create({
      name: dto.name,
      contactName: dto.contactName ?? null,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
      remark: dto.remark ?? null,
    });

    return this.customerRepository.save(customer);
  }

  async updateCustomer(id: number, dto: UpdateCustomerDto) {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('客户不存在');
    }

    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.contactName !== undefined) customer.contactName = dto.contactName ?? null;
    if (dto.phone !== undefined) customer.phone = dto.phone ?? null;
    if (dto.address !== undefined) customer.address = dto.address ?? null;
    if (dto.remark !== undefined) customer.remark = dto.remark ?? null;

    return this.customerRepository.save(customer);
  }

  async getFollowUps(query: FollowUpQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 3;
    const now = this.nowString();
    const qb = this.followUpRepository.createQueryBuilder('followUp');
    qb.setParameter('now', now);

    if (query.customerId) {
      qb.andWhere('followUp.customer_id = :customerId', { customerId: query.customerId });
    }

    if (query.keyword) {
      qb.andWhere('(followUp.content LIKE :keyword OR followUp.feedback LIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }

    if (query.followType) {
      qb.andWhere('followUp.follow_type = :followType', { followType: query.followType });
    }

    if (query.dateFrom) {
      qb.andWhere('followUp.next_follow_date >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('followUp.next_follow_date <= :dateTo', { dateTo: query.dateTo });
    }

    if (query.status === 'overdue') {
      qb.andWhere("(followUp.status IS NULL OR followUp.status = 'pending')")
        .andWhere('followUp.next_follow_date IS NOT NULL')
        .andWhere('followUp.next_follow_date < :now', { now });
    } else if (query.status === 'pending') {
      qb.andWhere("(followUp.status IS NULL OR followUp.status = 'pending')")
        .andWhere('(followUp.next_follow_date IS NULL OR followUp.next_follow_date >= :now)', { now });
    } else if (query.status) {
      qb.andWhere('followUp.status = :status', { status: query.status });
    }

    qb.orderBy(
      "CASE WHEN (followUp.status IS NULL OR followUp.status = 'pending') AND followUp.next_follow_date IS NOT NULL AND followUp.next_follow_date < :now THEN 0 WHEN (followUp.status IS NULL OR followUp.status = 'pending') THEN 1 WHEN followUp.status = 'completed' THEN 2 ELSE 3 END",
      'ASC',
    );
    qb.addOrderBy("CASE WHEN followUp.next_follow_date IS NULL THEN 1 ELSE 0 END", 'ASC');
    qb.addOrderBy('followUp.next_follow_date', 'DESC');
    qb.addOrderBy('followUp.created_at', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    const decoratedList = await this.decorateFollowUps(list);
    return { list: decoratedList, total, page, pageSize };
  }

  async deleteCustomer(id: number) {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) throw new NotFoundException('客户不存在');

    const orderCount = await this.customerRepository.manager
      .getRepository(SaleOrderEntity)
      .count({ where: { customerId: id } });
    if (orderCount > 0) {
      throw new BadRequestException(`该客户有 ${orderCount} 笔订单，无法删除`);
    }

    await this.followUpRepository.delete({ customerId: id });
    await this.customerRepository.delete(id);
    return { success: true };
  }

  async createFollowUp(dto: CreateFollowUpDto, operatorId?: number) {
    const customer = await this.customerRepository.findOne({ where: { id: dto.customerId } });
    if (!customer) {
      throw new NotFoundException('客户不存在');
    }

    const followUp = this.followUpRepository.create({
      customerId: dto.customerId,
      content: dto.content,
      followType: dto.followType ?? null,
      intentLevel: dto.intentLevel ?? null,
      status: 'pending',
      feedback: null,
      nextFollowDate: dto.nextFollowDate ?? null,
      operatorId: operatorId ?? null,
      completedBy: null,
      completedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      cancelReason: null,
      updatedAt: this.nowString(),
    });

    const saved = await this.followUpRepository.save(followUp);
    return this.decorateFollowUp(saved);
  }

  async updateFollowUp(id: number, dto: UpdateFollowUpDto, operatorId?: number) {
    const followUp = await this.followUpRepository.findOne({ where: { id } });
    if (!followUp) {
      throw new NotFoundException('跟进记录不存在');
    }

    this.assertFollowUpEditable(followUp);

    if (dto.content !== undefined) followUp.content = dto.content;
    if (dto.followType !== undefined) followUp.followType = dto.followType ?? null;
    if (dto.intentLevel !== undefined) followUp.intentLevel = dto.intentLevel ?? null;
    if (dto.nextFollowDate !== undefined) followUp.nextFollowDate = dto.nextFollowDate ?? null;
    if (operatorId !== undefined) followUp.operatorId = operatorId;
    followUp.updatedAt = this.nowString();

    const saved = await this.followUpRepository.save(followUp);
    return this.decorateFollowUp(saved);
  }

  async completeFollowUp(id: number, dto: CompleteFollowUpDto, operatorId?: number) {
    const followUp = await this.followUpRepository.findOne({ where: { id } });
    if (!followUp) {
      throw new NotFoundException('跟进记录不存在');
    }

    if ((followUp.status ?? 'pending') !== 'pending') {
      throw new BadRequestException('当前状态下不能确认跟进');
    }

    followUp.feedback = dto.feedback;
    if (dto.followType !== undefined) followUp.followType = dto.followType ?? null;
    if (dto.intentLevel !== undefined) followUp.intentLevel = dto.intentLevel ?? null;
    followUp.status = 'completed';
    followUp.completedBy = operatorId ?? null;
    followUp.completedAt = this.nowString();
    followUp.updatedAt = followUp.completedAt;

    const saved = await this.followUpRepository.save(followUp);
    return this.decorateFollowUp(saved);
  }

  async cancelFollowUp(id: number, dto: CancelFollowUpDto, operatorId?: number) {
    const followUp = await this.followUpRepository.findOne({ where: { id } });
    if (!followUp) {
      throw new NotFoundException('跟进记录不存在');
    }

    this.assertFollowUpCancelable(followUp);

    followUp.status = 'cancelled';
    followUp.cancelReason = dto.reason?.trim() || null;
    followUp.cancelledBy = operatorId ?? null;
    followUp.cancelledAt = this.nowString();
    followUp.updatedAt = followUp.cancelledAt;

    const saved = await this.followUpRepository.save(followUp);
    return this.decorateFollowUp(saved);
  }

  private async decorateFollowUps(list: FollowUpEntity[]) {
    const userIds = new Set<number>();

    for (const item of list) {
      if (item.operatorId) userIds.add(item.operatorId);
      if (item.completedBy) userIds.add(item.completedBy);
      if (item.cancelledBy) userIds.add(item.cancelledBy);
    }

    const users = userIds.size > 0
      ? await this.userRepository.findBy({ id: In([...userIds]) })
      : [];

    const userMap = new Map(users.map((user) => [user.id, user.realName]));

    return list.map((item) => this.decorateFollowUp(item, userMap));
  }

  private decorateFollowUp(followUp: FollowUpEntity, userMap = new Map<number, string>()) {
    const displayStatus = this.resolveFollowUpDisplayStatus(followUp);
    const isOverdue = displayStatus === 'overdue';

    return {
      ...followUp,
      displayStatus,
      isOverdue,
      canEdit: (followUp.status ?? 'pending') === 'pending' && !isOverdue,
      canCancel: (followUp.status ?? 'pending') === 'pending' && !isOverdue,
      canConfirm: (followUp.status ?? 'pending') === 'pending',
      operatorName: followUp.operatorId ? userMap.get(followUp.operatorId) : undefined,
      completedByName: followUp.completedBy ? userMap.get(followUp.completedBy) : undefined,
      cancelledByName: followUp.cancelledBy ? userMap.get(followUp.cancelledBy) : undefined,
    };
  }

  private resolveFollowUpDisplayStatus(followUp: { nextFollowDate?: string | null; status?: string | null }): FollowUpDisplayStatus {
    const status = followUp.status ?? 'pending';

    if (status === 'completed' || status === 'cancelled') {
      return status;
    }

    if (this.isFollowUpOverdue(followUp)) {
      return 'overdue';
    }

    return 'pending';
  }

  private assertFollowUpEditable(followUp: FollowUpEntity) {
    if ((followUp.status ?? 'pending') !== 'pending') {
      throw new BadRequestException('只有待跟进记录可以编辑');
    }

    if (this.isFollowUpOverdue(followUp)) {
      throw new BadRequestException('逾期未跟进记录不能编辑');
    }
  }

  private assertFollowUpCancelable(followUp: FollowUpEntity) {
    if ((followUp.status ?? 'pending') !== 'pending') {
      throw new BadRequestException('只有待跟进记录可以取消');
    }

    if (this.isFollowUpOverdue(followUp)) {
      throw new BadRequestException('逾期未跟进记录不能取消');
    }
  }

  private isFollowUpOverdue(followUp: { nextFollowDate?: string | null; status?: string | null }) {
    return (followUp.status ?? 'pending') === 'pending'
      && !!followUp.nextFollowDate
      && new Date(followUp.nextFollowDate).getTime() < Date.now();
  }

  private nowString() {
    return new Date().toISOString();
  }
}
