import { BaseStrategy } from './base-strategy.js';

export class HorizontalStrategy extends BaseStrategy {
    /**
     * @param {Object} hConfig - Horizontal merge configuration { masterRegionId, slaves: [] }
     */
    constructor(hConfig = {}) {
        super(hConfig);
        this.hConfig = hConfig;
    }

    computeFields(regions, workbookData, currentSheet) {
        const masterId = this.hConfig.masterRegionId || (regions[0] ? regions[0].id : null);
        const orderedRegions = [];
        const master = regions.find(r => r.id === masterId);
        if (master) orderedRegions.push(master);

        (this.hConfig.slaves || []).forEach(s => {
            const r = regions.find(reg => reg.id === s.regionId);
            if (r) orderedRegions.push(r);
        });

        // Let's use a "Group" approach
        const fieldGroups = []; // Array of [{regionId, fieldName}]

        orderedRegions.forEach(r => {
            const headers = this.getRegionFields(r, workbookData, currentSheet);
            headers.forEach(h => {
                fieldGroups.push([{ regionId: r.id, regionName: r.name, fieldName: h.id, displayName: h.displayName, isAttribute: h.isAttribute }]);
            });
        });

        // Merge groups based on Join Keys
        (this.hConfig.slaves || []).forEach(s => {
            const slaveReg = regions.find(r => r.id === s.regionId);
            if (!slaveReg) return;
            (s.joinKeys || []).forEach(k => {
                if (!k.slaveField || !k.targetField) return;

                let targetRegId = null;
                if (k.targetInstanceId === 'MASTER') targetRegId = masterId;
                else if (k.targetInstanceId.startsWith('SLAVE_')) {
                    const idx = parseInt(k.targetInstanceId.split('_')[1]);
                    if (this.hConfig.slaves[idx]) targetRegId = this.hConfig.slaves[idx].regionId;
                }

                if (targetRegId) {
                    // Match using displayName because join configuration in UI uses headers text
                    let slaveGroupIdx = fieldGroups.findIndex(g => g.some(f => f.regionId === slaveReg.id && f.displayName === k.slaveField));
                    let targetGroupIdx = fieldGroups.findIndex(g => g.some(f => f.regionId === targetRegId && f.displayName === k.targetField));

                    if (slaveGroupIdx !== -1 && targetGroupIdx !== -1 && slaveGroupIdx !== targetGroupIdx) {
                        const slaveGroup = fieldGroups.splice(slaveGroupIdx, 1)[0];
                        targetGroupIdx = fieldGroups.findIndex(g => g.some(f => f.regionId === targetRegId && f.displayName === k.targetField));
                        fieldGroups[targetGroupIdx].push(...slaveGroup);
                    }
                }
            });
        });

        const fieldConfigs = fieldGroups.map(group => {
            let bestSource = group[0];
            let minOrder = Infinity;
            group.forEach(src => {
                const order = orderedRegions.findIndex(r => r.id === src.regionId);
                if (order < minOrder) {
                    minOrder = order;
                    bestSource = src;
                }
            });

            return {
                id: Math.random().toString(36).substr(2, 9),
                name: bestSource.displayName,
                alias: bestSource.displayName,
                sources: group,
                strategy: 'none',
                isAttribute: group.some(s => s.isAttribute)
            };
        });

        // Automatic Alias Deduplication & Physical Alias Assignment
        const usedAliases = new Set();
        const usedPhys = new Set();

        fieldConfigs.forEach(config => {
            // 1. Digital Display Alias Deduplication
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

        return fieldConfigs;
    }

    buildSql(regions, fieldConfigs) {
        const masterId = this.hConfig.masterRegionId || (regions[0] ? regions[0].id : null);
        const master = regions.find(r => r.id === masterId);
        if (!master) return "SELECT 'Error: Master table not found' AS error";

        const regionToAlias = new Map();
        regionToAlias.set(master.id, 'm');

        const orderedSlaves = [];
        (this.hConfig.slaves || []).forEach((s, idx) => {
            const r = regions.find(reg => reg.id === s.regionId);
            if (r) {
                orderedSlaves.push({ ...s, region: r, alias: `s${idx + 1}` });
                regionToAlias.set(r.id, `s${idx + 1}`);
            }
        });

        const visibleConfigs = fieldConfigs.filter(c => !c.hidden);
        const selectParts = visibleConfigs.map(config => {
            let expr = "";
            const sources = config.sources || [];

            if (sources.length > 0) {
                let bestSrc = sources[0];
                let minOrder = Infinity;

                sources.forEach(src => {
                    const alias = regionToAlias.get(src.regionId);
                    if (alias === 'm') {
                        if (0 < minOrder) { minOrder = 0; bestSrc = src; }
                    } else if (alias && alias.startsWith('s')) {
                        const idx = parseInt(alias.substring(1));
                        if (idx < minOrder) { minOrder = idx; bestSrc = src; }
                    }
                });

                const alias = regionToAlias.get(bestSrc.regionId);
                if (alias) {
                    expr = `${alias}."${bestSrc.fieldName}"`;
                } else {
                    expr = "NULL";
                }
            } else {
                expr = "NULL";
            }

            expr = this.applyStrategiesToExpr(expr, config.strategies);
            // Use physAlias instead of business alias
            return `${expr} AS "${config.physAlias}"`;
        });

        if (selectParts.length === 0) return "SELECT 'No visible fields' AS error";

        let fromClause = `"${master.tableName}" m`;
        orderedSlaves.forEach(s => {
            const onConditions = (s.joinKeys || []).map(k => {
                if (!k.slaveField || !k.targetField) return null;
                const targetRegionId = k.targetInstanceId === 'MASTER' ? masterId :
                    (this.hConfig.slaves[parseInt(k.targetInstanceId.split('_')[1])] || {}).regionId;
                const targetAlias = regionToAlias.get(targetRegionId);
                if (!targetAlias) return null;

                // Resolve slave physical fieldName
                const slaveSrc = fieldConfigs.flatMap(c => c.sources).find(src => src.regionId === s.region.id && src.displayName === k.slaveField);
                const slavePhys = slaveSrc ? slaveSrc.fieldName : k.slaveField;

                // Resolve target physical fieldName
                const targetSrc = fieldConfigs.flatMap(c => c.sources).find(src => src.regionId === targetRegionId && src.displayName === k.targetField);
                const targetPhys = targetSrc ? targetSrc.fieldName : k.targetField;

                return `${s.alias}."${slavePhys}" = ${targetAlias}."${targetPhys}"`;
            }).filter(c => c !== null).join(" AND ");

            const joinType = (s.joinType || 'left').toUpperCase();
            const joinKeyword = joinType === 'FULL' ? 'FULL OUTER JOIN' : `${joinType} JOIN`;

            fromClause += ` ${joinKeyword} "${s.region.tableName}" ${s.alias} ON ${onConditions || '1=1'}`;
        });

        const finalFields = visibleConfigs.map(config => `"${config.physAlias}"`).join(", ");
        return `SELECT ${finalFields} FROM (SELECT ${selectParts.join(", ")}, m."_row_idx" FROM ${fromClause}) AS t_union ORDER BY "_row_idx"`;
    }
}
