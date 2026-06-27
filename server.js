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

// Reemplaza mysql.createConnection por mysql.createPool
const db = mysql.createPool({
    host: 'localhost',
    user: 'admin_lavanderia',
    password: 'Password123!',
    database: 'erp_lavanderia',
    waitForConnections: true,
    connectionLimit: 10,       // Límite de conexiones simultáneas
    queueLimit: 0,
    enableKeepAlive: true,     // Mantiene el pulso con la BD para evitar desconexiones
    keepAliveInitialDelay: 0
});

// Prueba la conexión inicial para asegurar que el pool funciona
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error al conectar al Pool de MySQL:', err.code);
    }
    if (connection) {
        console.log('¡Conexión estable y optimizada a MySQL establecida!');
        connection.release(); 
    }
});

// Redirección inicial al índice de usuario
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('/admin', express.static(path.join(__dirname, 'admin')));

//Ruta para el Login de Administrador
app.get('/admin_login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin_login.html'));
});

// Ruta para el Panel de Administrador
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname,'admin.html'));
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

// Archivo: server.js (Añadir este nuevo endpoint)

/**
 * ENDPOINT: Recargar Saldo del Monedero Digital
 * Verifica método de pago y actualiza (o crea) el saldo del cliente.
 */
app.post('/api/recarga', (req, res) => {
    const { id_cliente, monto } = req.body;
    const montoRecarga = parseFloat(monto);

    // 1. Verificar si tiene una tarjeta registrada
    db.query('SELECT id_tarjeta FROM tarjetas_pago WHERE id_cliente = ?', [id_cliente], (err, tarjetas) => {
        if (err) return res.status(500).json({ error: 'Error verificando método de pago' });

        // Si NO tiene tarjeta, detenemos el proceso y avisamos al frontend
        if (tarjetas.length === 0) {
            return res.status(200).json({ requirePayment: true });
        }

        // 2. Si SÍ tiene tarjeta, verificamos si ya tiene un monedero creado
        db.query('SELECT id_monedero FROM monederos_digitales WHERE id_cliente = ?', [id_cliente], (err, monedero) => {
            if (err) return res.status(500).json({ error: 'Error consultando monedero' });

            if (monedero.length > 0) {
                // Si ya existe, simplemente le sumamos el saldo nuevo
                const updateQuery = 'UPDATE monederos_digitales SET saldo_actual = saldo_actual + ?, ultima_actualizacion = NOW() WHERE id_cliente = ?';
                db.query(updateQuery, [montoRecarga, id_cliente], (errUpdate) => {
                    if (errUpdate) return res.status(500).json({ error: 'Error al recargar saldo' });
                    res.status(200).json({ success: true, message: 'Recarga exitosa' });
                });
            } else {
                // Si es su primera vez usando el monedero, se lo creamos
                const codigoAleatorio = `TARJ-${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
                const insertQuery = 'INSERT INTO monederos_digitales (id_cliente, codigo_tarjeta, saldo_actual, ultima_actualizacion) VALUES (?, ?, ?, NOW())';
                db.query(insertQuery, [id_cliente, codigoAleatorio, montoRecarga], (errInsert) => {
                    if (errInsert) return res.status(500).json({ error: 'Error al habilitar monedero y recargar' });
                    res.status(200).json({ success: true, message: 'Recarga exitosa' });
                });
            }
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

// Archivo: server.js (Reemplaza el endpoint existente)

/**
 * ENDPOINT: Registrar Nuevo Pedido (Cliente)
 * Guarda el pedido con validación de método de pago si elige tarjeta.
 */
app.post('/api/pedidos', (req, res) => {
    const { 
        id_cliente, id_sucursal, servicio, kilos, detergente, 
        suavizante, entrega, express, pago, direccion_entrega 
    } = req.body;

    // 1. Validar si eligió pago con tarjeta y si tiene una registrada
    if (pago === 'tarjeta') {
        db.query('SELECT id_tarjeta FROM tarjetas_pago WHERE id_cliente = ?', [id_cliente], (err, tarjetas) => {
            if (err) return res.status(500).json({ error: 'Error verificando método de pago' });

            // Si NO tiene tarjeta, detenemos el proceso y avisamos al frontend
            if (tarjetas.length === 0) {
                return res.status(200).json({ requirePayment: true });
            }

            // Si SÍ tiene tarjeta, continuamos a guardar el pedido
            ejecutarRegistroPedido();
        });
    } else {
        // Si eligió pago en efectivo, procedemos directo
        ejecutarRegistroPedido();
    }

    // 2. Función para insertar el pedido (se ejecuta si pasa las validaciones)
    function ejecutarRegistroPedido() {
        const notas = `Servicio: ${servicio} | Peso: ${kilos}kg | Detergente: ${detergente} | Suavizante: ${suavizante} | Entrega: ${entrega} | Express: ${express ? 'Sí' : 'No'} | Pago: ${pago} | Dir: ${direccion_entrega || 'En sucursal'}`;
        const id_empleado_asignado = 1;

        const query = `
            INSERT INTO pedidos_servicio 
            (id_cliente, id_sucursal, id_empleado_recibe, estado_lavado, notas_especiales, fecha_recepcion) 
            VALUES (?, ?, ?, 'Pendiente', ?, NOW())
        `;

        db.query(query, [id_cliente, id_sucursal, id_empleado_asignado, notas], (err, result) => {
            if (err) {
                console.error("Error al registrar pedido:", err);
                return res.status(500).json({ error: 'Error interno al registrar el pedido.' });
            }
            res.status(201).json({ success: true, id_pedido: result.insertId });
        });
    }
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

// ==========================================
// MÓDULO DE ADMINISTRACIÓN INTERNA
// ==========================================
/*
// 1. PEDIDOS: Leer todos (LEFT JOIN para no ocultar nada) y Actualizar Estado
app.get('/api/admin/pedidos', (req, res) => {
    const query = `
        SELECT p.id_pedido, p.fecha_recepcion, c.nombre_cliente, c.apellidos_cliente, s.nombre_sucursal, p.estado_lavado
        FROM pedidos_servicio p
        LEFT JOIN clientes c ON p.id_cliente = c.id_cliente
        LEFT JOIN sucursales s ON p.id_sucursal = s.id_sucursal
        ORDER BY p.id_pedido DESC
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error al cargar pedidos:", err);
            return res.status(500).json({ error: 'Error al cargar pedidos.' });
        }
        res.status(200).json(results);
    });
});

app.put('/api/admin/pedidos/:id', (req, res) => {
    const { estado } = req.body;
    db.query('UPDATE pedidos_servicio SET estado_lavado = ? WHERE id_pedido = ?', [estado, req.params.id], (err) => {
        if (err) {
            // Este log te dirá exactamente por qué falló en tu terminal negra de Node.js
            console.error("Fallo SQL al actualizar pedido (Revisa tus ENUM de la BD):", err.sqlMessage);
            return res.status(500).json({ error: 'Error en base de datos. Revisa la consola de Node.' });
        }
        res.status(200).json({ success: true, message: 'Estado actualizado' });
    });
});

// 2. SUCURSALES: Leer todas, Actualizar Zonas y AGREGAR NUEVAS
app.get('/api/admin/sucursales', (req, res) => {
    db.query('SELECT * FROM sucursales', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al cargar sucursales.' });
        res.status(200).json(results);
    });
});

app.put('/api/admin/sucursales/:id', (req, res) => {
    const { zona_a, zona_b, zona_c, zona_d } = req.body;
    const query = 'UPDATE sucursales SET zona_a = ?, zona_b = ?, zona_c = ?, zona_d = ? WHERE id_sucursal = ?';
    db.query(query, [zona_a, zona_b, zona_c, zona_d, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar disponibilidad.' });
        res.status(200).json({ success: true });
    });
});

// NUEVO: Agregar Sucursal
app.post('/api/admin/sucursales', (req, res) => {
    const { nombre_sucursal, direccion_completa, telefono_contacto } = req.body;
    const query = `
        INSERT INTO sucursales (nombre_sucursal, direccion_completa, telefono_contacto, estado, zona_a, zona_b, zona_c, zona_d) 
        VALUES (?, ?, ?, 'Activa', 'Libre', 'Libre', 'Libre', 'Libre')
    `;
    db.query(query, [nombre_sucursal, direccion_completa, telefono_contacto], (err) => {
        if (err) {
            console.error("Error agregando sucursal:", err);
            return res.status(500).json({ error: 'Error al agregar la sucursal.' });
        }
        res.status(201).json({ success: true });
    });
});

// 3. PAQUETES: Leer catálogo y Actualizar Precio
app.get('/api/admin/paquetes', (req, res) => {
    db.query('SELECT * FROM catalogo_servicios WHERE categoria = "Paquete"', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al cargar paquetes.' });
        res.status(200).json(results);
    });
});

