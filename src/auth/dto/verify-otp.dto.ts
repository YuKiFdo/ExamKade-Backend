import { IsOptional, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  referenceNo: string;

  @IsString()
  @Length(4, 8)
  otp: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  source?: 'WEB' | 'MOBILE';
}
