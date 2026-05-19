import { IsEnum, IsString, Matches, IsOptional } from 'class-validator';
import { Operator } from '@prisma/client';

export class RequestOtpDto {
  @IsString()
  @Matches(/^(0?7\d{8}|94\d{9})$/, {
    message: 'Enter a valid Sri Lankan mobile number',
  })
  mobile: string;

  @IsOptional()
  @IsEnum(Operator)
  operator?: Operator;
}