app.put('/api/admin/paquetes/:id', (req, res) => {
    const { precio_base } = req.body;
    db.query('UPDATE catalogo_servicios SET precio_base = ? WHERE id_servicio = ?', [precio_base, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar paquete.' });
        res.status(200).json({ success: true });
    });
});

// 4. QUEJAS: Leer comentarios y Actualizar Estado
app.get('/api/admin/quejas', (req, res) => {
    db.query('SELECT * FROM comentarios_clientes ORDER BY fecha_envio DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al cargar quejas.' });
        res.status(200).json(results);
    });
});

app.put('/api/admin/quejas/:id', (req, res) => {
    const { estado_queja } = req.body;
    db.query('UPDATE comentarios_clientes SET estado_queja = ? WHERE id_comentario = ?', [estado_queja, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar queja.' });
        res.status(200).json({ success: true });
    });
});
*/
// ==========================================
// LOGIN DE ADMINISTRADOR
// ==========================================

/**
 * ENDPOINT: Validar credenciales del Staff
 */
app.post('/api/admin/login', (req, res) => {
    const { empleado_id, password } = req.body;

    // Extraemos solo los números del input (ej. "EMP-001" se convierte en "1")
    const idLimpio = empleado_id.replace(/\D/g, '');

    const query = 'SELECT * FROM empleados WHERE id_empleado = ? AND contrasena_hash = ? AND rol_sistema = "Administrador"';
    
    db.query(query, [idLimpio, password], (err, results) => {
        if (err) {
            console.error("Error en login de admin:", err);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }
        
        if (results.length > 0) {
            // Credenciales correctas y es administrador
            res.status(200).json({ success: true });
        } else {
            // Falla la validación
            res.status(401).json({ error: 'Credenciales incorrectas o no tienes permisos de Administrador.' });
        }
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: CONSUMO E INVENTARIO (CONECTADO A BD)
// =======================================================

// Endpoint para consultar el consumo real
app.get('/api/admin', (req, res) => {
    const { desde, hasta, sucursal } = req.query;

    // Si no mandan fechas, evitamos que la consulta falle
    if (!desde || !hasta) {
        return res.json({ success: false, mensaje: "Faltan fechas en la consulta", data: [] });
    }

    // Armamos la consulta SQL cruzando ventas, detalles_ventas e insumos
    let query = `
        SELECT 
            i.nombre_insumo AS insumo,
            'General' AS categoria, 
            i.unidad_medida AS unidad,
            SUM(dv.cantidad) AS cantidad_consumida,
            AVG(i.precio_venta_publico) AS costo_unitario,
            SUM(dv.cantidad * i.precio_venta_publico) AS costo_total
        FROM ventas v
        JOIN detalles_ventas dv ON v.id_venta = dv.id_venta
        JOIN insumos i ON dv.id_insumo = i.id_insumo
        WHERE DATE(v.fecha_venta) BETWEEN ? AND ?
    `;
    
    let queryParams = [desde, hasta];

    // Si seleccionaron una sucursal específica (y no "todas")
    if (sucursal && sucursal !== 'todas') {
        query += ` AND v.id_sucursal = ?`;
        queryParams.push(sucursal);
    }

    query += ` GROUP BY i.id_insumo;`;

    // Ejecutamos la consulta en la BD (Asegúrate de que tu variable de conexión se llame 'db' o 'connection')
    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error("Error consultando consumos:", err);
            return res.status(500).json({ success: false, error: 'Error de base de datos' });
        }
        res.json({ success: true, data: results });
    });
});

// Endpoint para Aprobar y Registrar Consumo
app.post('/api/admin/consumo/aprobar', (req, res) => {
    // Al no haber una tabla específica de "aprobaciones de consumo" en tu SQL,
    // simulamos la respuesta exitosa para el flujo del frontend.
    res.json({ 
        success: true, 
        mensaje: "El reporte ha sido aprobado y registrado." 
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: CONTROL DE PEDIDOS
// =======================================================

// Endpoint para OBTENER todos los pedidos activos
app.get('/api/admin/pedidos', (req, res) => {
    // Cruzamos pedidos_servicio con clientes para obtener el nombre real
    const query = `
        SELECT 
            p.id_pedido,
            c.nombre_cliente,
            c.apellidos_cliente,
            p.fecha_entrega_estimada,
            p.notas_especiales,
            p.estado_lavado
        FROM pedidos_servicio p
        LEFT JOIN clientes c ON p.id_cliente = c.id_cliente
        ORDER BY p.fecha_entrega_estimada ASC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error al obtener pedidos:", err);
            return res.status(500).json({ success: false, error: "Error de BD" });
        }
        res.json({ success: true, data: results });
    });
});

// Endpoint para ACTUALIZAR el estado de un pedido
app.put('/api/admin/pedidos/:id/estado', (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    // Actualizamos respetando el ENUM de la base de datos
    const query = `UPDATE pedidos_servicio SET estado_lavado = ? WHERE id_pedido = ?`;
    
    db.query(query, [estado, id], (err, result) => {
        if (err) {
            console.error("Error al actualizar pedido:", err);
            return res.status(500).json({ success: false, error: "Error de BD" });
        }
        res.json({ success: true, mensaje: "Estado actualizado correctamente" });
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: LOGÍSTICA Y ENVÍOS
// =======================================================


// Obtener pedidos listos para envío o ya entregados
app.get('/api/admin/envios', (req, res) => {
    const query = `
        SELECT 
            p.id_pedido,
            c.nombre_cliente,
            c.apellidos_cliente,
            c.telefono_contacto,
            d.calle_y_numero,
            d.colonia,
            p.fecha_entrega_estimada,
            p.estado_lavado
        FROM pedidos_servicio p
        JOIN clientes c ON p.id_cliente = c.id_cliente
        LEFT JOIN direcciones_cliente d ON c.id_cliente = d.id_cliente AND d.es_predeterminada = 1
        WHERE p.estado_lavado IN ('Listo', 'Entregado')
        ORDER BY p.fecha_entrega_estimada ASC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error al obtener envíos:", err);
            return res.status(500).json({ success: false, error: "Error de BD" });
        }
        res.json({ success: true, data: results });
    });
});

// Marcar un pedido como Entregado desde la ruta
app.put('/api/admin/envios/:id/entregar', (req, res) => {
    const { id } = req.params;
    const query = `UPDATE pedidos_servicio SET estado_lavado = 'Entregado' WHERE id_pedido = ?`;
    
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error("Error al actualizar envío:", err);
            return res.status(500).json({ success: false, error: "Error de BD" });
        }
        res.json({ success: true, mensaje: "Entrega registrada correctamente" });
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: ESTADÍSTICAS
// =======================================================


// Endpoint para obtener los datos de la gráfica y el resumen
app.get('/api/admin/estadisticas', (req, res) => {
    const { rango } = req.query;
    
    // Configurar el filtro de fechas en SQL
    let dateCondition = '1=1'; 
    if (rango === 'semana') dateCondition = 'fecha_venta >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
    else if (rango === 'mes') dateCondition = 'fecha_venta >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    else if (rango === 'ano') dateCondition = 'fecha_venta >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';

    // Consulta 1: Totales
    const queryResumen = `
        SELECT 
            COUNT(id_venta) AS total_servicios, 
            IFNULL(SUM(total_venta), 0) AS monto_total, 
            IFNULL(AVG(total_venta), 0) AS ticket_promedio 
        FROM ventas 
        WHERE ${dateCondition}
    `;

    // Consulta 2: Día de mayor actividad
    const queryDia = `
        SELECT DAYNAME(fecha_venta) AS dia, COUNT(id_venta) as total 
        FROM ventas 
        WHERE ${dateCondition} 
        GROUP BY dia 
        ORDER BY total DESC 
        LIMIT 1
    `;

    // Consulta 3: Desglose real basado en la BD (Método de Pago)
    const queryDesglose = `
        SELECT 
            metodo_pago, 
            COUNT(id_venta) AS volumen, 
            IFNULL(SUM(total_venta), 0) AS monto 
        FROM ventas 
        WHERE ${dateCondition} 
        GROUP BY metodo_pago
    `;

    // Ejecutar consultas en cadena
    db.query(queryResumen, (err, resResumen) => {
        if (err) return res.status(500).json({ success: false, error: "Error BD Resumen" });
        
        db.query(queryDia, (err, resDia) => {
            if (err) return res.status(500).json({ success: false, error: "Error BD Dia" });
            
            db.query(queryDesglose, (err, resDesglose) => {
                if (err) return res.status(500).json({ success: false, error: "Error BD Desglose" });
                
                res.json({
                    success: true,
                    data: {
                        resumen: resResumen[0],
                        diaMayorActividad: resDia.length > 0 ? resDia[0].dia : 'N/A',
                        desglose: resDesglose
                    }
                });
            });
        });
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: FACTURACIÓN Y RECIBOS
// =======================================================

// Buscar Venta para generar recibo/factura
app.get('/api/admin/facturacion/buscar/:id', (req, res) => {
    const idVenta = req.params.id;
    
    // Cruzamos la venta con los datos del cliente
    const query = `
        SELECT 
            v.id_venta,
            v.total_venta,
            v.metodo_pago,
            c.id_cliente,
            c.nombre_cliente,
            c.apellidos_cliente,
            c.correo_electronico,
            c.rfc,
            c.direccion_fiscal
        FROM ventas v
        LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
        WHERE v.id_venta = ?
    `;

    db.query(query, [idVenta], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: "Error de BD" });
        if (results.length === 0) return res.json({ success: false, mensaje: "Venta no encontrada." });
        
        res.json({ success: true, data: results[0] });
    });
});

// Simular timbrado y actualizar datos fiscales del cliente en la BD
app.post('/api/admin/facturacion/timbrar', (req, res) => {
    const { id_cliente, rfc, direccion_fiscal } = req.body;
    
    // Si tenemos un cliente y un RFC, lo actualizamos en la base de datos real
    if (id_cliente && rfc) {
        const query = `UPDATE clientes SET rfc = ?, direccion_fiscal = ? WHERE id_cliente = ?`;
        db.query(query, [rfc, direccion_fiscal, id_cliente], (err) => {
            if (err) console.error("Error al guardar datos fiscales:", err);
            // El proceso continúa para simular el éxito en el frontend
        });
    }
    
    res.json({ 
        success: true, 
        mensaje: "¡Recibo generado y datos fiscales actualizados correctamente!" 
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: FINANZAS Y CAJA
// =======================================================


// Obtener datos financieros del DÍA ACTUAL
app.get('/api/admin/finanzas/hoy', (req, res) => {
    // 1. Obtener KPIs generales del día
    const queryKPIs = `
        SELECT 
            COUNT(id_venta) AS pedidos_cobrados,
            IFNULL(SUM(total_venta), 0) AS total_generado,
            IFNULL(AVG(total_venta), 0) AS ticket_promedio
        FROM ventas 
        WHERE DATE(fecha_venta) = CURDATE()
    `;

    // 2. Obtener desglose por método de pago del día
    const queryMetodos = `
        SELECT 
            metodo_pago, 
            IFNULL(SUM(total_venta), 0) AS total
        FROM ventas 
        WHERE DATE(fecha_venta) = CURDATE()
        GROUP BY metodo_pago
    `;

    // 3. Obtener las últimas transacciones del día
    const queryTransacciones = `
        SELECT 
            v.id_venta,
            c.nombre_cliente,
            c.apellidos_cliente,
            v.metodo_pago,
            v.fecha_venta,
            v.total_venta
        FROM ventas v
        LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
        WHERE DATE(v.fecha_venta) = CURDATE()
        ORDER BY v.fecha_venta DESC
    `;

    db.query(queryKPIs, (err, resKPI) => {
        if (err) return res.status(500).json({ success: false });
        
        db.query(queryMetodos, (err, resMetodos) => {
            if (err) return res.status(500).json({ success: false });
            
            db.query(queryTransacciones, (err, resTransacciones) => {
                if (err) return res.status(500).json({ success: false });
                
                res.json({
                    success: true,
                    data: {
                        kpis: resKPI[0],
                        metodos: resMetodos,
                        transacciones: resTransacciones
                    }
                });
            });
        });
    });
});

// Simular el Corte de Caja
app.post('/api/admin/finanzas/corte', (req, res) => {
    // Al no existir tabla de 'cortes_caja', solo simulamos el cierre exitoso
    res.json({ 
        success: true, 
        mensaje: "Corte de caja registrado. Turno finalizado con éxito." 
    });
});


// =======================================================
// RUTAS DE ADMINISTRADOR: HISTORIAL DE CLIENTES
// =======================================================

// Servir la vista HTML
app.get('/admin/admin-historial-cliente.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin-historial-cliente.html'));
});

// Endpoint para buscar cliente y su historial de pedidos
app.get('/api/admin/historial-cliente', (req, res) => {
    const { nombre, correo, tel } = req.query;

    if (!nombre && !correo && !tel) {
        return res.json({ success: false, mensaje: "Ingrese al menos un criterio de búsqueda." });
    }

    // Armamos los filtros dinámicamente según lo que haya escrito el usuario
    let conditions = [];
    let params = [];

    if (nombre) {
        conditions.push(`CONCAT(c.nombre_cliente, ' ', IFNULL(c.apellidos_cliente, '')) LIKE ?`);
        params.push(`%${nombre}%`);
    }
    if (correo) {
        conditions.push(`c.correo_electronico LIKE ?`);
        params.push(`%${correo}%`);
    }
    if (tel) {
        conditions.push(`c.telefono_contacto LIKE ?`);
        params.push(`%${tel}%`);
    }

    const whereClause = conditions.join(' OR ');

    // Cruzamos las tablas: Clientes -> Pedidos -> Detalles de Venta -> Ventas
    const query = `
        SELECT 
            c.id_cliente,
            c.nombre_cliente,
            c.apellidos_cliente,
            c.telefono_contacto,
            p.id_pedido,
            p.fecha_recepcion,
            p.estado_lavado,
            p.notas_especiales,
            MAX(v.total_venta) AS total_venta
        FROM clientes c
        LEFT JOIN pedidos_servicio p ON c.id_cliente = p.id_cliente
        LEFT JOIN detalles_ventas dv ON p.id_pedido = dv.id_pedido
        LEFT JOIN ventas v ON dv.id_venta = v.id_venta
        WHERE ${whereClause}
        GROUP BY p.id_pedido, c.id_cliente
        ORDER BY p.fecha_recepcion DESC
    `;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error("Error al buscar historial:", err);
            return res.status(500).json({ success: false, error: "Error de base de datos" });
        }

        if (results.length === 0) {
            return res.json({ success: true, data: null, mensaje: "No se encontró ningún cliente con esos datos." });
        }

        // Agrupamos los datos basándonos en el primer cliente que coincida con la búsqueda
        const clienteMain = {
            id_cliente: results[0].id_cliente,
            nombre_completo: `${results[0].nombre_cliente} ${results[0].apellidos_cliente || ''}`.trim(),
            telefono: results[0].telefono_contacto || 'Sin teléfono',
            pedidos: []
        };

        results.forEach(row => {
            // Verificamos que el pedido pertenezca al cliente principal y que no sea nulo (LEFT JOIN)
            if (row.id_cliente === clienteMain.id_cliente && row.id_pedido) {
                clienteMain.pedidos.push({
                    id_pedido: row.id_pedido,
                    fecha_recepcion: row.fecha_recepcion,
                    estado_lavado: row.estado_lavado,
                    notas_especiales: row.notas_especiales,
                    total_venta: row.total_venta || 0
                });
            }
        });

        res.json({ success: true, data: clienteMain });
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: INVENTARIO DE INSUMOS
// =======================================================

// Servir la vista HTML
app.get('/admin/admin-inventario.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin-inventario.html'));
});

// GET: Obtener todo el inventario (con opción a búsqueda)
app.get('/api/admin/inventario', (req, res) => {
    const { buscar } = req.query;
    let query = `SELECT * FROM insumos`;
    let params = [];

    if (buscar) {
        query += ` WHERE nombre_insumo LIKE ?`;
        params.push(`%${buscar}%`);
    }
    
    query += ` ORDER BY nombre_insumo ASC`;

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: "Error de BD" });
        res.json({ success: true, data: results });
    });
});

