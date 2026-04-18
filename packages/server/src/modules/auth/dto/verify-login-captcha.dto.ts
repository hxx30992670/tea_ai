import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class VerifyLoginCaptchaDto {
  @ApiProperty({ description: '验证码挑战 ID' })
  @IsUUID()
  captchaId!: string;

  @ApiProperty({ description: '滑块最终横向位移', example: 168 })
  @IsInt()
  @Min(0)
  @Max(320)
  offsetX!: number;

  @ApiProperty({ description: '拖动耗时（毫秒）', example: 1420 })
  @IsInt()
  @Min(300)
  @Max(20000)
  durationMs!: number;

  @ApiProperty({
    description: '拖动轨迹采样点（横向位移序列）',
    example: [4, 12, 25, 41, 63, 88, 116, 141, 160, 168],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(6)
  @ArrayMaxSize(120)
  @IsInt({ each: true })
  trail!: number[];
}
