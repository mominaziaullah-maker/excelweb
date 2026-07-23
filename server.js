const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// MySQL Connection Pool (Auto-reconnects on timeout)
const db = mysql.createPool({
    host: process.env.DB_HOST || "mysql-1ecc1d3b-mominaziaullah-28be.b.aivencloud.com",
    user: process.env.DB_USER || "avnadmin",
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME || "defaultdb",
    port: process.env.DB_PORT || 10527,
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection pool
db.getConnection((err, connection) => {
    if (err) {
        console.error("Database connection failed:", err);
    } else {
        console.log("MySQL Cloud Database Pool Connected Successfully!");
        connection.release();
    }
});

// ==========================================
// API ROUTES (Must be placed BEFORE static files)
// ==========================================

// 1. Calculation & Save API Endpoint (POST)
app.post('/api/calculate-and-save', (req, res) => {
    const {
        project_name, motor_power_hp, voltage_v, efficiency, power_factor,
        lra_code, rvat_tap_percent, req_vd_tap_percent, req_vd_100_percent, available_sc_isc
    } = req.body;

    try {
        const hp = parseFloat(motor_power_hp) || 0;
        const volt = parseFloat(voltage_v) || 0;
        const eff = parseFloat(efficiency) || 0;
        const pf = parseFloat(power_factor) || 0;
        const lra_c = parseFloat(lra_code) || 0;
        const tap = parseFloat(rvat_tap_percent) || 0;
        const req_vd_tap = parseFloat(req_vd_tap_percent) || 0;
        const req_vd_100 = parseFloat(req_vd_100_percent) || 0;
        const sc_isc = parseFloat(available_sc_isc) || 0;

        if (volt === 0 || eff === 0 || pf === 0) {
            return res.status(400).json({ error: "Voltage, Efficiency, and Power Factor cannot be zero." });
        }

        const fla_amps = (hp * 746) / (volt * eff * pf * Math.sqrt(3));
        const lra_amps = fla_amps * lra_c;
        const kva = (volt * fla_amps * Math.sqrt(3)) / 1000;
        const lr_kva = (volt * lra_amps * Math.sqrt(3)) / 1000;

        const kv = volt / 1000;
        const available_sc_mva = (sc_isc * Math.sqrt(3) * kv) / 1000;
        const lr_mva_100 = lr_kva / 1000;
        
        const tap_fraction = tap / 100;
        const i_tap_percent = (Math.pow(tap_fraction, 2) * lra_c + 0.2) * fla_amps;
        
        const lr_kva_tap = i_tap_percent * Math.sqrt(3) * kv;
        const lr_mva_tap = lr_kva_tap / 1000;

        const xd_tap = lr_kva_tap !== 0 ? (kva / lr_kva_tap) : 0;

        const calculated_vd_100_percent = (lr_mva_100 + available_sc_mva) !== 0 ? 
            ((lr_mva_100 / (lr_mva_100 + available_sc_mva)) * 100) : 0;
            
        const calculated_vd_tap_percent = (lr_mva_tap + available_sc_mva) !== 0 ? 
            ((lr_mva_tap / (lr_mva_tap + available_sc_mva)) * 100) : 0;

        const req_sc_100_mva = req_vd_100 !== 0 ? (((100 - req_vd_100) * lr_mva_100) / req_vd_100) : 0;
        const req_sc_tap_mva = req_vd_tap !== 0 ? (((100 - req_vd_tap) * lr_mva_tap) / req_vd_tap) : 0;

        const sqlQuery = `
            INSERT INTO motor_calculations 
            (
                project_name, calculation_type, motor_power_hp, voltage_v, efficiency, power_factor, 
                lra_code, rvat_tap_percent, req_vd_tap_percent, req_vd_100_percent, available_sc_isc, 
                fla_amps, lra_amps, kva, lr_kva, req_sc_tap_mva, req_sc_100_mva, 
                calculated_vd_tap_percent, calculated_vd_100_percent,
                i_tap, lrkva_tap, xd_tap, lrmva_tap, lrmva_100, available_sc_mva
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            project_name || "Unnamed Project", 
            "without_xfmr", 
            hp, volt, eff, pf, lra_c, tap, 
            req_vd_tap, req_vd_100, sc_isc,
            fla_amps, lra_amps, kva, lr_kva, req_sc_tap_mva, req_sc_100_mva, 
            calculated_vd_tap_percent, calculated_vd_100_percent,
            i_tap_percent, lr_kva_tap, xd_tap, lr_mva_tap, lr_mva_100, available_sc_mva
        ];

        db.query(sqlQuery, values, (err, result) => {
            if (err) {
                console.error("Database Save Error Details:", err);
                return res.status(500).json({ error: "Database saving failed: " + err.message });
            }
            res.json({ 
                message: "Calculation saved successfully!", 
                insertedId: result.insertId,
                calculatedResults: {
                    fla_amps: fla_amps.toFixed(2),
                    lra_amps: lra_amps.toFixed(2),
                    kva: kva.toFixed(2),
                    lr_kva: lr_kva.toFixed(2),
                    calculated_vd_tap_percent: calculated_vd_tap_percent.toFixed(2),
                    calculated_vd_100_percent: calculated_vd_100_percent.toFixed(2),
                    req_sc_tap_mva: req_sc_tap_mva.toFixed(2),
                    req_sc_100_mva: req_sc_100_mva.toFixed(2),
                    i_tap: i_tap_percent.toFixed(2),
                    lrkva_tap: lr_kva_tap.toFixed(2),
                    xd_tap: xd_tap.toFixed(5),
                    lrmva_tap: lr_mva_tap.toFixed(2),
                    lrmva_100: lr_mva_100.toFixed(2),
                    available_sc_mva: available_sc_mva.toFixed(2)
                }
            });
        });

    } catch (calcError) {
        console.error("Calculation Error:", calcError);
        res.status(400).json({ error: "Invalid input values or math error." });
    }
});

// 2. Fetch Calculations History (GET)
app.get('/api/calculations', (req, res) => {
    const sqlQuery = "SELECT * FROM motor_calculations ORDER BY created_at DESC";
    db.query(sqlQuery, (err, results) => {
        if (err) return res.status(500).json({ error: "Database fetch failed." });
        res.json(results);
    });
});

// 3. Delete Calculation Endpoint (DELETE)
app.delete('/api/calculations/:id', (req, res) => {
    const recordId = req.params.id;
    const sqlQuery = "DELETE FROM motor_calculations WHERE id = ?";
    db.query(sqlQuery, [recordId], (err, result) => {
        if (err) return res.status(500).json({ error: "Record delete failed." });
        res.json({ message: "Record deleted successfully!" });
    });
});

// ==========================================
// STATIC FILES & HTML ROUTES
// ==========================================
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.resolve(__dirname, "front.html"));
});

app.get("/front.html", (req, res) => {
    res.sendFile(path.resolve(__dirname, "front.html"));
});

app.get("/projects.html", (req, res) => {
    res.sendFile(path.resolve(__dirname, "projects.html"));
});

app.get("/formula.html", (req, res) => {
    res.sendFile(path.resolve(__dirname, "formula.html"));
});

app.get("/style.css", (req, res) => {
    res.sendFile(path.resolve(__dirname, "style.css"));
});

app.get("/formula.css", (req, res) => {
    res.sendFile(path.resolve(__dirname, "formula.css"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});