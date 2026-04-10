import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from '../../entities/customer.entity';
import { FollowUpEntity } from '../../entities/follow-up.entity';
import { CustomerController } from './customer.controller';
import { FollowUpController } from './follow-up.controller';
import { CustomerService } from './customer.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity, FollowUpEntity])],
  controllers: [CustomerController, FollowUpController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