// POST: Agregar un nuevo insumo a la base de datos
app.post('/api/admin/inventario', (req, res) => {
    const { nombre_insumo, unidad_medida, stock_actual, stock_minimo } = req.body;
    
    // Insertamos validando el ENUM de unidad_medida ('Litros','Kilos','Piezas','Rollos')
    const query = `
        INSERT INTO insumos (nombre_insumo, unidad_medida, stock_actual, stock_minimo, precio_venta_publico) 
        VALUES (?, ?, ?, ?, 0.00)
    `;
    
    db.query(query, [nombre_insumo, unidad_medida, stock_actual, stock_minimo], (err, result) => {
        if (err) return res.status(500).json({ success: false, mensaje: "Error al guardar en BD. Revisa que los datos sean correctos." });
        res.json({ success: true, mensaje: "Producto agregado correctamente al inventario." });
    });
});

// DELETE: Eliminar un insumo
app.delete('/api/admin/inventario/:id', (req, res) => {
    const { id } = req.params;
    const query = `DELETE FROM insumos WHERE id_insumo = ?`;
    
    db.query(query, [id], (err, result) => {
        if (err) {
            // Protección: Si el insumo ya se usó en una venta, MySQL bloqueará el borrado para no corromper el historial.
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return res.status(400).json({ success: false, mensaje: "No se puede eliminar: El insumo ya está registrado en el historial de ventas." });
            }
            return res.status(500).json({ success: false, error: "Error de BD" });
        }
        res.json({ success: true, mensaje: "Producto eliminado correctamente." });
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: NUEVO PEDIDO
// =======================================================

// Servir la vista HTML
app.get('/admin/admin-nuevo-pedido.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin-nuevo-pedido.html'));
});

