const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to validate table name to prevent SQL injection
const getValidTableName = async (tableName) => {
    const [tables] = await db.query('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    if (tableNames.includes(tableName)) {
        return tableName;
    }
    throw new Error('Invalid table name');
};

// 1. Get all tables
app.get('/api/tables', async (req, res) => {
    try {
        const [tables] = await db.query('SHOW TABLES');
        const tableNames = tables.map(row => Object.values(row)[0]);
        res.json(tableNames);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch tables' });
    }
});

// 2. Get table schema (columns)
app.get('/api/schema/:tableName', async (req, res) => {
    try {
        const tableName = await getValidTableName(req.params.tableName);
        const [columns] = await db.query(`SHOW COLUMNS FROM ??`, [tableName]);

        const schema = columns.map(col => ({
            field: col.Field,
            type: col.Type,
            null: col.Null,
            key: col.Key,
            default: col.Default,
            extra: col.Extra
        }));

        res.json(schema);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Failed to fetch schema' });
    }
});

// 3. Get all data from a table
app.get('/api/data/:tableName', async (req, res) => {
    try {
        const tableName = await getValidTableName(req.params.tableName);
        const [rows] = await db.query(`SELECT * FROM ??`, [tableName]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Failed to fetch data' });
    }
});

// 4. Add data to a table
app.post('/api/data/:tableName', async (req, res) => {
    try {
        const tableName = await getValidTableName(req.params.tableName);
        const data = req.body;

        // Remove empty values that might be passed for auto-increment fields
        const keys = Object.keys(data).filter(key => data[key] !== '' && data[key] !== null);
        const values = keys.map(key => data[key]);

        if (keys.length === 0) {
            return res.status(400).json({ error: 'No data provided' });
        }

        const placeholders = keys.map(() => '?').join(', ');

        // Building query dynamically but safely
        const query = `INSERT INTO ?? (${keys.map(k => db.escapeId(k)).join(', ')}) VALUES (${placeholders})`;
        const queryValues = [tableName, ...values];

        const [result] = await db.query(query, queryValues);
        res.json({ success: true, message: 'Record added successfully', insertId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Failed to add record' });
    }
});

// 5. Update data in a table
app.put('/api/data/:tableName/:idField/:idValue', async (req, res) => {
    try {
        const tableName = await getValidTableName(req.params.tableName);
        const { idField, idValue } = req.params;
        const data = req.body;

        const keys = Object.keys(data).filter(key => key !== idField); // don't update PK
        const values = keys.map(key => data[key]);

        if (keys.length === 0) {
            return res.status(400).json({ error: 'No data provided to update' });
        }

        const setClause = keys.map(k => `${db.escapeId(k)} = ?`).join(', ');

        const query = `UPDATE ?? SET ${setClause} WHERE ?? = ?`;
        const queryValues = [tableName, ...values, idField, idValue];

        const [result] = await db.query(query, queryValues);
        res.json({ success: true, message: 'Record updated successfully', affectedRows: result.affectedRows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Failed to update record' });
    }
});

// 6. Delete data from a table
app.delete('/api/data/:tableName/:idField/:idValue', async (req, res) => {
    try {
        const tableName = await getValidTableName(req.params.tableName);
        const { idField, idValue } = req.params;

        const query = `DELETE FROM ?? WHERE ?? = ?`;
        const [result] = await db.query(query, [tableName, idField, idValue]);

        res.json({ success: true, message: 'Record deleted successfully', affectedRows: result.affectedRows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Failed to delete record' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
