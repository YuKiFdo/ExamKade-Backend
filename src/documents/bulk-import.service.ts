import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStatus, Medium, FacetKey, Prisma } from '@prisma/client';
import { slugify } from '../common/utils/slug.util';

interface ImportedRowError {
  row: number;
  message: string;
}

@Injectable()
export class BulkImportService {
  constructor(private prisma: PrismaService) {}

  // Helper to escape XML special characters
  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Helper to construct a category's hierarchical name (e.g. "Past Papers > Ordinary Level")
  private getHierarchicalName(cat: { name: string; parentId: string | null }, allCats: any[]): string {
    const parts: string[] = [cat.name];
    let current = cat;
    while (current.parentId) {
      const parent = allCats.find((c) => c.id === current.parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts.join(' > ');
  }

  /**
   * Generate a global XML Spreadsheet 2003 template
   */
  async generateTemplate(): Promise<string> {
    // Fetch all categories and facets
    const [categories, facets] = await Promise.all([
      this.prisma.category.findMany(),
      this.prisma.facetValue.findMany({
        orderBy: [{ facetKey: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
    ]);

    const categoryNames = categories.map((c) => this.getHierarchicalName(c, categories)).sort();

    // Group facets by facetKey
    const groupedFacets: Record<FacetKey, string[]> = {
      [FacetKey.EXAM]: [],
      [FacetKey.GRADE]: [],
      [FacetKey.SUBJECT]: [],
      [FacetKey.YEAR]: [],
      [FacetKey.MEDIUM]: [],
      [FacetKey.TERM]: [],
      [FacetKey.PROVINCE]: [],
    };

    facets.forEach((f) => {
      if (groupedFacets[f.facetKey]) {
        groupedFacets[f.facetKey].push(f.label);
      }
    });

    const maxLength = Math.max(
      categoryNames.length,
      ...Object.values(groupedFacets).map((arr) => arr.length),
      1,
    );

    // Columns:
    // A: Title, B: Category, C: Description, D: Status
    // E-K: Filters
    const baseHeaders = ['Title (Required)', 'Category (Required)', 'Description (Optional)', 'Status (PUBLISHED/DRAFT)'];
    const filterHeaders = [
      `Filter: ${FacetKey.EXAM}`,
      `Filter: ${FacetKey.GRADE}`,
      `Filter: ${FacetKey.SUBJECT}`,
      `Filter: ${FacetKey.YEAR}`,
      `Filter: ${FacetKey.MEDIUM}`,
      `Filter: ${FacetKey.TERM}`,
      `Filter: ${FacetKey.PROVINCE}`,
    ];
    const allHeaders = [...baseHeaders, ...filterHeaders];

    let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:CharSet="1" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="RequiredHeader">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#C00000" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#4F81BD" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="FilterHeader">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#8064A2" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Documents">
  <Table>
    <Column ss:Width="220"/>
    <Column ss:Width="250"/>
    <Column ss:Width="200"/>
    <Column ss:Width="130"/>
    <Column ss:Width="140"/>
    <Column ss:Width="140"/>
    <Column ss:Width="140"/>
    <Column ss:Width="140"/>
    <Column ss:Width="140"/>
    <Column ss:Width="140"/>
    <Column ss:Width="140"/>
   <Row ss:Height="24">
`;

    // Add headers
    allHeaders.forEach((h) => {
      let style = 'Header';
      if (h.startsWith('Title') || h.startsWith('Category')) {
        style = 'RequiredHeader';
      } else if (h.startsWith('Filter:')) {
        style = 'FilterHeader';
      }
      xml += `    <Cell ss:StyleID="${style}"><Data ss:Type="String">${h}</Data></Cell>\n`;
    });

    xml += `   </Row>\n`;

    // Add sample row
    const sampleCategory = categoryNames[0] || 'Select Category...';
    xml += `   <Row ss:Height="20">\n`;
    xml += `    <Cell><Data ss:Type="String">Sample Document Title</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${this.escapeXml(sampleCategory)}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">This is a sample description</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">PUBLISHED</Data></Cell>\n`;

    const keys = [
      FacetKey.EXAM,
      FacetKey.GRADE,
      FacetKey.SUBJECT,
      FacetKey.YEAR,
      FacetKey.MEDIUM,
      FacetKey.TERM,
      FacetKey.PROVINCE,
    ];

    keys.forEach((key) => {
      const sampleValue = groupedFacets[key]?.[0] || '';
      xml += `    <Cell><Data ss:Type="String">${this.escapeXml(sampleValue)}</Data></Cell>\n`;
    });

    xml += `   </Row>\n`;
    xml += `  </Table>\n`;

    // Data Validation Rules
    xml += `  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
   <DataValidation>
    <Range>R2C2:R1000C2</Range>
    <Type>List</Type>
    <CellRangeList/>
    <Formula1>&apos;Allowed Values&apos;!R2C1:R${categoryNames.length + 1}C1</Formula1>
   </DataValidation>
   <DataValidation>
    <Range>R2C4:R1000C4</Range>
    <Type>List</Type>
    <CellRangeList/>
    <Formula1>&quot;PUBLISHED,DRAFT&quot;</Formula1>
   </DataValidation>\n`;

    // Add validation lists for EXAM to PROVINCE (Columns 5 to 11)
    keys.forEach((key, idx) => {
      const colNum = 5 + idx; // Column E starts at index 5
      const refColNum = 2 + idx; // In Allowed Values sheet, Categories is 1, so filters are 2-8
      const count = groupedFacets[key].length;
      if (count > 0) {
        xml += `   <DataValidation>
    <Range>R2C${colNum}:R1000C${colNum}</Range>
    <Type>List</Type>
    <CellRangeList/>
    <Formula1>&apos;Allowed Values&apos;!R2C${refColNum}:R${count + 1}C${refColNum}</Formula1>
   </DataValidation>\n`;
      }
    });

    xml += `  </WorksheetOptions>
 </Worksheet>\n`;

    // Generate Allowed Values reference sheet
    xml += ` <Worksheet ss:Name="Allowed Values">
  <Table>
   <Row ss:Height="20">
    <Cell ss:StyleID="Header"><Data ss:Type="String">CATEGORY</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">EXAM</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">GRADE</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">SUBJECT</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">YEAR</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">MEDIUM</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">TERM</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">PROVINCE</Data></Cell>
   </Row>\n`;

    for (let r = 0; r < maxLength; r++) {
      xml += `   <Row>\n`;
      // Category cell
      const catVal = categoryNames[r];
      xml += catVal
        ? `    <Cell><Data ss:Type="String">${this.escapeXml(catVal)}</Data></Cell>\n`
        : `    <Cell/>\n`;

      // Filter cells
      keys.forEach((key) => {
        const item = groupedFacets[key][r];
        xml += item
          ? `    <Cell><Data ss:Type="String">${this.escapeXml(item)}</Data></Cell>\n`
          : `    <Cell/>\n`;
      });
      xml += `   </Row>\n`;
    }

    xml += `  </Table>\n`;
    xml += ` </Worksheet>\n`;
    xml += `</Workbook>\n`;

    return xml;
  }

  /**
   * Parse XML Spreadsheet 2003 format
   */
  private parseXmlSpreadsheet(xmlText: string): string[][] {
    const docWorksheetMatch = /<Worksheet[^>]*ss:Name="Documents"[^>]*>([\s\S]*?)<\/Worksheet>/i.exec(xmlText);
    const targetXml = docWorksheetMatch ? docWorksheetMatch[1] : xmlText;

    const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/gi;
    const cellRegex = /<Cell([^>]*)>([\s\S]*?)<\/Cell>|<Cell[^>]*\/>/gi;
    const dataRegex = /<Data[^>]*>([\s\S]*?)<\/Data>/i;

    const rows: string[][] = [];
    let rowMatch;

    while ((rowMatch = rowRegex.exec(targetXml)) !== null) {
      const rowXml = rowMatch[1];
      const rowData: string[] = [];
      let cellMatch;
      let colIndex = 0;

      while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
        if (cellMatch[0].toLowerCase().startsWith('<cell') && cellMatch[0].endsWith('/>')) {
          rowData[colIndex] = '';
          colIndex++;
          continue;
        }

        const cellAttrs = cellMatch[1] || '';
        const cellXml = cellMatch[2] || '';

        const indexMatch = /ss:Index="(\d+)"/i.exec(cellAttrs);
        if (indexMatch) {
          colIndex = parseInt(indexMatch[1], 10) - 1;
        }

        const dataMatch = dataRegex.exec(cellXml);
        let cellValue = '';
        if (dataMatch) {
          cellValue = dataMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
        }

        rowData[colIndex] = cellValue.trim();
        colIndex++;
      }

      if (rowData.length > 0) {
        rows.push(rowData);
      }
    }

    return rows;
  }

  /**
   * Validate Excel metadata and create document records in DRAFT status
   */
  async importBulkMetadata(xmlBuffer: Buffer) {
    const xmlText = xmlBuffer.toString('utf8');
    const parsedRows = this.parseXmlSpreadsheet(xmlText);

    if (parsedRows.length <= 1) {
      throw new BadRequestException('The uploaded template is empty or contains no headers.');
    }

    const headers = parsedRows[0].map((h) => h.trim());

    const titleIdx = headers.findIndex((h) => h.toLowerCase().startsWith('title'));
    const categoryIdx = headers.findIndex((h) => h.toLowerCase().startsWith('category'));
    const descIdx = headers.findIndex((h) => h.toLowerCase().startsWith('description'));
    const statusIdx = headers.findIndex((h) => h.toLowerCase().startsWith('status'));

    if (titleIdx === -1) {
      throw new BadRequestException('Excel must contain a "Title (Required)" column.');
    }
    if (categoryIdx === -1) {
      throw new BadRequestException('Excel must contain a "Category (Required)" column.');
    }

    const keys = [
      FacetKey.EXAM,
      FacetKey.GRADE,
      FacetKey.SUBJECT,
      FacetKey.YEAR,
      FacetKey.MEDIUM,
      FacetKey.TERM,
      FacetKey.PROVINCE,
    ];

    const filterColumns: Array<{ key: FacetKey; idx: number }> = [];
    keys.forEach((key) => {
      const idx = headers.findIndex((h) => h.toLowerCase() === `filter: ${key.toLowerCase()}`);
      if (idx !== -1) {
        filterColumns.push({ key, idx });
      }
    });

    const [allDbCategories, allDbFacets] = await Promise.all([
      this.prisma.category.findMany(),
      this.prisma.facetValue.findMany(),
    ]);

    const errors: ImportedRowError[] = [];
    const validRowsToImport: Array<{
      title: string;
      categoryId: string;
      description: string;
      status: DocumentStatus;
      facetValueIds: string[];
    }> = [];

    for (let r = 1; r < parsedRows.length; r++) {
      const row = parsedRows[r];
      const rowNum = r + 1;

      const title = row[titleIdx]?.trim() || '';
      const categoryVal = row[categoryIdx]?.trim() || '';
      const description = descIdx !== -1 ? row[descIdx]?.trim() || '' : '';
      const statusText = statusIdx !== -1 ? row[statusIdx]?.trim()?.toUpperCase() || '' : 'DRAFT';

      if (!title && !categoryVal) {
        continue; // Empty row
      }
      if (title.toLowerCase() === 'sample document title') {
        continue; // Skip sample
      }

      if (!title) {
        errors.push({ row: rowNum, message: 'Title is required.' });
        continue;
      }
      if (!categoryVal) {
        errors.push({ row: rowNum, message: 'Category selection is required.' });
        continue;
      }

      // Resolve category by hierarchical name
      const matchedCat = allDbCategories.find((c) => {
        const hName = this.getHierarchicalName(c, allDbCategories);
        return hName.trim().toLowerCase() === categoryVal.toLowerCase();
      });

      if (!matchedCat) {
        errors.push({
          row: rowNum,
          message: `Category "${categoryVal}" was not found in the database.`,
        });
        continue;
      }

      // Validate status
      let status: DocumentStatus = DocumentStatus.DRAFT;
      if (statusText === 'PUBLISHED') {
        status = DocumentStatus.PUBLISHED;
      } else if (statusText === 'DRAFT' || !statusText) {
        status = DocumentStatus.DRAFT;
      } else {
        errors.push({
          row: rowNum,
          message: `Invalid status "${statusText}" (expected PUBLISHED or DRAFT).`,
        });
      }

      // Map filter options
      const facetValueIds: string[] = [];
      for (const { key, idx } of filterColumns) {
        const cellVal = row[idx]?.trim() || '';
        if (cellVal) {
          const matchingFacet = allDbFacets.find(
            (df) =>
              df.facetKey === key &&
              df.label.trim().toLowerCase() === cellVal.toLowerCase(),
          );

          if (matchingFacet) {
            facetValueIds.push(matchingFacet.id);
          } else {
            errors.push({
              row: rowNum,
              message: `Filter value "${cellVal}" for ${key} was not found in the database.`,
            });
          }
        }
      }

      if (errors.filter((e) => e.row === rowNum).length === 0) {
        validRowsToImport.push({
          title,
          categoryId: matchedCat.id,
          description,
          status,
          facetValueIds,
        });
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        errors: errors.map((e) => `Row ${e.row}: ${e.message}`),
      };
    }

    if (validRowsToImport.length === 0) {
      throw new BadRequestException('No valid documents found in the uploaded XML sheet.');
    }

    // Process metadata creation
    const createdDocuments: Array<{
      id: string;
      title: string;
      status: DocumentStatus;
      categoryName: string;
      files: any[];
    }> = [];

    for (const row of validRowsToImport) {
      let baseSlug = slugify(row.title);
      let slug = baseSlug;
      let slugExists = await this.prisma.document.findUnique({ where: { slug } });
      let attempts = 1;
      while (slugExists) {
        slug = `${baseSlug}-${attempts}`;
        slugExists = await this.prisma.document.findUnique({ where: { slug } });
        attempts++;
      }

      const created = await this.prisma.document.create({
        data: {
          title: row.title,
          slug,
          description: row.description,
          categoryId: row.categoryId,
          status: row.status,
          publishedAt: row.status === DocumentStatus.PUBLISHED ? new Date() : null,
          facets: row.facetValueIds.length
            ? {
                create: row.facetValueIds.map((id) => ({ facetValueId: id })),
              }
            : undefined,
        },
        include: {
          category: true,
          files: true,
        },
      });

      createdDocuments.push({
        id: created.id,
        title: created.title,
        status: created.status,
        categoryName: created.category.name,
        files: created.files,
      });
    }

    return {
      success: true,
      count: createdDocuments.length,
      documents: createdDocuments,
    };
  }
}
