import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

await SwaggerParser.validate(fileURLToPath(new URL('../openapi.yaml', import.meta.url)));
console.log('OpenAPI contract is valid.');
