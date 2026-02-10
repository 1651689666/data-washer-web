import { getCellValueWithMerges, encodeCol } from '../../utils/excel-utils.js';
import { transformRegistry } from '../transform-registry.js';

/**
 * Base class for merge strategies.
 * Defines the interface for computing field configurations and building execution SQL.
 */
export class BaseStrategy {
    static _utils = { getCellValueWithMerges, encodeCol };
    /**
     * @param {Object} options - Strategy options
     */
    constructor(options = {}) {
        this.options = options;
    }

    /**
     * Get region fields (headers) from workbook data.
     * Returns an array of { id: string, displayName: string }
     */
    getRegionFields(region, workbookData, currentSheet) {
        if (!region || !workbookData) return [];
        const sheetName = region.sheetName || currentSheet;
        const sheet = workbookData[sheetName];
        if (!sheet || !sheet.matrix) return [];

        const sheetData = sheet.matrix;
        const merges = sheet.merges || [];
        let startRow = 0, startCol = 0, endCol = sheetData[0].length - 1;

        if (region.start && window.XLSX) {
            try {
                const rangeObj = window.XLSX.utils.decode_range(region.start + ":" + (region.end || ""));
                startRow = rangeObj.s.r;
                startCol = rangeObj.s.c;
                if (region.end) {
                    endCol = rangeObj.e.c;
                } else if (sheet.range) {
                    const fullRange = window.XLSX.utils.decode_range(sheet.range);
                    endCol = fullRange.e.c;
                }
            } catch (e) {
                console.warn(`Invalid range for ${region.name}`);
            }
        } else if (sheet.range) {
            const fullRange = window.XLSX.utils.decode_range(sheet.range);
            endCol = fullRange.e.c;
        }

        const skipCount = region.skipRows || 0;
        const headerCount = region.headerRows || 1;
        const cascade = region.cascadeHeader === true;
        const direction = region.direction || 'vertical';

        const firstHeaderRowIdx = startRow;
        const lastHeaderRowIdx = firstHeaderRowIdx + headerCount - 1;

        const results = [];
        const { getCellValueWithMerges, encodeCol } = BaseStrategy._utils || {
            getCellValueWithMerges: (m, ms, r, c) => m[r] ? m[r][c] : null,
            encodeCol: (c) => `Col_${c + 1}`
        };

        // Helper to get merge range for a cell
        const getMerge = (r, c) => merges.find(m => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c);

        if (direction === 'horizontal') {
            // Horizontal Mode: Rows are items, first N columns are headers
            // startRow is actually the start of headers
            let startRowEff = startRow + skipCount;
            let endRowEff = sheetData.length - 1;
            if (region.end && window.XLSX) {
                try {
                    const rangeObj = window.XLSX.utils.decode_range(region.start + ":" + region.end);
                    endRowEff = rangeObj.e.r;
                } catch (e) { }
            }

            for (let r = startRowEff; r <= endRowEff; r++) {
                const colId = `Row_${r + 1}`;
                let displayName = "";
                const firstHeaderColIdx = startCol;
                const lastHeaderColIdx = startCol + headerCount - 1;

                if (cascade) {
                    const names = [];
                    let lastMerge = null;
                    for (let c = firstHeaderColIdx; c <= lastHeaderColIdx; c++) {
                        const currentMerge = getMerge(r, c);
                        // If in same merge as previous column, skip
                        if (currentMerge && lastMerge &&
                            currentMerge.s.r === lastMerge.s.r && currentMerge.s.c === lastMerge.s.c) {
                            continue;
                        }
                        const val = getCellValueWithMerges(sheetData, merges, r, c);
                        if (val !== null && val !== undefined && String(val).trim() !== "") {
                            names.push(String(val).trim());
                        }
                        lastMerge = currentMerge;
                    }
                    displayName = names.join("_");
                } else {
                    const val = getCellValueWithMerges(sheetData, merges, r, lastHeaderColIdx);
                    displayName = (val !== null && val !== undefined) ? String(val).trim() : "";
                }

                if (!displayName) displayName = colId;
                results.push({ id: colId, displayName: displayName });

                // --- Interleave Attribute Fields (属性提取) ---
                if (region.headerAttributes && region.headerAttributes.length > 0) {
                    region.headerAttributes.forEach((attr, attrIdx) => {
                        if (!attr.start || !attr.end) return;
                        try {
                            const sIdx = window.XLSX.utils.decode_cell(attr.start);
                            const eIdx = window.XLSX.utils.decode_cell(attr.end);
                            let inRange = false;

                            if (direction === 'horizontal') {
                                const minR = Math.min(sIdx.r, eIdx.r);
                                const maxR = Math.max(sIdx.r, eIdx.r);
                                if (r >= minR && r <= maxR) inRange = true;
                            } else {
                                const minC = Math.min(sIdx.c, eIdx.c);
                                const maxC = Math.max(sIdx.c, eIdx.c);
                                if (c >= minC && c <= maxC) inRange = true;
                            }

                            if (inRange) {
                                results.push({
                                    id: `${colId}_attr_${attrIdx + 1}`,
                                    displayName: `${displayName}_${attr.suffix || ('属性' + (attrIdx + 1))}`,
                                    isAttribute: true
                                });
                            }
                        } catch (err) { /* ignore invalid cells */ }
                    });
                }
            }
        } else {
            // Vertical Mode: Columns are items, first N rows are headers
            for (let c = startCol; c <= endCol; c++) {
                const colId = encodeCol(c);
                let displayName = "";

                if (cascade) {
                    const names = [];
                    let lastMerge = null;
                    for (let r = firstHeaderRowIdx; r <= lastHeaderRowIdx; r++) {
                        const currentMerge = getMerge(r, c);
                        // If in same merge as previous row, skip
                        if (currentMerge && lastMerge &&
                            currentMerge.s.r === lastMerge.s.r && currentMerge.s.c === lastMerge.s.c) {
                            continue;
                        }
                        const val = getCellValueWithMerges(sheetData, merges, r, c);
                        if (val !== null && val !== undefined && String(val).trim() !== "") {
                            names.push(String(val).trim());
                        }
                        lastMerge = currentMerge;
                    }
                    displayName = names.join("_");
                } else {
                    const val = getCellValueWithMerges(sheetData, merges, lastHeaderRowIdx, c);
                    displayName = (val !== null && val !== undefined) ? String(val).trim() : "";
                }

                if (!displayName) displayName = colId;
                results.push({ id: colId, displayName: displayName });

                // --- Interleave Attribute Fields (属性提取) ---
                if (region.headerAttributes && region.headerAttributes.length > 0) {
                    region.headerAttributes.forEach((attr, attrIdx) => {
                        if (!attr.start || !attr.end) return;
                        try {
                            const sIdx = window.XLSX.utils.decode_cell(attr.start);
                            const eIdx = window.XLSX.utils.decode_cell(attr.end);
                            let inRange = false;

                            const minC = Math.min(sIdx.c, eIdx.c);
                            const maxC = Math.max(sIdx.c, eIdx.c);
                            if (c >= minC && c <= maxC) inRange = true;

                            if (inRange) {
                                results.push({
                                    id: `${colId}_attr_${attrIdx + 1}`,
                                    displayName: `${displayName}_${attr.suffix || ('属性' + (attrIdx + 1))}`,
                                    isAttribute: true
                                });
                            }
                        } catch (err) { /* ignore invalid cells */ }
                    });
                }
            }
        }

        return results;
    }

