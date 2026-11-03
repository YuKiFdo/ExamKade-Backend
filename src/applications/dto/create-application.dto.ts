import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsString()
  dialogAppId?: string;

  @IsOptional()
  @IsString()
  dialogPassword?: string;

  @IsOptional()
  @IsString()
  dialogAppHash?: string;

  @IsOptional()
  @IsString()
  mobitelAppId?: string;

  @IsOptional()
  @IsString()
  mobitelPassword?: string;

  @IsOptional()
  @IsString()
  mobitelAppHash?: string;
}

