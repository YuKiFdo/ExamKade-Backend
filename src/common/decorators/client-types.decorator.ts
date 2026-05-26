import { applyDecorators, SetMetadata } from '@nestjs/common';

export type ClientType = 'web' | 'mobile' | 'both';

export const CLIENT_TYPES_KEY = 'client_types';
const VERSION_METADATA = '__version__';

export const ClientTypes = (type: ClientType) => {
  return applyDecorators(
    SetMetadata(CLIENT_TYPES_KEY, type),
    SetMetadata(VERSION_METADATA, type === 'both' ? ['web', 'mobile'] : type)
  );
};

export default ClientTypes;
