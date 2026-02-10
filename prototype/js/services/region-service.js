import { store } from '../core/store.js';
import { dbService } from '../core/database.js';
import { encodeCol } from '../utils/excel-utils.js';

class RegionService {
    /**
     * Save all regions to the database.
     * @param {Array} regions 
     */
    async saveAllRegionsToDB(regions) {
        const state = store.getState();

        for (const region of regions) {
            const sheetName = region.sheetName || state.currentSheet;
            if (!sheetName || !state.workbookData[sheetName]) {
                console.warn(`Skipping region ${region.name}: Sheet ${sheetName} not found.`);
                continue;
            }
            const sheetData = state.workbookData[sheetName].matrix;
            await this.processRegionToTable(region, sheetData);
        }

        console.log("All regions saved to DB.");
    }

    /**
     * Internal logic to extract data from sheet and create a table.
     */
    async processRegionToTable(region, sheetData) {
        let startRow = 0, startCol = 0, endRow = sheetData.length - 1, endCol = sheetData[0].length - 1;

        // Determine Range
        let rangeStr = region.range;
        if (!rangeStr && region.start) {
            rangeStr = region.start + ":" + (region.end || "");
        }

        if (rangeStr && window.XLSX) {
            try {
                const rangeObj = window.XLSX.utils.decode_range(rangeStr);
                startRow = rangeObj.s.r;
                startCol = rangeObj.s.c;
                if (region.end) {
                    endRow = rangeObj.e.r;
                    endCol = rangeObj.e.c;
                } else {
                    const sheetMeta = store.getState().workbookData[region.sheetName || store.getState().currentSheet];
                    if (sheetMeta && sheetMeta.range) {
                        const fullRange = window.XLSX.utils.decode_range(sheetMeta.range);
                        endRow = fullRange.e.r;
                        endCol = fullRange.e.c;
                    }
                }
            } catch (e) {
                console.warn(`Invalid range for ${region.name}, using fallback identification`);
            }
        } else {
            const sheetMeta = store.getState().workbookData[region.sheetName || store.getState().currentSheet];
            if (sheetMeta && sheetMeta.range) {
                const fullRange = window.XLSX.utils.decode_range(sheetMeta.range);
                endRow = fullRange.e.r;
                endCol = fullRange.e.c;
            }
        }

        if (startRow > endRow) return;

        const headerCount = region.headerRows || 1;
        const skipCount = region.skipRows || 0;
        const dataStartRowIdx = startRow + headerCount + skipCount;

        if (dataStartRowIdx > sheetData.length) return;

        // Extract Data
        let rawRows = [];
        // First, add headers
        for (let r = startRow; r < startRow + headerCount; r++) {
            const rowData = [];
            for (let c = startCol; c <= endCol; c++) {
                rowData.push(sheetData[r] ? sheetData[r][c] : null);
            }
            rawRows.push(rowData);
        }
        // Then add data after skipping
        for (let r = dataStartRowIdx; r <= endRow; r++) {
            const rowData = [];
            for (let c = startCol; c <= endCol; c++) {
                rowData.push(sheetData[r] ? sheetData[r][c] : null);
            }
            rawRows.push(rowData);
        }

        // Handle Direction: Transpose if Horizontal
        let finalRows = rawRows;
        let finalColsCount = endCol - startCol + 1;

        if (region.direction === 'horizontal') {
            // Transpose matrix
            // Note: In horizontal mode, headerRows refers to the number of leading columns as headers
            // But for simplicity of this prototype, we treat it as "transposed vertical"
            finalRows = this.transpose(rawRows);
            finalColsCount = rawRows.length;
        }

        // Split headers and data
        const headers = [];
        const dataRows = [];

        // After transposition (or if vertical), we always have a "row-based" structure
        // The first 'headerCount' rows are headers
        const realHeaderCount = region.direction === 'horizontal' ? headerCount : headerCount;
        // Actually, if we transposed, the original headerCount rows became headerCount columns? 
        // No, typically "Horizontal" means headers are on the left.
        // If user says "Header Rows: 2", and "Horizontal", they likely mean first 2 COLUMNS are headers.

        // Let's refine the logic for Horizontal: 
        // If Vertical: [Data is sliced from headerRowIdx, then first N rows are headers]
        // If Horizontal: [Data is sliced from headerRowIdx, then transposed, then first N rows are headers]

        const columnHeaders = [];
        for (let i = 0; i < finalColsCount; i++) {
            if (region.direction === 'horizontal') {
                // For Horizontal, columns in DB are original Excel rows (Row_1, Row_2...)
                columnHeaders.push(`Row_${startRow + i + 1}`);
            } else {
                // For Vertical, columns in DB are original Excel labels (A, B, C...)
                columnHeaders.push(encodeCol(startCol + i));
            }
        }

        const dataOnly = finalRows.slice(headerCount);

        const interleavedHeaders = [];
        const interleavedDataRows = dataOnly.map(() => []);

        for (let i = 0; i < finalColsCount; i++) {
            const originalColHeader = columnHeaders[i];
            interleavedHeaders.push(originalColHeader);
            dataOnly.forEach((row, ri) => interleavedDataRows[ri].push(row[i]));

            // Check if any attributes should be extracted for this column
            if (region.headerAttributes && region.headerAttributes.length > 0) {
                region.headerAttributes.forEach((attr, attrIdx) => {
                    if (!attr.start || !attr.end) return;

                    const isHorizontal = region.direction === 'horizontal';
                    let attrValue = null;

                    try {
                        const rangeIdxStart = window.XLSX.utils.decode_cell(attr.start);
                        const rangeIdxEnd = window.XLSX.utils.decode_cell(attr.end);

                        if (isHorizontal) {
                            // Horizontal mode: Attribute is a range in a specific column
                            const currentRowIdx = startRow + i;
                            const minR = Math.min(rangeIdxStart.r, rangeIdxEnd.r);
                            const maxR = Math.max(rangeIdxStart.r, rangeIdxEnd.r);
                            if (currentRowIdx >= minR && currentRowIdx <= maxR) {
                                attrValue = sheetData[currentRowIdx] ? sheetData[currentRowIdx][rangeIdxStart.c] : null;
                            }
                        } else {
                            // Vertical mode: Attribute is a range in a specific row
                            const currentColIdx = startCol + i;
                            const minC = Math.min(rangeIdxStart.c, rangeIdxEnd.c);
                            const maxC = Math.max(rangeIdxStart.c, rangeIdxEnd.c);
                            if (currentColIdx >= minC && currentColIdx <= maxC) {
                                attrValue = sheetData[rangeIdxStart.r] ? sheetData[rangeIdxStart.r][currentColIdx] : null;
                            }
                        }
                    } catch (e) {
                        console.warn(`Error processing attribute extraction ${attrIdx} for col ${i}:`, e);
                    }

                    // Append attribute column immediately after primary column
                    // Use physical naming: BaseCol_attr_N (1-based)
                    const attrColId = `${originalColHeader}_attr_${attrIdx + 1}`;
                    interleavedHeaders.push(attrColId);
                    interleavedDataRows.forEach((rowContainer, ri) => {
                        const baseVal = dataOnly[ri][i];
                        const isBaseEmpty = baseVal === null || baseVal === undefined || String(baseVal).trim() === "";
                        rowContainer.push(isBaseEmpty ? null : attrValue);
                    });
                });
            }
        }

        // Create Table
        const tableName = region.tableName || `table_${Date.now()}`;
        await dbService.createTableFromData(tableName, interleavedHeaders, interleavedDataRows);

        // Update region in store with assigned tableName
        region.tableName = tableName;
        store.setState({ configs: { ...store.getState().configs, regions: [...store.getState().configs.regions] } });
    }

    transpose(matrix) {
        if (!matrix || matrix.length === 0) return [];
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    }
}

export const regionService = new RegionService();
