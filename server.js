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
    password: 'Password123!', // Contraseña
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Lavandería corriendo en http://localhost:${PORT}`);
});