// Endpoint para guardar el pedido y la venta
app.post('/api/admin/pedidos', (req, res) => {
    const { cliente_nombre, cliente_tel, total, metodo_pago, notas, express } = req.body;

    // Consolidamos toda la información en las notas especiales
    const notasFinales = `Cliente: ${cliente_nombre} (${cliente_tel}) | ${express ? '[EXPRESS] ' : ''}${notas}`;

    // Calculamos fecha de entrega (Express = Hoy, Normal = Mañana)
    const fechaEntrega = new Date();
    if (!express) {
        fechaEntrega.setDate(fechaEntrega.getDate() + 1);
    }

    // IDs por defecto (Simulando que el Admin en la Sucursal 1 está operando)
    const idSucursal = 1;
    const idEmpleado = 1; 

    // 1. Crear el Pedido
    const queryPedido = `
        INSERT INTO pedidos_servicio (id_sucursal, id_empleado_recibe, fecha_entrega_estimada, estado_lavado, notas_especiales) 
        VALUES (?, ?, ?, 'Pendiente', ?)
    `;

    db.query(queryPedido, [idSucursal, idEmpleado, fechaEntrega, notasFinales], (err, resPedido) => {
        if (err) {
            console.error("Error en pedido:", err);
            return res.status(500).json({ success: false, error: 'Error al registrar el pedido.' });
        }
        
        const idPedido = resPedido.insertId;

        // 2. Crear la Venta (Ajustamos el texto al ENUM de la BD)
        let metodoBD = 'Efectivo';
        if (metodo_pago.includes('Tarjeta')) metodoBD = 'Tarjeta';
        if (metodo_pago.includes('Transferencia')) metodoBD = 'Transferencia';

        const queryVenta = `
            INSERT INTO ventas (id_sucursal, id_empleado_caja, metodo_pago, total_venta) 
            VALUES (?, ?, ?, ?)
        `;

        db.query(queryVenta, [idSucursal, idEmpleado, metodoBD, total], (err, resVenta) => {
            if (err) {
                console.error("Error en venta:", err);
                return res.status(500).json({ success: false, error: 'Error al registrar la venta.' });
            }
            
            const idVenta = resVenta.insertId;

            // 3. Vincular la venta con el pedido en detalles_ventas
            const queryDetalle = `INSERT INTO detalles_ventas (id_venta, id_pedido, subtotal) VALUES (?, ?, ?)`;
            
            db.query(queryDetalle, [idVenta, idPedido, total], (err) => {
                if (err) {
                    console.error("Error en detalle:", err);
                    return res.status(500).json({ success: false, error: 'Error al vincular detalle.' });
                }

                res.json({ success: true, mensaje: 'Pedido registrado con éxito.', folio: idPedido });
            });
        });
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: REPORTES Y ESTADÍSTICAS
// =======================================================

// Servir la vista HTML
app.get('/admin/admin-reportes.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin-reportes.html'));
});

// Endpoint para generar el reporte
app.get('/api/admin/reportes', (req, res) => {
    const { desde, hasta, sucursal, servicio, estado } = req.query;

    if (!desde || !hasta) {
        return res.json({ success: false, mensaje: "Las fechas son obligatorias." });
    }

    // Si buscan pendientes o cancelados, devolvemos vacío porque la tabla ventas solo tiene pagos completados
    if (estado === 'pendiente' || estado === 'cancelado') {
        return res.json({ success: true, data: [] });
    }

    // Consulta SQL cruzando Ventas -> Sucursales -> Detalles -> Pedidos -> Clientes
    let query = `
        SELECT 
            v.fecha_venta,
            v.id_venta,
            s.nombre_sucursal,
            p.notas_especiales,
            c.nombre_cliente,
            c.apellidos_cliente,
            v.total_venta
        FROM ventas v
        JOIN sucursales s ON v.id_sucursal = s.id_sucursal
        LEFT JOIN detalles_ventas dv ON v.id_venta = dv.id_venta
        LEFT JOIN pedidos_servicio p ON dv.id_pedido = p.id_pedido
        LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
        WHERE DATE(v.fecha_venta) BETWEEN ? AND ?
    `;
    let params = [desde, hasta];

    // Filtro por Sucursal
    if (sucursal && sucursal !== 'todas') {
        query += ` AND v.id_sucursal = ?`;
        params.push(sucursal);
    }

    // Filtro por Servicio (buscando en las notas del pedido)
    if (servicio && servicio !== 'todos') {
        query += ` AND p.notas_especiales LIKE ?`;
        params.push(`%${servicio}%`);
    }

    query += ` ORDER BY v.fecha_venta DESC`;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error("Error al generar reporte:", err);
            return res.status(500).json({ success: false, error: "Error de base de datos" });
        }
        res.json({ success: true, data: results });
    });
});

