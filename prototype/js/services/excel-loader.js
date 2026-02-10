
import { store } from '../core/store.js';

class ExcelLoader {
    constructor() {
        this.fileInput = null;
    }

    init() {
        // Find existing input or create one?
        // App seems to have #excel-upload
        const input = document.getElementById('excel-upload');
        if (input) {
            this.bindEvents(input);
        } else {
            console.warn("Excel upload input not found");
        }
    }

    bindEvents(input) {
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.processFile(file);
            }
        });
    }

    async processFile(file) {
        console.log("Processing file:", file.name);
        const reader = new FileReader();

        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            // Assuming XLSX is available via CDN (window.XLSX)
            if (!window.XLSX) {
                console.error("XLSX library not loaded");
                return;
            }

            const workbook = window.XLSX.read(data, { type: 'array' });
            this.processWorkbook(workbook);
        };

        reader.readAsArrayBuffer(file);
    }

    processWorkbook(workbook) {
        const sheetsData = {};

        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            // Convert to 2D array (header: 1 means array of arrays)
            // raw: false ensures we get formatted strings (e.g. yyyy/MM) instead of raw Excel numbers
            const json = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

            sheetsData[sheetName] = {
                matrix: json,
                merges: sheet['!merges'] || [],
                range: sheet['!ref']
            };
        });

        // Update Store
        store.setWorkbookData(sheetsData);
        store.setCurrentSheet(workbook.SheetNames[0]);

        this.renderTabs(Object.keys(sheetsData));
        console.log("Workbook loaded:", Object.keys(sheetsData));
    }

    renderTabs(sheetNames) {
        const tabsContainer = document.getElementById('sheet-tabs');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';
        const state = store.getState();

        sheetNames.forEach(name => {
            const btn = document.createElement('button');
            btn.className = 'sheet-tab'; // Changed from 'tab-btn' to match CSS
            if (name === state.currentSheet) btn.classList.add('active');
            btn.textContent = name;

            btn.addEventListener('click', () => {
                store.setCurrentSheet(name);
                // Re-render tabs to update active state
                this.renderTabs(sheetNames);
            });

            tabsContainer.appendChild(btn);
        });
    }
}

export const excelLoader = new ExcelLoader();
