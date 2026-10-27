/* =====================================================================
   HOTEL COSTA DEL SOL - Base de datos (SQL Server)
   Ejecutar completo en SSMS o con: sqlcmd -S localhost\SQLEXPRESS -i schema.sql
   El script es re-ejecutable: no borra datos existentes.
   ===================================================================== */
IF DB_ID('CostaDelSol') IS NULL CREATE DATABASE CostaDelSol;
GO
USE CostaDelSol;
GO
SET QUOTED_IDENTIFIER ON;   -- requerido por el índice filtrado (sqlcmd lo trae en OFF)
SET ANSI_NULLS ON;
GO
IF SCHEMA_ID('Catalogos') IS NULL EXEC('CREATE SCHEMA Catalogos');
IF SCHEMA_ID('Hotel')     IS NULL EXEC('CREATE SCHEMA Hotel');
GO

/* ---------------------------- CATALOGOS ---------------------------- */
IF OBJECT_ID('Catalogos.TiposHabitacion') IS NULL
CREATE TABLE Catalogos.TiposHabitacion (
    IdTipoHabitacion INT IDENTITY(1,1) PRIMARY KEY,
    NombreTipo       NVARCHAR(100) NOT NULL UNIQUE,
    Descripcion      NVARCHAR(500) NULL,
    PrecioNoche      DECIMAL(10,2) NOT NULL CHECK (PrecioNoche > 0),
    CapacidadMaxima  INT NOT NULL CHECK (CapacidadMaxima > 0),
    Nivel            INT NOT NULL,                 -- piso donde se ubica el tipo
    TipoCama         NVARCHAR(50) NOT NULL,
    Caracteristicas  NVARCHAR(500) NULL,           -- separadas por |
    Imagen           NVARCHAR(200) NULL
);

IF OBJECT_ID('Catalogos.Servicios') IS NULL
CREATE TABLE Catalogos.Servicios (
    IdServicio  INT IDENTITY(1,1) PRIMARY KEY,
    Nombre      NVARCHAR(100) NOT NULL,
    Descripcion NVARCHAR(300) NULL,
    Icono       VARCHAR(30) NOT NULL,
    Incluido    BIT NOT NULL DEFAULT 1,            -- 1 = incluido, 0 = adicional
    Precio      DECIMAL(10,2) NULL
);

IF OBJECT_ID('Catalogos.RutasTuristicas') IS NULL
CREATE TABLE Catalogos.RutasTuristicas (
    IdRuta       INT IDENTITY(1,1) PRIMARY KEY,
    Nombre       NVARCHAR(100) NOT NULL UNIQUE,
    Descripcion  NVARCHAR(600) NULL,
    DistanciaKm  DECIMAL(6,1) NOT NULL,
    DuracionTexto NVARCHAR(20) NOT NULL,           -- p. ej. "1h 15min"
    Dificultad   NVARCHAR(20) NOT NULL CHECK (Dificultad IN (N'Baja', N'Media', N'Alta')),
    CostoPersona DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (CostoPersona >= 0),
    Lugares      NVARCHAR(500) NULL,               -- separados por |
    Latitud      DECIMAL(9,6) NOT NULL,
    Longitud     DECIMAL(9,6) NOT NULL,
    Imagen       NVARCHAR(200) NULL,
    Activa       BIT NOT NULL DEFAULT 1
);
GO

/* ------------------------------- HOTEL ----------------------------- */
IF OBJECT_ID('Hotel.Cliente') IS NULL
CREATE TABLE Hotel.Cliente (
    IdCliente      INT IDENTITY(1,1) PRIMARY KEY,
    NombreCompleto NVARCHAR(100) NOT NULL,
    Email          NVARCHAR(100) NOT NULL,
    Telefono       VARCHAR(20) NULL,
    PasswordHash   VARCHAR(255) NOT NULL,          -- password_hash() de PHP
    FechaRegistro  DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_Cliente_Email UNIQUE (Email)
);