    /**
     * Compute field configurations for the given regions.
     * @returns {Array} fieldConfigs
     */
    computeFields(regions, workbookData, currentSheet) {
        throw new Error("computeFields not implemented");
    }

    /**
     * Build the execution SQL.
     * @returns {string} SQL statement
     */
    buildSql(regions, fieldConfigs) {
        throw new Error("buildSql not implemented");
    }

    /**
     * Utility to apply strategy-specific SQL transformations.
     * @param {string} expr - The SQL expression
     * @param {Array<string>|string} strategies - List of rule IDs (or single ID for backward compat)
     */
    applyStrategiesToExpr(expr, strategies) {
        if (expr === 'NULL') return 'NULL';
        if (!strategies) return expr;

        // Ensure array
        const rules = Array.isArray(strategies) ? strategies : [strategies];
        if (rules.length === 0) return expr;

        // Apply rules in sequence: 
        // If config is ['trim', 'upper'], user likely means trim then upper.
        // In SQL nesting: UPPER(TRIM(col)).
        // So we reduce from left to right, wrapping the accumulator.
        return rules.reduce((currentExpr, ruleId) => {
            if (ruleId === 'none') return currentExpr;

            // 1. Try TransformRegistry
            const rule = transformRegistry.getRule(ruleId);
            if (rule && (rule.engine === 'sql' || rule.engine === 'both') && rule.sqlExpr) {
                return rule.sqlExpr(currentExpr);
            }

            // 2. Legacy fallback
            switch (ruleId) {
                case 'date_fmt': return `CASE WHEN ${currentExpr} IS NOT NULL THEN TO_CHAR(${currentExpr}::TIMESTAMP, 'YYYY-MM-DD') ELSE NULL END`;
                case 'number_conv': return `CAST(${currentExpr} AS NUMERIC)`;
                default: return currentExpr;
            }
        }, expr);
    }
}
