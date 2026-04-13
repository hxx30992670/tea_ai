/**
 * 商品与分类控制器
 * 处理商品及分类的增删改查、元数据获取等请求
 * 支持茶叶专业字段（产地、年份、采摘季、批次号等）
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF } from '../../common/constants/roles';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductService } from './product.service';

@ApiTags('商品与分类')
@ApiBearerAuth()
@Controller()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @ApiOperation({ summary: '获取分类树' })
  @ApiOkResponse({ description: '返回分类树数组' })
  @Get('categories')
  getCategoryTree() {
    return this.productService.getCategoryTree();
  }

  @ApiOperation({ summary: '获取商品元数据' })
  @ApiOkResponse({ description: '返回单位、采摘季、分类扩展字段配置' })
  @Get('products/meta')
  getProductMeta() {
    return this.productService.getProductMeta();
  }

  @ApiOperation({ summary: '生成商品 SKU' })
  @ApiQuery({ name: 'categoryId', required: false, example: 1 })
  @ApiOkResponse({ description: '返回生成的 SKU 编码' })
  @Get('products/generate-sku')
  generateSku(@Query('categoryId') categoryId?: number) {
    return this.productService.generateSku(Number(categoryId) || undefined);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '创建分类' })
  @ApiBody({ type: CreateCategoryDto })
  @ApiOkResponse({ description: '返回新建分类' })
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.productService.createCategory(dto);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '更新分类' })
  @ApiParam({ name: 'id', description: '分类 ID', example: 1 })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiOkResponse({ description: '返回更新后的分类' })
  @Put('categories/:id')
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.productService.updateCategory(id, dto);
  }

  @ApiOperation({ summary: '商品列表' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 10 })
  @ApiQuery({ name: 'keyword', required: false, example: '龙井' })
  @ApiQuery({ name: 'categoryId', required: false, example: 1 })
  @ApiQuery({ name: 'teaType', required: false, example: '绿茶' })
  @ApiQuery({ name: 'status', required: false, example: 1 })
  @ApiOkResponse({ description: '分页商品列表' })
  @Get('products')
  getProducts(@Query() query: ProductQueryDto, @CurrentUser() user: AuthUser) {
    return this.productService.getProducts(query, user);
  }

  @ApiOperation({ summary: '商品详情' })
  @ApiParam({ name: 'id', description: '商品 ID', example: 1 })
  @ApiOkResponse({ description: '返回单个商品（与列表项结构一致）' })
  @Get('products/:id')
  getProduct(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.productService.getProductById(id, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '创建商品' })
  @ApiBody({ type: CreateProductDto })
  @ApiOkResponse({ description: '返回新建商品' })
  @Post('products')
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.productService.createProduct(dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '更新商品' })
  @ApiParam({ name: 'id', description: '商品 ID', example: 1 })
  @ApiBody({ type: UpdateProductDto })
  @ApiOkResponse({ description: '返回更新后的商品' })
  @Put('products/:id')
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto, @CurrentUser() user: AuthUser) {
    return this.productService.updateProduct(id, dto, user);
  }

  @Roles(ROLE_ADMIN, ROLE_MANAGER)
  @ApiOperation({ summary: '软删除商品' })
  @ApiParam({ name: 'id', description: '商品 ID', example: 1 })
  @ApiOkResponse({ description: '软删除结果' })
  @Delete('products/:id')
  deleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productService.deleteProduct(id);
  }
}
