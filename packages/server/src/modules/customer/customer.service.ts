import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerEntity } from '../../entities/customer.entity';
import { FollowUpEntity } from '../../entities/follow-up.entity';
import { SaleOrderEntity } from '../../entities/sale-order.entity';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { FollowUpQueryDto } from './dto/follow-up-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepository: Repository<CustomerEntity>,
    @InjectRepository(FollowUpEntity)
    private readonly followUpRepository: Repository<FollowUpEntity>,
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
        'COALESCE(SUM(saleOrder.total_amount - saleOrder.received_amount), 0) AS receivableAmount',
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
    return { list, total, page, pageSize };
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
    const pageSize = query.pageSize ?? 10;
    const qb = this.followUpRepository.createQueryBuilder('followUp');

    if (query.customerId) {
      qb.andWhere('followUp.customer_id = :customerId', { customerId: query.customerId });
    }

    qb.orderBy('followUp.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
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
      nextFollowDate: dto.nextFollowDate ?? null,
      operatorId: operatorId ?? null,
    });

    return this.followUpRepository.save(followUp);
  }
}
