import { applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const SwaggerClientType = (clientType: 'web' | 'mobile' | 'both') => {
  return applyDecorators(ApiExtension('x-client', clientType));
};
