// Archivo: server.js
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();

// Configuración de Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde la raíz para acceder a /user y /admin
//app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'user')));

// Conexión a la Base de Datos
const db = mysql.createConnection({
    host: 'localhost',
    user: 'admin_lavanderia',
    password: 'Password123!', // Cambia por tu contraseña real
    database: 'erp_lavanderia'
});

db.connect((err) => {
    if (err) {
        console.error('Error conectando a MySQL:', err);
        return;
    }
    console.log('Conectado exitosamente a la base de datos: erp_lavanderia');
});

// Redirección inicial al índice de usuario
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Archivo: server.js (Añadir antes de app.listen)

/**
 * ENDPOINT: Obtener Datos del Dashboard (Perfil, Monedero e Historial)
 */
app.get('/api/dashboard/:id', (req, res) => {
    const idCliente = req.params.id;
    
    // Consulta 1: Datos del cliente y su tarjeta recargable
    const queryCliente = `
        SELECT c.nombre_cliente, c.apellidos_cliente, 
               m.codigo_tarjeta, m.saldo_actual, m.ultima_actualizacion
        FROM clientes c
        LEFT JOIN monederos_digitales m ON c.id_cliente = m.id_cliente
        WHERE c.id_cliente = ?
    `;

    // Consulta 2: Historial de pedidos del cliente
    const queryPedidos = `
        SELECT id_pedido, estado_lavado, fecha_recepcion, notas_especiales
        FROM pedidos_servicio
        WHERE id_cliente = ?
        ORDER BY fecha_recepcion DESC
    `;

    db.query(queryCliente, [idCliente], (err, resultCliente) => {
        if (err) return res.status(500).json({ error: 'Error al consultar datos del cliente' });
        if (resultCliente.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

        db.query(queryPedidos, [idCliente], (err, resultPedidos) => {
            if (err) return res.status(500).json({ error: 'Error al consultar el historial' });

            // Enviamos todo en un solo paquete (JSON)
            res.status(200).json({
                cliente: resultCliente[0],
                historial: resultPedidos
            });
        });
    });
});

/**
 * ENDPOINT: Registro de Clientes
 * IDs del formulario involucrados: reg-nombre, reg-apellidos, reg-correo, reg-tel, reg-direccion, reg-password
 */
app.post('/api/registro', async (req, res) => {
    const { nombre, apellidos, correo, telefono, direccion, password } = req.body;

    try {
        // 1. Verificar si el correo ya existe
        const checkEmail = 'SELECT correo_electronico FROM clientes WHERE correo_electronico = ?';
        db.query(checkEmail, [correo], async (err, results) => {
            if (err) return res.status(500).json({ error: 'Error interno en la base de datos' });
            
            if (results.length > 0) {
                return res.status(400).json({ error: 'Este correo electrónico ya está registrado.' });
            }

            // 2. Encriptar contraseña
            const hash = await bcrypt.hash(password, 10);

            // 3. Insertar en tabla 'clientes' (Campos opcionales se manejan como NULL si vienen vacíos)
            const queryCliente = `INSERT INTO clientes 
                (nombre_cliente, apellidos_cliente, correo_electronico, telefono_contacto, contrasena_hash) 
                VALUES (?, ?, ?, ?, ?)`;
            
            db.query(queryCliente, [nombre, apellidos, correo, telefono || null, hash], (err, result) => {
                if (err) return res.status(500).json({ error: 'Error al registrar los datos personales' });

                const idNuevoCliente = result.insertId;

                // 4. Si proporcionó dirección, se guarda en la tabla relacional 'direcciones_cliente'
                if (direccion && direccion.trim() !== "") {
                    const queryDir = 'INSERT INTO direcciones_cliente (id_cliente, calle_y_numero, colonia, codigo_postal) VALUES (?, ?, ?, ?)';
                    // Nota: Se asume que en el futuro se desglosará, por ahora guardamos el texto en el campo calle
                    db.query(queryDir, [idNuevoCliente, direccion, 'Por definir', '00000'], (err) => {
                        if (err) console.error('Error al guardar dirección opcional:', err);
                    });
                }

                res.status(201).json({ message: 'Registro completado con éxito' });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error en el procesamiento del registro' });
    }
});

/**
 * ENDPOINT: Login de Clientes
 * IDs del formulario: login-correo, login-password
 */
app.post('/api/login', (req, res) => {
    const { correo, password } = req.body;
    const query = 'SELECT id_cliente, contrasena_hash FROM clientes WHERE correo_electronico = ? AND estado_cuenta = "Activo"';

    db.query(query, [correo], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        if (results.length === 0) return res.status(401).json({ error: 'El correo no coincide con ninguna cuenta activa.' });

        const cliente = results[0];
        const coinciden = await bcrypt.compare(password, cliente.contrasena_hash);

        if (!coinciden) return res.status(401).json({ error: 'La contraseña es incorrecta.' });

        res.status(200).json({ message: 'Acceso concedido', id_cliente: cliente.id_cliente });
    });
});


// Archivo: server.js

/**
 * ENDPOINT: Obtener Historial Completo del Cliente
 * Hace un JOIN con 'sucursales' para traer el nombre del local.
 */
app.get('/api/historial/:id', (req, res) => {
    const idCliente = req.params.id;
    
    const query = `
        SELECT p.id_pedido, p.estado_lavado, p.fecha_recepcion, p.notas_especiales, s.nombre_sucursal
        FROM pedidos_servicio p
        JOIN sucursales s ON p.id_sucursal = s.id_sucursal
        WHERE p.id_cliente = ?
        ORDER BY p.fecha_recepcion DESC
    `;

    db.query(query, [idCliente], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al consultar el historial completo' });
        }
        res.status(200).json(results);
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Lavandería corriendo en http://localhost:${PORT}`);
});