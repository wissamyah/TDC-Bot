const fs = require('fs').promises;
const path = require('path');

class Storage {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
    }

    async ensureDataDir() {
        try {
            await fs.access(this.dataDir);
        } catch {
            await fs.mkdir(this.dataDir, { recursive: true });
        }
    }

    async readJSON(filename) {
        try {
            await this.ensureDataDir();
            const filePath = path.join(this.dataDir, filename);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    async writeJSON(filename, data) {
        await this.ensureDataDir();
        const filePath = path.join(this.dataDir, filename);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async updateJSON(filename, updateFn) {
        const data = await this.readJSON(filename) || {};
        const updatedData = await updateFn(data);
        await this.writeJSON(filename, updatedData);
        return updatedData;
    }
}

module.exports = new Storage();