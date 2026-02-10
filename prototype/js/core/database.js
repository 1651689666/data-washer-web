
import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js";
import { VerticalStrategy } from './strategies/vertical-strategy.js';
import { HorizontalStrategy } from './strategies/horizontal-strategy.js';

class DatabaseService {
    constructor() {
        this.db = null;
    }

    async init() {
        if (!this.db) {
            console.log("Initializing PGLite...");
            try {
                this.db = new PGlite();
                await this.db.waitReady;
                console.log("PGLite Ready!");
                // Test query
                await this.db.query("SELECT 1");
            } catch (e) {
                console.error("Failed to init PGLite", e);
            }
        }
    }


    /**
     * Build the final execution SQL based on merge strategy and field configs
     */
    buildExecutionSql(regions, mergeStrategy, fieldConfigs) {
        if (!fieldConfigs || fieldConfigs.length === 0) {
            // Fallback: simple select from first table if no configs
            const tableName = regions[0] ? regions[0].tableName : 't_main';
            return `SELECT * FROM "${tableName}" ORDER BY "_row_idx"`;
        }

        let strategy;
        if (mergeStrategy.type === 'vertical') {
            strategy = new VerticalStrategy(mergeStrategy.verticalConfig || {});
        } else if (mergeStrategy.type === 'horizontal') {
            strategy = new HorizontalStrategy(mergeStrategy.horizontalConfig || {});
        } else {
            // Default: Vertical by Name
            strategy = new VerticalStrategy(mergeStrategy.verticalConfig || { matchMode: 'byName' });
        }

        return strategy.buildSql(regions, fieldConfigs);
    }

    buildSingleTableSql(regionId, regions, fieldConfigs) {
        const region = regions.find(r => r.id === regionId) || regions[0];
        if (!region) return "SELECT 'Error: Table not found' AS error";

        const visibleConfigs = fieldConfigs.filter(c => !c.hidden);
        if (visibleConfigs.length === 0) return "SELECT 'No visible fields' AS error";

        const strategy = new VerticalStrategy(); // Use helper method from strategy
        const selectParts = visibleConfigs.map(config => {
            const source = (config.sources || []).find(src => src.regionId === region.id);
            let expr = source ? `"${source.fieldName}"` : 'NULL';
            expr = strategy.applyStrategyToExpr(expr, config.strategy);
            // Use physAlias for consistency and to avoid length/ambiguity issues
            return `${expr} AS "${config.physAlias || config.id}"`;
        });

        return `SELECT ${selectParts.join(", ")} FROM "${region.tableName}" ORDER BY "_row_idx"`;
    }

    async getTableColumns(tableName) {
        // Query information_schema.
        // Note: PGLite information_schema might be sensitive to quoting or exact matches.
        const res = await this.execute(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name NOT LIKE '\\_%' ORDER BY ordinal_position`, [tableName]);
        return res.rows.map(r => r.column_name);
    }

    async execute(sql, params = []) {
        if (!this.db) await this.init();
        try {
            const ret = await this.db.query(sql, params);
            return ret;
        } catch (e) {
            console.error("SQL Error:", e);
            throw e;
        }
    }

    /**
     * Create a table from 2D array
     * @param {string} tableName 
     * @param {string[]} headers 
     * @param {any[][]} rows 
     */
    async createTableFromData(tableName, headers, rows) {
        if (!this.db) await this.init();

        // 1. Drop existing
        await this.execute(`DROP TABLE IF EXISTS "${tableName}"`);

        // 2. Deduplicate headers (PostgreSQL does not allow duplicate column names)
        // More robust approach: use a Set to track assigned names and a while loop for unique suffix
        const finalHeaders = [];
        const usedNames = new Set();
        headers.forEach((h, i) => {
            let name = String(h || "").trim();
            if (!name) name = `Col_${i + 1}`;

            let finalName = name;
            let counter = 1;
            while (usedNames.has(finalName)) {
                finalName = `${name}_${counter++}`;
            }
            usedNames.add(finalName);
            finalHeaders.push(finalName);
        });

        console.log(`Creating table ${tableName} with headers:`, finalHeaders);

        // 3. Create Table (with hidden row index column)
        const colDefs = finalHeaders.map(h => `"${h}" TEXT`).join(", ");
        const createSql = `CREATE TABLE "${tableName}" (${colDefs}, "_row_idx" INTEGER);`;
        await this.execute(createSql);

        // 3. Insert Data
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const placeholders = row.map((_, j) => `$${j + 1}`).join(", ");
            const values = row.map(v => (v === null || v === undefined) ? null : String(v));

            const finalPlaceholders = `${placeholders}, $${row.length + 1}`;
            const finalValues = [...values, i];

            // CRITICAL FIX: Pass finalValues (including index) to match finalPlaceholders
            await this.execute(`INSERT INTO "${tableName}" VALUES (${finalPlaceholders})`, finalValues);
        }

        console.log(`Table ${tableName} created with ${rows.length} rows.`);
    }
}

export const dbService = new DatabaseService();
