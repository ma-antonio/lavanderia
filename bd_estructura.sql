-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: erp_lavanderia
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `catalogo_servicios`
--

DROP TABLE IF EXISTS `catalogo_servicios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `catalogo_servicios` (
  `id_servicio` int NOT NULL AUTO_INCREMENT,
  `categoria` enum('Lavado','Tintorería','Planchado','Paquete') NOT NULL,
  `nombre_servicio` varchar(150) NOT NULL,
  `descripcion_corta` text,
  `precio_base` decimal(10,2) NOT NULL,
  `tipo_cobro` enum('Por Kilo','Por Pieza','Precio Fijo') NOT NULL,
  `estado_servicio` enum('Disponible','No Disponible') DEFAULT 'Disponible',
  PRIMARY KEY (`id_servicio`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clientes`
--

DROP TABLE IF EXISTS `clientes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clientes` (
  `id_cliente` int NOT NULL AUTO_INCREMENT,
  `nombre_cliente` varchar(100) NOT NULL,
  `apellidos_cliente` varchar(100) NOT NULL,
  `correo_electronico` varchar(150) NOT NULL,
  `telefono_contacto` varchar(15) DEFAULT NULL,
  `contrasena_hash` varchar(255) NOT NULL,
  `fecha_registro` datetime DEFAULT CURRENT_TIMESTAMP,
  `estado_cuenta` enum('Activo','Inactivo','Suspendido') DEFAULT 'Activo',
  `rfc` varchar(20) DEFAULT NULL,
  `direccion_fiscal` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_cliente`),
  UNIQUE KEY `correo_electronico` (`correo_electronico`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `comentarios_clientes`
--

DROP TABLE IF EXISTS `comentarios_clientes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comentarios_clientes` (
  `id_comentario` int NOT NULL AUTO_INCREMENT,
  `nombre_completo` varchar(150) NOT NULL,
  `correo_electronico` varchar(150) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `mensaje` text NOT NULL,
  `fecha_envio` datetime DEFAULT CURRENT_TIMESTAMP,
  `empleado_atendio` int DEFAULT NULL,
  `estado_queja` enum('Pendiente','En proceso','Resuelto','Cerrado') DEFAULT 'Pendiente',
  PRIMARY KEY (`id_comentario`),
  KEY `empleado_atendio` (`empleado_atendio`),
  CONSTRAINT `comentarios_clientes_ibfk_1` FOREIGN KEY (`empleado_atendio`) REFERENCES `empleados` (`id_empleado`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `detalles_ventas`
--

DROP TABLE IF EXISTS `detalles_ventas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detalles_ventas` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_venta` int NOT NULL,
  `id_pedido` int DEFAULT NULL,
  `id_insumo` int DEFAULT NULL,
  `cantidad` int DEFAULT '1',
  `subtotal` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `id_venta` (`id_venta`),
  KEY `id_pedido` (`id_pedido`),
  KEY `id_insumo` (`id_insumo`),
  CONSTRAINT `detalles_ventas_ibfk_1` FOREIGN KEY (`id_venta`) REFERENCES `ventas` (`id_venta`) ON DELETE CASCADE,
  CONSTRAINT `detalles_ventas_ibfk_2` FOREIGN KEY (`id_pedido`) REFERENCES `pedidos_servicio` (`id_pedido`),
  CONSTRAINT `detalles_ventas_ibfk_3` FOREIGN KEY (`id_insumo`) REFERENCES `insumos` (`id_insumo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `direcciones_cliente`
--

DROP TABLE IF EXISTS `direcciones_cliente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `direcciones_cliente` (
  `id_direccion` int NOT NULL AUTO_INCREMENT,
  `id_cliente` int NOT NULL,
  `alias_direccion` varchar(50) DEFAULT 'Principal',
  `calle_y_numero` varchar(255) NOT NULL,
  `colonia` varchar(150) NOT NULL,
  `codigo_postal` varchar(10) NOT NULL,
  `referencias_entrega` text,
  `es_predeterminada` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id_direccion`),
  KEY `id_cliente` (`id_cliente`),
  CONSTRAINT `direcciones_cliente_ibfk_1` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id_cliente`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `empleados`
--

DROP TABLE IF EXISTS `empleados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `empleados` (
  `id_empleado` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `apellidos` varchar(100) NOT NULL,
  `rol_sistema` enum('Administrador','Recepcionista','Operador','Repartidor') NOT NULL,
  `correo_acceso` varchar(150) NOT NULL,
  `contrasena_hash` varchar(255) NOT NULL,
  `estado` enum('Activo','Inactivo') DEFAULT 'Activo',
  PRIMARY KEY (`id_empleado`),
  UNIQUE KEY `correo_acceso` (`correo_acceso`),
  KEY `id_sucursal` (`id_sucursal`),
  CONSTRAINT `empleados_ibfk_1` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursales` (`id_sucursal`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `insumos`
--

DROP TABLE IF EXISTS `insumos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `insumos` (
  `id_insumo` int NOT NULL AUTO_INCREMENT,
  `nombre_insumo` varchar(100) NOT NULL,
  `unidad_medida` enum('Litros','Kilos','Piezas','Rollos') NOT NULL,
  `stock_actual` decimal(10,2) DEFAULT '0.00',
  `stock_minimo` decimal(10,2) DEFAULT '5.00',
  `precio_venta_publico` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id_insumo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `monederos_digitales`
--

DROP TABLE IF EXISTS `monederos_digitales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monederos_digitales` (
  `id_monedero` int NOT NULL AUTO_INCREMENT,
  `id_cliente` int NOT NULL,
  `codigo_tarjeta` varchar(20) NOT NULL,
  `saldo_actual` decimal(10,2) DEFAULT '0.00',
  `ultima_actualizacion` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_monedero`),
  UNIQUE KEY `id_cliente` (`id_cliente`),
  UNIQUE KEY `codigo_tarjeta` (`codigo_tarjeta`),
  CONSTRAINT `monederos_digitales_ibfk_1` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id_cliente`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pedidos_servicio`
--

DROP TABLE IF EXISTS `pedidos_servicio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedidos_servicio` (
  `id_pedido` int NOT NULL AUTO_INCREMENT,
  `id_cliente` int DEFAULT NULL,
  `id_sucursal` int NOT NULL,
  `id_empleado_recibe` int NOT NULL,
  `fecha_recepcion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_entrega_estimada` datetime DEFAULT NULL,
  `estado_lavado` enum('Pendiente','Proceso','Listo','Entregado') DEFAULT 'Pendiente',
  `notas_especiales` text,
  PRIMARY KEY (`id_pedido`),
  KEY `id_cliente` (`id_cliente`),
  KEY `id_sucursal` (`id_sucursal`),
  KEY `id_empleado_recibe` (`id_empleado_recibe`),
  CONSTRAINT `pedidos_servicio_ibfk_1` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id_cliente`),
  CONSTRAINT `pedidos_servicio_ibfk_2` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursales` (`id_sucursal`),
  CONSTRAINT `pedidos_servicio_ibfk_3` FOREIGN KEY (`id_empleado_recibe`) REFERENCES `empleados` (`id_empleado`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proveedores`
--

DROP TABLE IF EXISTS `proveedores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proveedores` (
  `id_proveedor` int NOT NULL AUTO_INCREMENT,
  `nombre_empresa` varchar(150) NOT NULL,
  `contacto_vendedor` varchar(100) DEFAULT NULL,
  `telefono` varchar(15) DEFAULT NULL,
  `correo` varchar(150) DEFAULT NULL,
  PRIMARY KEY (`id_proveedor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sucursales`
--

DROP TABLE IF EXISTS `sucursales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sucursales` (
  `id_sucursal` int NOT NULL AUTO_INCREMENT,
  `nombre_sucursal` varchar(100) NOT NULL,
  `direccion_completa` varchar(255) NOT NULL,
  `telefono_contacto` varchar(15) DEFAULT NULL,
  `estado` enum('Activa','Inactiva') DEFAULT 'Activa',
  `zona_a` enum('Libre','Carga Normal','Congestionado') DEFAULT 'Libre',
  `zona_b` enum('Libre','Carga Normal','Congestionado') DEFAULT 'Libre',
  `zona_c` enum('Libre','Carga Normal','Congestionado') DEFAULT 'Libre',
  `zona_d` enum('Libre','Carga Normal','Congestionado') DEFAULT 'Libre',
  PRIMARY KEY (`id_sucursal`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tarjetas_pago`
--

DROP TABLE IF EXISTS `tarjetas_pago`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarjetas_pago` (
  `id_tarjeta` int NOT NULL AUTO_INCREMENT,
  `id_cliente` int NOT NULL,
  `titular_nombre` varchar(150) NOT NULL,
  `ultimos_cuatro` char(4) NOT NULL,
  `token_pago` varchar(255) NOT NULL,
  `mes_expiracion` char(2) NOT NULL,
  `anio_expiracion` char(2) NOT NULL,
  `marca_tarjeta` enum('Visa','Mastercard','Amex','Otra') DEFAULT 'Otra',
  `fecha_registro` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_tarjeta`),
  KEY `id_cliente` (`id_cliente`),
  CONSTRAINT `tarjetas_pago_ibfk_1` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id_cliente`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ventas`
--

DROP TABLE IF EXISTS `ventas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ventas` (
  `id_venta` int NOT NULL AUTO_INCREMENT,
  `id_sucursal` int NOT NULL,
  `id_empleado_caja` int NOT NULL,
  `id_cliente` int DEFAULT NULL,
  `fecha_venta` datetime DEFAULT CURRENT_TIMESTAMP,
  `metodo_pago` enum('Efectivo','Tarjeta','Monedero','Transferencia') NOT NULL,
  `total_venta` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id_venta`),
  KEY `id_sucursal` (`id_sucursal`),
  KEY `id_empleado_caja` (`id_empleado_caja`),
  KEY `id_cliente` (`id_cliente`),
  CONSTRAINT `ventas_ibfk_1` FOREIGN KEY (`id_sucursal`) REFERENCES `sucursales` (`id_sucursal`),
  CONSTRAINT `ventas_ibfk_2` FOREIGN KEY (`id_empleado_caja`) REFERENCES `empleados` (`id_empleado`),
  CONSTRAINT `ventas_ibfk_3` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id_cliente`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-30  1:26:37
