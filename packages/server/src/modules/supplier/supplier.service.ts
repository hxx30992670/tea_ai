import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(SupplierEntity)
    private readonly supplierRepository: Repository<SupplierEntity>,
  ) {}

  async getSuppliers(query: SupplierQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.supplierRepository.createQueryBuilder('supplier');

    if (query.keyword) {
      qb.andWhere(
        '(supplier.name LIKE :keyword OR supplier.contact_name LIKE :keyword OR supplier.phone LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    qb.orderBy('supplier.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async createSupplier(dto: CreateSupplierDto) {
    const supplier = this.supplierRepository.create({
      name: dto.name,
      contactName: dto.contactName ?? null,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
      supplyCategory: dto.supplyCategory ?? null,
      paymentTermsType: dto.paymentTermsType ?? null,
      paymentDays: dto.paymentDays ?? null,
      remark: dto.remark ?? null,
    });

    return this.supplierRepository.save(supplier);
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto) {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('供应商不存在');
    }

    if (dto.name !== undefined) supplier.name = dto.name;
    if (dto.contactName !== undefined) supplier.contactName = dto.contactName ?? null;
    if (dto.phone !== undefined) supplier.phone = dto.phone ?? null;
    if (dto.address !== undefined) supplier.address = dto.address ?? null;
    if (dto.supplyCategory !== undefined) supplier.supplyCategory = dto.supplyCategory ?? null;
    if (dto.paymentTermsType !== undefined) supplier.paymentTermsType = dto.paymentTermsType ?? null;
    if (dto.paymentDays !== undefined) supplier.paymentDays = dto.paymentDays ?? null;
    if (dto.remark !== undefined) supplier.remark = dto.remark ?? null;

    return this.supplierRepository.save(supplier);
  }

  async deleteSupplier(id: number) {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException('供应商不存在');

    const orderCount = await this.supplierRepository.manager
      .getRepository(PurchaseOrderEntity)
      .count({ where: { supplierId: id } });
    if (orderCount > 0) {
      throw new BadRequestException(`该供应商有 ${orderCount} 笔采购订单，无法删除`);
    }

    await this.supplierRepository.delete(id);
    return { success: true };
  }
}
