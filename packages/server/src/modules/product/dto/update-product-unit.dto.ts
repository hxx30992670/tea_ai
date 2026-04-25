import { PartialType } from '@nestjs/mapped-types';
import { CreateProductUnitDto } from './create-product-unit.dto';

export class UpdateProductUnitDto extends PartialType(CreateProductUnitDto) {}
