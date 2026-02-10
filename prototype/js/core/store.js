// Simple Store Pattern for Vanilla JS
class Store {
    constructor() {
        this.state = {
            workbookData: {}, // { sheetName: { matrix, merges, range } }
            currentSheet: null,
            configs: {}, // { sheetName: { regions: [] } }
            currentRegionId: null,
            selection: null, // { start: {r,c}, end: {r,c} }
            joinConfigs: [], // Array of join definitions
            customRules: [], // User-defined cleaning rules
            validationRules: [] // User-defined validation rules
        };
        this.listeners = [];
    }

    getState() {
        return this.state;
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notify();
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    // Actions
    setWorkbookData(data) {
        this.setState({ workbookData: data });
    }

    setCurrentSheet(sheetName) {
        this.setState({ currentSheet: sheetName });
    }

    setSelection(selection) {
        this.setState({ selection });
    }

    setJoinConfigs(joinConfigs) {
        this.setState({ joinConfigs });
    }

    setCustomRules(customRules) {
        this.setState({ customRules });
    }

    setValidationRules(validationRules) {
        this.setState({ validationRules });
    }

    resetAllConfigs() {
        this.setState({
            configs: {},
            currentRegionId: null,
            fieldConfigs: [],
            joinConfigs: [],
            validationRules: []
        });
    }
}

export const store = new Store();
