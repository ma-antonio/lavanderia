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

// Archivo: server.js

/**
 * ENDPOINT: Registrar Nuevo Pedido (Cliente)
 * Recibe los datos del formulario 'nuevo-pedido.html' y los guarda en 'pedidos_servicio'
 */
app.post('/api/pedidos', (req, res) => {
    const { 
        id_cliente, id_sucursal, servicio, kilos, detergente, 
        suavizante, entrega, express, pago, direccion_entrega 
    } = req.body;

    // Agrupamos todas las opciones elegidas en el campo "notas_especiales"
    const notas = `Servicio: ${servicio} | Peso: ${kilos}kg | Detergente: ${detergente} | Suavizante: ${suavizante} | Entrega: ${entrega} | Express: ${express ? 'Sí' : 'No'} | Pago: ${pago} | Dir: ${direccion_entrega || 'En sucursal'}`;

    // Como es un pedido en línea (autoservicio), asignamos al empleado 1 (o al recepcionista principal) por defecto
    const id_empleado_asignado = 1;

    const query = `
        INSERT INTO pedidos_servicio 
        (id_cliente, id_sucursal, id_empleado_recibe, estado_lavado, notas_especiales, fecha_recepcion) 
        VALUES (?, ?, ?, 'Pendiente', ?, NOW())
    `;

    db.query(query, [id_cliente, id_sucursal, id_empleado_asignado, notas], (err, result) => {
        if (err) {
            console.error("Error al registrar pedido:", err);
            return res.status(500).json({ error: 'Error interno al registrar el pedido en la base de datos.' });
        }
        // Devolvemos el ID generado para que el cliente pueda ver su número de ticket
        res.status(201).json({ message: 'Pedido registrado con éxito', id_pedido: result.insertId });
    });
});

// Archivo: server.js

/**
 * ENDPOINT: Obtener Sucursales y su Disponibilidad
 * Consulta las sucursales activas y los estados de sus zonas.
 */
app.get('/api/sucursales/disponibilidad', (req, res) => {
    const query = 'SELECT id_sucursal, nombre_sucursal, zona_a, zona_b, zona_c, zona_d FROM sucursales WHERE estado = "Activa"';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error al consultar la disponibilidad de sucursales:", err);
            return res.status(500).json({ error: 'Error al consultar la disponibilidad.' });
        }
        res.status(200).json(results);
    });
});

// Archivo: server.js (Añadir antes de app.listen)

/**
 * ENDPOINT: Recibir Comentarios de Contacto
 * Permite a cualquier usuario (logueado o no) enviar un mensaje al área administrativa.
 */
app.post('/api/contacto', (req, res) => {
    const { nombre, correo, telefono, mensaje } = req.body;

    const query = `
        INSERT INTO comentarios_clientes 
        (nombre_completo, correo_electronico, telefono, mensaje) 
        VALUES (?, ?, ?, ?)
    `;

    // Si el teléfono viene vacío, guardamos un valor nulo para mantener limpia la BD
    db.query(query, [nombre, correo, telefono || null, mensaje], (err, result) => {
        if (err) {
            console.error("Error al guardar el comentario de contacto:", err);
            return res.status(500).json({ error: 'Hubo un error al enviar tu mensaje. Por favor, intenta de nuevo más tarde.' });
        }
        res.status(201).json({ message: '¡Gracias por contactarnos! Tu mensaje ha sido enviado correctamente.' });
    });
});

// Archivo: server.js

/**
 * ENDPOINT: Verificar si el cliente tiene método de pago
 */
app.get('/api/metodos-pago/:id_cliente', (req, res) => {
    const query = 'SELECT id_tarjeta, ultimos_cuatro, marca_tarjeta FROM tarjetas_pago WHERE id_cliente = ?';
    db.query(query, [req.params.id_cliente], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al consultar métodos de pago' });
        res.status(200).json({ tieneMetodo: results.length > 0, tarjetas: results });
    });
});

/**
 * ENDPOINT: Guardar Tarjeta de Pago (Seguridad básica)
 * IDs involucrados: titular, numero, expiracion, cvv
 */
