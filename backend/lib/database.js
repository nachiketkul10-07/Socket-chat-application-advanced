// sql.js wrapper with a better-sqlite3-like API and file persistence.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

function rowFromColumns(columns, values) {
    const row = {};
    for (let i = 0; i < columns.length; i++) {
        row[columns[i]] = values[i];
    }
    return row;
}

class Statement {
    constructor(db, sql, persist) {
        this.db = db;
        this.sql = sql;
        this.persist = persist;
        this.stmt = db.prepare(sql);
    }

    _bind(params) {
        if (!params || params.length === 0) return;
        this.stmt.bind(params);
    }

    get(...params) {
        this.stmt.reset();
        if (params.length) this.stmt.bind(params);
        if (this.stmt.step()) {
            const row = this.stmt.getAsObject();
            this.stmt.reset();
            return row;
        }
        this.stmt.reset();
        return undefined;
    }

    all(...params) {
        this.stmt.reset();
        if (params.length) this.stmt.bind(params);
        const rows = [];
        while (this.stmt.step()) {
            rows.push(this.stmt.getAsObject());
        }
        this.stmt.reset();
        return rows;
    }

    run(...params) {
        this.stmt.reset();
        if (params.length) this.stmt.bind(params);
        this.stmt.step();
        this.stmt.reset();
        this.persist();
        return { changes: this.db.getRowsModified() };
    }
}

class Database {
    constructor(sqlJsDb, filePath, persistFn) {
        this._db = sqlJsDb;
        this.filePath = filePath;
        this._persistFn = persistFn;
    }

    exec(sql) {
        this._db.exec(sql);
        this._persistFn();
    }

    prepare(sql) {
        return new Statement(this._db, sql, this._persistFn);
    }

    transaction(fn) {
        return (...args) => {
            this._db.run('BEGIN');
            try {
                const result = fn(...args);
                this._db.run('COMMIT');
                this._persistFn(true);
                return result;
            } catch (err) {
                try { this._db.run('ROLLBACK'); } catch (_) { /* ignore */ }
                throw err;
            }
        };
    }

    export() {
        return this._db.export();
    }

    close() {
        this._persistFn(true);
        this._db.close();
    }
}

async function openDatabase(filePath) {
    const SQL = await initSqlJs();
    if (filePath === ':memory:') {
        const sqlJsDb = new SQL.Database();
        return new Database(sqlJsDb, ':memory:', () => {});
    }

    const abs = path.resolve(filePath);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let sqlJsDb;
    if (fs.existsSync(abs)) {
        sqlJsDb = new SQL.Database(fs.readFileSync(abs));
    } else {
        sqlJsDb = new SQL.Database();
    }

    let persistTimer = null;
    const persist = (immediate = false) => {
        const write = () => {
            persistTimer = null;
            const data = sqlJsDb.export();
            const tmp = abs + '.tmp';
            fs.writeFileSync(tmp, Buffer.from(data));
            fs.renameSync(tmp, abs);
        };
        if (immediate) {
            if (persistTimer) clearTimeout(persistTimer);
            write();
            return;
        }
        if (persistTimer) return;
        persistTimer = setTimeout(write, 40);
    };

    return new Database(sqlJsDb, abs, persist);
}

module.exports = { openDatabase };