// =======================================================
// RUTAS DE ADMINISTRADOR: GENERAR TICKET
// =======================================================

// Servir la vista HTML
app.get('/admin/admin-ticket.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin-ticket.html'));
});

// Endpoint para buscar la información del ticket (Venta + Pedido)
app.get('/api/admin/ticket/:id', (req, res) => {
    const idVenta = req.params.id;

    // Cruzamos ventas, detalles_ventas, pedidos y clientes
    const query = `
        SELECT 
            v.id_venta,
            v.fecha_venta,
            v.total_venta,
            c.nombre_cliente,
            c.apellidos_cliente,
            p.id_pedido,
            p.notas_especiales
        FROM ventas v
        LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
        LEFT JOIN detalles_ventas dv ON v.id_venta = dv.id_venta
        LEFT JOIN pedidos_servicio p ON dv.id_pedido = p.id_pedido
        WHERE v.id_venta = ?
        LIMIT 1
    `;

    db.query(query, [idVenta], (err, results) => {
        if (err) {
            console.error("Error al obtener ticket:", err);
            return res.status(500).json({ success: false, error: "Error de BD" });
        }
        if (results.length === 0) {
            return res.json({ success: false, mensaje: "Ticket no encontrado. Verifica el Folio de Venta." });
        }
        
        res.json({ success: true, data: results[0] });
    });
});