IF OBJECT_ID('Hotel.Administradores') IS NULL
CREATE TABLE Hotel.Administradores (
    IdAdmin      INT IDENTITY(1,1) PRIMARY KEY,
    Usuario      NVARCHAR(50) NOT NULL UNIQUE,
    NombreAdmin  NVARCHAR(100) NOT NULL,
    PasswordHash VARCHAR(255) NOT NULL
);

IF OBJECT_ID('Hotel.Habitaciones') IS NULL
CREATE TABLE Hotel.Habitaciones (
    IdHabitacion     INT IDENTITY(1,1) PRIMARY KEY,
    NumeroHabitacion INT NOT NULL UNIQUE CHECK (NumeroHabitacion BETWEEN 1 AND 300),
    Nivel            INT NOT NULL CHECK (Nivel BETWEEN 2 AND 4),
    IdTipoHabitacion INT NOT NULL
        CONSTRAINT FK_Hab_Tipo REFERENCES Catalogos.TiposHabitacion(IdTipoHabitacion)
);

IF OBJECT_ID('Hotel.SolicitudesReserva') IS NULL
CREATE TABLE Hotel.SolicitudesReserva (
    IdReserva        INT IDENTITY(1,1) PRIMARY KEY,
    IdCliente        INT NOT NULL
        CONSTRAINT FK_Reserva_Cliente REFERENCES Hotel.Cliente(IdCliente),
    IdTipoHabitacion INT NOT NULL
        CONSTRAINT FK_Reserva_Tipo REFERENCES Catalogos.TiposHabitacion(IdTipoHabitacion),
    IdHabitacion     INT NOT NULL
        CONSTRAINT FK_Reserva_Hab REFERENCES Hotel.Habitaciones(IdHabitacion),
    FechaLlegada     DATE NOT NULL,
    FechaSalida      DATE NOT NULL,
    NoHuespedes      INT NOT NULL CHECK (NoHuespedes > 0),
    SolicitudesEspeciales NVARCHAR(MAX) NULL,
    Estado           NVARCHAR(20) NOT NULL DEFAULT N'Pendiente'
        CHECK (Estado IN (N'Pendiente', N'Confirmada', N'Cancelada')),
    PrecioNoche      DECIMAL(10,2) NOT NULL,       -- tarifa vigente al reservar
    FechaCreacion    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_Reserva_Fechas CHECK (FechaSalida > FechaLlegada)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reserva_Hab_Fechas')
CREATE INDEX IX_Reserva_Hab_Fechas ON Hotel.SolicitudesReserva (IdHabitacion, FechaLlegada, FechaSalida)
    WHERE Estado <> N'Cancelada';   -- (índice filtrado: acelera el control de sobreventa)

/* Rutas/tours que el cliente agrega a su reserva (extras fuera del plan) */
IF OBJECT_ID('Hotel.ReservaRutas') IS NULL
CREATE TABLE Hotel.ReservaRutas (
    IdReservaRuta  INT IDENTITY(1,1) PRIMARY KEY,
    IdReserva      INT NOT NULL
        CONSTRAINT FK_RR_Reserva REFERENCES Hotel.SolicitudesReserva(IdReserva) ON DELETE CASCADE,
    IdRuta         INT NOT NULL
        CONSTRAINT FK_RR_Ruta REFERENCES Catalogos.RutasTuristicas(IdRuta),
    Personas       INT NOT NULL CHECK (Personas > 0),
    PrecioUnitario DECIMAL(10,2) NOT NULL,         -- costo por persona al agregarla
    CONSTRAINT UQ_RR UNIQUE (IdReserva, IdRuta)
);

IF OBJECT_ID('Hotel.Resenas') IS NULL
CREATE TABLE Hotel.Resenas (
    IdResena      INT IDENTITY(1,1) PRIMARY KEY,
    IdCliente     INT NOT NULL
        CONSTRAINT FK_Resena_Cliente REFERENCES Hotel.Cliente(IdCliente),
    PaisOrigen    NVARCHAR(50) NOT NULL,
    Comentario    NVARCHAR(MAX) NOT NULL,
    Calificacion  INT NOT NULL DEFAULT 5 CHECK (Calificacion BETWEEN 1 AND 5),
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

/* ============================ DATOS INICIALES ======================= */
IF NOT EXISTS (SELECT 1 FROM Catalogos.TiposHabitacion)
INSERT INTO Catalogos.TiposHabitacion (NombreTipo, Descripcion, PrecioNoche, CapacidadMaxima, Nivel, TipoCama, Caracteristicas, Imagen) VALUES
(N'Habitación Estándar', N'Confort esencial con estilo tropical sobrio. Nivel 2, habitaciones 1 a 100.', 85.00, 2, 2, N'Cama Doble', N'Cama Doble|Aire acondicionado|Smart TV de 55"|Wi-Fi de alta velocidad', N'assets/img/estandar.jpg'),
(N'Habitación Deluxe',   N'Más espacio y detalles premium para un descanso superior. Nivel 3, habitaciones 101 a 200.', 120.00, 3, 3, N'Cama Queen', N'Cama Queen|Terraza privada|Minibar premium|Aire acondicionado|Wi-Fi de alta velocidad', N'assets/img/deluxe.jpg'),
(N'Suite Ocean View',    N'La experiencia más exclusiva, con vista directa al mar. Nivel 4, habitaciones 201 a 300.', 180.00, 4, 4, N'Cama King', N'Cama King|Balcón con vista al mar|Jacuzzi privado|Minibar premium|Servicio a la habitación|Wi-Fi de alta velocidad', N'assets/img/suite.jpg');

/* 300 habitaciones: 1-100 (nivel 2, Estándar) | 101-200 (nivel 3, Deluxe) | 201-300 (nivel 4, Suite)
   El nivel 1 es recepción, restaurante y gimnasio (sin habitaciones). */
IF NOT EXISTS (SELECT 1 FROM Hotel.Habitaciones)
BEGIN
    ;WITH n AS (
        SELECT TOP (300) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS num
        FROM sys.all_objects a CROSS JOIN sys.all_objects b
    )
    INSERT INTO Hotel.Habitaciones (NumeroHabitacion, Nivel, IdTipoHabitacion)
    SELECT num,
           CASE WHEN num <= 100 THEN 2 WHEN num <= 200 THEN 3 ELSE 4 END,
           CASE WHEN num <= 100 THEN 1 WHEN num <= 200 THEN 2 ELSE 3 END
    FROM n;
END

IF NOT EXISTS (SELECT 1 FROM Catalogos.Servicios)
INSERT INTO Catalogos.Servicios (Nombre, Descripcion, Icono, Incluido, Precio) VALUES
(N'Wi-Fi de alta velocidad', N'Conexión estable en todo el hotel y en la playa.', 'wifi', 1, NULL),
(N'Piscina infinita',        N'Piscina frente al mar con camastros y sombrillas.', 'pool', 1, NULL),
(N'Restaurante',             N'Cocina de autor con productos del mar salvadoreño (nivel 1).', 'restaurant', 1, NULL),
(N'Gimnasio',                N'Equipamiento completo, abierto desde las 5:00 a.m. (nivel 1).', 'gym', 1, NULL),
(N'Recepción 24 horas',      N'Atención permanente y asistencia para tus planes.', 'concierge', 1, NULL),
(N'Spa & Wellness',          N'Masajes y tratamientos con ingredientes locales.', 'spa', 0, 45.00),
(N'Tours guiados',           N'Rutas con guía certificado y transporte (ver mapa de rutas).', 'tours', 0, NULL),
(N'Clases de surf',          N'Instructores certificados bilingües, equipo incluido.', 'surf', 0, 35.00);

IF NOT EXISTS (SELECT 1 FROM Catalogos.RutasTuristicas)
INSERT INTO Catalogos.RutasTuristicas (Nombre, Descripcion, DistanciaKm, DuracionTexto, Dificultad, CostoPersona, Lugares, Latitud, Longitud, Imagen) VALUES
(N'Playa El Tunco', N'Playa de arena oscura y roca emblemática, cuna del surf salvadoreño. Atardeceres, bares y restaurantes frente al mar.', 18.0, N'25 min', N'Baja', 20.00, N'Roca El Tunco|Playa Sunzal|Mirador de la costa', 13.493600, -89.382800, N'assets/img/ruta-tunco.jpg'),
(N'Parque Nacional El Imposible', N'Bosque tropical con cascadas, ríos y senderos entre las áreas protegidas más ricas en biodiversidad del país.', 85.0, N'1h 30min', N'Alta', 45.00, N'Sendero Los Enanos|Cascada del Río Venado|Mirador del Cerro Leon', 13.866700, -89.933300, N'assets/img/ruta-imposible.jpg'),
(N'Ruta de las Flores', N'Pueblos de colores, gastronomía, cafetales, artesanías y feria gastronómica de fin de semana.', 120.0, N'2h', N'Media', 40.00, N'Juayúa|Apaneca|Ataco|Salcoatitán', 13.845000, -89.745000, N'assets/img/ruta-flores.jpg'),
(N'Lago de Coatepeque', N'Lago volcánico de aguas turquesa rodeado de montañas; ideal para kayak, paseo en lancha y almuerzo frente al agua.', 70.0, N'1h 15min', N'Baja', 30.00, N'Mirador de Coatepeque|Isla Teopán|Muelle de Cerro Verde', 13.866700, -89.550000, N'assets/img/ruta-coatepeque.jpg'),
(N'Ruinas de Tazumal', N'Sitio arqueológico maya en Chalchuapa con pirámides y museo, uno de los más importantes del país.', 95.0, N'1h 45min', N'Media', 35.00, N'Pirámide principal|Museo Dr. Stanley H. Boggs|Casa Blanca', 13.978300, -89.681100, N'assets/img/ruta-tazumal.jpg'),
(N'Puerto de La Libertad', N'Muelle turístico, mercado de mariscos y malecón; perfecto para una tarde de gastronomía local.', 15.0, N'20 min', N'Baja', 15.00, N'Muelle turístico|Mercado de mariscos|Malecón', 13.488300, -89.322500, N'assets/img/ruta-libertad.jpg');

/* Clientes de demostración (solo para mostrar reseñas; el hash '!' nunca coincide con una contraseña) */
IF NOT EXISTS (SELECT 1 FROM Hotel.Resenas)
BEGIN
    INSERT INTO Hotel.Cliente (NombreCompleto, Email, Telefono, PasswordHash) VALUES
    (N'Laura Martínez', 'demo.laura@example.com', NULL, '!'),
    (N'James Carter',   'demo.james@example.com', NULL, '!'),
    (N'Camila Rojas',   'demo.camila@example.com', NULL, '!');

    INSERT INTO Hotel.Resenas (IdCliente, PaisOrigen, Comentario, Calificacion)
    SELECT IdCliente, N'México', N'La suite con vista al mar es de otro nivel. El personal nos recomendó la ruta al Lago de Coatepeque y fue lo mejor del viaje.', 5 FROM Hotel.Cliente WHERE Email = 'demo.laura@example.com'
    UNION ALL
    SELECT IdCliente, N'Estados Unidos', N'Clases de surf excelentes y una noche de fogata inolvidable. Volveremos.', 5 FROM Hotel.Cliente WHERE Email = 'demo.james@example.com'
    UNION ALL
    SELECT IdCliente, N'Chile', N'Habitaciones limpias y cómodas, y el restaurante superó mis expectativas. Muy buena relación calidad-precio.', 4 FROM Hotel.Cliente WHERE Email = 'demo.camila@example.com';
END
GO

/* El administrador se crea con:  php api/tools/crear_admin.php  (ver README) */
PRINT 'Base de datos CostaDelSol lista.';
