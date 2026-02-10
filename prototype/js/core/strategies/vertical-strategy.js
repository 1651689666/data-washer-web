import { BaseStrategy } from './base-strategy.js';

export class VerticalStrategy extends BaseStrategy {
    /**
     * @param {Object} vConfig - Vertical merge configuration { matchMode: 'byName' | 'byPosition' }
     */
    constructor(vConfig = {}) {
        super(vConfig);
        this.mode = vConfig.matchMode || 'byName';
    }

    computeFields(regions, workbookData, currentSheet) {
        const fieldConfigs = [];
        console.log(`[VerticalStrategy] Computing fields with mode: ${this.mode}`);

        if (this.mode === 'byPosition') {
            let maxCols = 0;
            const tableHeaders = regions.map(r => this.getRegionFields(r, workbookData, currentSheet));
            tableHeaders.forEach(h => maxCols = Math.max(maxCols, h.length));

            for (let i = 0; i < maxCols; i++) {
                const sources = [];
                let primaryDisplayName = null;
                regions.forEach((r, rIdx) => {
                    const headers = tableHeaders[rIdx];
                    if (headers[i]) {
                        sources.push({ regionId: r.id, regionName: r.name, fieldName: headers[i].id, displayName: headers[i].displayName });
                        if (!primaryDisplayName) primaryDisplayName = headers[i].displayName;
                    }
                });

                fieldConfigs.push({
                    id: Math.random().toString(36).substr(2, 9),
                    name: primaryDisplayName || `Column_${i + 1}`,
                    alias: primaryDisplayName || `Column_${i + 1}`,
                    sources: sources,
                    strategy: 'none'
                });
            }
        } else {
            // mode === 'byName'
            // We want to merge fields with the same name ACROSS regions, 
            // but keep same-named fields WITHIN the same region separate.
            const fieldGroups = []; // Array of { name, sources: [] }

            regions.forEach(r => {
                const headers = this.getRegionFields(r, workbookData, currentSheet);
                headers.forEach(h => {
                    // Find an existing group with this name that DOES NOT already have a source from this region
                    let targetGroup = fieldGroups.find(g => g.name === h.displayName && !g.sources.some(s => s.regionId === r.id));

                    if (!targetGroup) {
                        targetGroup = {
                            id: Math.random().toString(36).substr(2, 9),
                            name: h.displayName,
                            sources: []
                        };
                        fieldGroups.push(targetGroup);
                    }

                    targetGroup.sources.push({
                        regionId: r.id,
                        regionName: r.name,
                        fieldName: h.id,
                        displayName: h.displayName,
                        isAttribute: h.isAttribute
                    });
                });
            });

            fieldGroups.forEach(group => {
                fieldConfigs.push({
                    id: group.id,
                    name: group.name,
                    alias: group.name,
                    sources: group.sources,
                    strategy: 'none',
                    isAttribute: group.sources.some(s => s.isAttribute)
                });
            });
        }

        // Automatic Alias Deduplication & Physical Alias Assignment
        const usedAliases = new Set();
        const usedPhys = new Set();

        fieldConfigs.forEach(config => {
            // 1. Digital Display Alias Deduplication (for UI)
            let originalAlias = config.alias || config.name;
            let finalAlias = originalAlias;
            let counter = 1;
            while (usedAliases.has(finalAlias)) {
                finalAlias = `${originalAlias}_${counter++}`;
            }
            config.alias = finalAlias;
            usedAliases.add(finalAlias);

            // 2. Physical SQL Alias Generation (table#col format)
            const firstSrc = config.sources?.[0];
            const region = regions.find(r => r.id === firstSrc?.regionId);
            const tableName = (region?.tableName || "t").substring(0, 30);
            const colName = firstSrc?.fieldName || "Col";

            let basePhys = `${tableName}#${colName}`;
            let finalPhys = basePhys;
            let pCounter = 1;
            while (usedPhys.has(finalPhys)) {
                finalPhys = `${basePhys}_${pCounter++}`;
            }
            config.physAlias = finalPhys;
            usedPhys.add(finalPhys);
        });

        console.log(`[VerticalStrategy] Computed ${fieldConfigs.length} field configs.`);
        return fieldConfigs;
    }

    buildSql(regions, fieldConfigs) {
        const visibleConfigs = fieldConfigs.filter(c => !c.hidden);
        if (visibleConfigs.length === 0) return "SELECT 'No visible fields' AS error";

        const sqls = regions.map((r, rIdx) => {
            const selectParts = visibleConfigs.map(config => {
                const source = (config.sources || []).find(src => src.regionId === r.id);
                let expr = source ? `"${source.fieldName}"` : 'NULL';
                expr = this.applyStrategiesToExpr(expr, config.strategies);
                // Use physAlias instead of business alias
                return `${expr} AS "${config.physAlias}"`;
            });
            return `SELECT ${selectParts.join(", ")}, ${rIdx} AS _reg_idx, "_row_idx" FROM "${r.tableName}"`;
        });

        const unionSql = sqls.join(" UNION ALL ");
        const finalFields = visibleConfigs.map(config => `"${config.physAlias}"`).join(", ");
        return `SELECT ${finalFields} FROM (${unionSql}) AS t_union ORDER BY _reg_idx, "_row_idx"`;
    }
}