// Endpoint para simular el envío del ticket por correo o WhatsApp
app.post('/api/admin/ticket/enviar', (req, res) => {
    const { id_venta } = req.body;
    // Aquí iría la integración real con un servicio de correo (como Nodemailer o SendGrid)
    res.json({ success: true, mensaje: `¡Ticket electrónico de la venta V-${id_venta} enviado exitosamente al cliente!` });
}); 

// =======================================================
// RUTAS DE ADMINISTRADOR: NOTIFICACIONES Y ALERTAS
// =======================================================

// Servir la vista HTML
app.get('/admin/admin-notificaciones.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin-notificaciones.html'));
});

// Endpoint para auditar la base de datos y generar alertas en tiempo real
app.get('/api/admin/notificaciones', (req, res) => {
    let alertas = [];

    // 1. Alertas de Inventario (Stock bajo o agotado)
    const queryStock = `SELECT nombre_insumo, stock_actual, stock_minimo FROM insumos WHERE stock_actual <= stock_minimo`;
    
    // 2. Alertas de Logística (Pedidos atrasados)
    const queryPedidos = `
        SELECT id_pedido, fecha_entrega_estimada 
        FROM pedidos_servicio 
        WHERE fecha_entrega_estimada < NOW() AND estado_lavado NOT IN ('Entregado', 'Listo')
    `;

    // 3. Alertas de Atención al Cliente (Quejas pendientes)
    const queryQuejas = `SELECT id_comentario, nombre_completo, mensaje FROM comentarios_clientes WHERE estado_queja = 'Pendiente'`;

    // Ejecutamos las consultas (Anidadas para simplicidad)
    db.query(queryStock, (err, resStock) => {
        if (!err && resStock.length > 0) {
            resStock.forEach(item => {
                alertas.push({
                    modulo: 'Inventario', classModulo: 'badge-inventory',
                    prioridad: item.stock_actual == 0 ? 'notif-high' : 'notif-medium',
                    titulo: `Alerta de Stock: ${item.nombre_insumo}`,
                    descripcion: `El inventario actual es de ${item.stock_actual} (Mínimo requerido: ${item.stock_minimo}).`,
                    responsable: 'Gerencia / Compras',
                    accion: '/admin/admin-inventario.html'
                });
            });
        }

        db.query(queryPedidos, (err, resPedidos) => {
            if (!err && resPedidos.length > 0) {
                resPedidos.forEach(pedido => {
                    alertas.push({
                        modulo: 'Logística', classModulo: 'badge-logistics',
                        prioridad: 'notif-high',
                        titulo: `Pedido Atrasado: F-${pedido.id_pedido}`,
                        descripcion: `La fecha de entrega estaba programada para el ${new Date(pedido.fecha_entrega_estimada).toLocaleString('es-MX')}.`,
                        responsable: 'Operador / Despachador',
                        accion: '/admin/admin-control-pedidos.html'
                    });
                });
            }

            db.query(queryQuejas, (err, resQuejas) => {
                if (!err && resQuejas.length > 0) {
                    resQuejas.forEach(queja => {
                        alertas.push({
                            modulo: 'Sistema', classModulo: 'badge-system',
                            prioridad: 'notif-medium',
                            titulo: `Nuevo Mensaje de Cliente: ${queja.nombre_completo}`,
                            descripcion: `Comentario pendiente de atención: "${queja.mensaje.substring(0, 50)}..."`,
                            responsable: 'Atención a Clientes',
                            accion: '#' // No hay vista de quejas aún
                        });
                    });
                }

                // Devolvemos todas las alertas generadas
                res.json({ success: true, data: alertas });
            });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Lavandería corriendo en http://localhost:${PORT}`);
});