app.post('/api/metodos-pago', (req, res) => {
    const { id_cliente, titular, numero, expiracion, cvv } = req.body;

    // VALIDACIÓN DE SEGURIDAD: 
    // Extraemos solo los últimos 4 dígitos para almacenamiento
    const ultimosCuatro = numero.slice(-4);
    
    // Simulamos la creación de un TOKEN seguro (En producción esto lo hace la pasarela de pagos)
    const tokenSimulado = `tok_test_${Math.random().toString(36).substr(2, 9)}`;
    
    // Separamos la fecha de expiración (MM/YY)
    const [mes, anio] = expiracion.split('/');

    const query = `
        INSERT INTO tarjetas_pago 
        (id_cliente, titular_nombre, ultimos_cuatro, token_pago, mes_expiracion, anio_expiracion) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(query, [id_cliente, titular, ultimosCuatro, tokenSimulado, mes, anio], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al registrar el método de pago.' });
        }
        res.status(201).json({ message: 'Tarjeta guardada correctamente.' });
    });
});

// Archivo: server.js

/**
 * ENDPOINT: Obtener los paquetes desde el catálogo
 */
app.get('/api/paquetes', (req, res) => {
    const query = 'SELECT id_servicio, nombre_servicio, descripcion_corta, precio_base FROM catalogo_servicios WHERE categoria = "Paquete" AND estado_servicio = "Disponible"';
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al cargar paquetes' });
        res.status(200).json(results);
    });
});

/**
 * ENDPOINT: Procesar Compra de Paquete con Validación de Pago
 */
app.post('/api/comprar-paquete', (req, res) => {
    const { id_cliente, id_servicio, nombre_paquete } = req.body;

    // 1. Verificar si el cliente tiene una tarjeta guardada
    db.query('SELECT id_tarjeta FROM tarjetas_pago WHERE id_cliente = ?', [id_cliente], (err, tarjetas) => {
        if (err) return res.status(500).json({ error: 'Error verificando método de pago' });

        // Si NO tiene tarjeta, detenemos todo y le avisamos al Frontend que lo redirija
        if (tarjetas.length === 0) {
            return res.status(200).json({ requirePayment: true });
        }

        // 2. Si SÍ tiene tarjeta, generamos el pedido automáticamente
        // Asignamos sucursal 1 (Matriz) por defecto para compras online rápidas
        const notas = `Compra de Paquete Online: ${nombre_paquete}. (Cobrado a tarjeta terminación X).`;
        const queryPedido = `
            INSERT INTO pedidos_servicio (id_cliente, id_sucursal, id_empleado_recibe, estado_lavado, notas_especiales, fecha_recepcion) 
            VALUES (?, 1, 1, 'Pendiente', ?, NOW())
        `;

        db.query(queryPedido, [id_cliente, notas], (err, result) => {
            if (err) return res.status(500).json({ error: 'Error al generar el pedido del paquete.' });
            
            // Éxito total
            res.status(201).json({ success: true, id_pedido: result.insertId });
        });
    });
});

// Archivo: server.js

/**
 * ENDPOINT: Obtener toda la información del Perfil del Cliente
 */
app.get('/api/perfil/:id', (req, res) => {
    const idCliente = req.params.id;
    // Buscamos los datos del cliente y su primera dirección registrada (si tiene)
    const query = `
        SELECT c.nombre_cliente, c.apellidos_cliente, c.correo_electronico, c.telefono_contacto, c.rfc, c.direccion_fiscal,
               (SELECT calle_y_numero FROM direcciones_cliente WHERE id_cliente = c.id_cliente LIMIT 1) AS direccion_entrega
        FROM clientes c
        WHERE c.id_cliente = ?
    `;

    db.query(query, [idCliente], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al cargar el perfil' });
        if (results.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.status(200).json(results[0]);
    });
});

/**
 * ENDPOINT: Actualizar el Perfil del Cliente (Sobrescribe los datos)
 */
app.put('/api/perfil/:id', (req, res) => {
    const idCliente = req.params.id;
    const { nombreCompleto, correo, telefono, rfc, fiscal, direccionEntrega } = req.body;

    // Separamos el string del nombre para mantener el formato de la BD (Nombre | Apellidos)
    const partesNombre = nombreCompleto.trim().split(' ');
    const nombre = partesNombre[0];
    const apellidos = partesNombre.slice(1).join(' ');

    const queryCliente = `
        UPDATE clientes 
        SET nombre_cliente = ?, apellidos_cliente = ?, correo_electronico = ?, telefono_contacto = ?, rfc = ?, direccion_fiscal = ?
        WHERE id_cliente = ?
    `;

    db.query(queryCliente, [nombre, apellidos, correo, telefono, rfc, fiscal, idCliente], (err) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar los datos personales' });

        // Si envió dirección de entrega, actualizamos o insertamos en su tabla relacional
        if (direccionEntrega) {
            const queryDir = `
                INSERT INTO direcciones_cliente (id_cliente, calle_y_numero, colonia, codigo_postal) 
                VALUES (?, ?, 'No especificada', '00000')
                ON DUPLICATE KEY UPDATE calle_y_numero = VALUES(calle_y_numero)
            `;
            db.query(queryDir, [idCliente, direccionEntrega], (errDir) => {
                if (errDir) console.error("Error al actualizar dirección:", errDir);
            });
        }
        res.status(200).json({ message: 'Perfil actualizado exitosamente' });
    });
});

/**
 * ENDPOINT: Eliminar Método de Pago (Tarjeta)
 */
app.delete('/api/metodos-pago/:id_tarjeta', (req, res) => {
    const idTarjeta = req.params.id_tarjeta;
    
    db.query('DELETE FROM tarjetas_pago WHERE id_tarjeta = ?', [idTarjeta], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al eliminar la tarjeta' });
        res.status(200).json({ message: 'Tarjeta eliminada correctamente' });
    });
});

// Archivo: server.js

/**
 * ENDPOINT: Obtener Directorio de Sucursales
 * Devuelve la lista de todas las sucursales que están activas.
 */
app.get('/api/sucursales', (req, res) => {
    // Consultamos los datos que sí tenemos en la tabla
    const query = 'SELECT id_sucursal, nombre_sucursal, direccion_completa, telefono_contacto FROM sucursales WHERE estado = "Activa"';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error al consultar el directorio de sucursales:", err);
            return res.status(500).json({ error: 'Error interno al obtener las sucursales.' });
        }
        res.status(200).json(results);
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Lavandería corriendo en http://localhost:${PORT}`);
});