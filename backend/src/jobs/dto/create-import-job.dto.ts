import { IsOptional, IsArray, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateImportJobDto {
  @ApiPropertyOptional({
    description: 'Array of data records to import',
    example: [
      { externalId: 'SKU-001', name: 'Ultra Noise-Cancelling Headphones', price: 199.99, category: 'Electronics' },
      { externalId: 'SKU-002', name: 'Ergonomic Desk Chair', price: 349.50, category: 'Furniture' },
    ],
  })
  @IsOptional()
  @IsArray()
  records?: Record<string, any>[];

  @ApiPropertyOptional({
    description: 'Raw CSV content string to import',
    example: "externalId,name,price,category\nSKU-001,Headphones,199.99,Electronics\nSKU-002,Desk Chair,349.50,Furniture",
  })
  @IsOptional()
  @IsString()
  csvContent?: string;
}
