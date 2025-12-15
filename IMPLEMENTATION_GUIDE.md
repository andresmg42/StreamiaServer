# Guia de Implementacion de Microservicios - Streamia

Este documento detalla los pasos necesarios para implementar los microservicios faltantes en la arquitectura de Streamia.

## Indice

1. [Estado Actual del Proyecto](#estado-actual-del-proyecto)
2. [Arquitectura General](#arquitectura-general)
3. [Estructura Base de un Microservicio](#estructura-base-de-un-microservicio)
4. [Movie Service](#movie-service)
5. [Favorites Service](#favorites-service)
6. [Rating Service](#rating-service)
7. [Comment Service](#comment-service)
8. [Notification Service](#notification-service)
9. [Configuracion de Docker Compose](#configuracion-de-docker-compose)
10. [Eventos y Comunicacion](#eventos-y-comunicacion)

---

## Estado Actual del Proyecto

### Servicios Implementados

| Servicio | Puerto | Estado |
|----------|--------|--------|
| User Service | 3001 | Implementado |
| API Gateway | 3000 | Implementado |

### Servicios Pendientes

| Servicio | Puerto | Estado |
|----------|--------|--------|
| Movie Service | 3002 | Pendiente |
| Favorites Service | 3003 | Pendiente |
| Rating Service | 3004 | Pendiente |
| Comment Service | 3005 | Pendiente |
| Notification Service | 3006 | Pendiente |

---

## Arquitectura General

```mermaid
flowchart TB
    subgraph Cliente
        WEB[Web App]
        MOB[Mobile App]
    end

    subgraph Gateway
        GW[API Gateway :3000]
    end

    subgraph Microservicios
        US[User Service :3001]
        MS[Movie Service :3002]
        FS[Favorites Service :3003]
        RS[Rating Service :3004]
        CS[Comment Service :3005]
        NS[Notification Service :3006]
    end

    subgraph Mensajeria
        RMQ[RabbitMQ]
    end

    subgraph Datos
        MONGO[(MongoDB)]
        REDIS[(Redis)]
    end

    WEB --> GW
    MOB --> GW
    GW --> US & MS & FS & RS & CS
    US & MS & FS & RS & CS & NS <--> RMQ
    US & MS & FS & RS & CS --> MONGO
    US & MS --> REDIS
```

---

## Estructura Base de un Microservicio

Cada microservicio sigue la misma estructura del User Service como referencia:

```mermaid
flowchart TB
    subgraph Estructura del Servicio
        INDEX[index.ts] --> APP[app.ts]
        APP --> ROUTES[routes/]
        APP --> MIDDLEWARES[middlewares/]
        ROUTES --> CONTROLLERS[controllers/]
        CONTROLLERS --> SERVICES[services/]
        SERVICES --> MODELS[models/]
        SERVICES --> EVENTBUS[EventBus]
    end
```

### Archivos Base Requeridos

```
services/{service-name}/
├── Dockerfile
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts           # Punto de entrada, bootstrap
    ├── app.ts             # Configuracion de Express
    ├── config/
    │   ├── index.ts       # Variables de entorno
    │   ├── database.ts    # Conexion MongoDB
    │   └── redis.ts       # Conexion Redis (opcional)
    ├── controllers/
    │   └── {name}Controller.ts
    ├── services/
    │   └── {name}Service.ts
    ├── models/
    │   └── {Model}.ts
    ├── routes/
    │   └── {name}Routes.ts
    ├── validators/
    │   └── {name}Validators.ts
    └── middlewares/
        └── index.ts
```

---

## Movie Service

### Descripcion

Gestiona el catalogo de peliculas, incluyendo operaciones CRUD, subida de videos a Cloudinary y cache con Redis.

### Diagrama de Flujo

```mermaid
flowchart LR
    subgraph Movie Service
        API[REST API]
        SVC[MovieService]
        MODEL[Movie Model]
        CACHE[Redis Cache]
        CLD[Cloudinary]
    end

    API --> SVC
    SVC --> MODEL
    SVC --> CACHE
    SVC --> CLD
    SVC --> |Publica| RMQ[RabbitMQ]
```

### Archivos a Crear

#### 1. services/movie-service/package.json

Puntos clave:
- Nombre: `@streamia/movie-service`
- Dependencias adicionales: `cloudinary`, `multer` para upload de archivos
- Scripts identicos al user-service
- Puerto: 3002

#### 2. services/movie-service/src/config/index.ts

Variables de entorno requeridas:
- `PORT`: 3002
- `MONGODB_URI`: URI con base de datos `streamia_movies`
- `REDIS_URL`: Para cache de peliculas
- `RABBITMQ_URL`: Comunicacion con otros servicios
- `CLOUDINARY_CLOUD_NAME`: Nombre del cloud
- `CLOUDINARY_API_KEY`: API key de Cloudinary
- `CLOUDINARY_API_SECRET`: Secret de Cloudinary

#### 3. services/movie-service/src/models/Movie.ts

Campos del modelo:
- `title`: String, requerido, indexado
- `description`: String, requerido
- `genre`: Array de strings
- `releaseYear`: Number
- `duration`: Number (minutos)
- `director`: String
- `cast`: Array de strings
- `posterUrl`: String (URL de Cloudinary)
- `videoUrl`: String (URL de Cloudinary)
- `subtitles`: Array de objetos {language, url}
- `averageRating`: Number, default 0
- `totalRatings`: Number, default 0
- `createdAt`, `updatedAt`: Timestamps

#### 4. services/movie-service/src/services/movieService.ts

Metodos principales:
- `createMovie(data)`: Crea pelicula, publica `MOVIE_CREATED`
- `updateMovie(id, data)`: Actualiza, publica `MOVIE_UPDATED`
- `deleteMovie(id)`: Elimina de Cloudinary y BD, publica `MOVIE_DELETED`
- `getMovies(filters, pagination)`: Lista con filtros y cache
- `getMovieById(id)`: Obtiene con cache
- `uploadVideo(movieId, file)`: Sube a Cloudinary
- `addSubtitles(movieId, language, file)`: Agrega subtitulos

Debe suscribirse a:
- `RATING_CREATED`, `RATING_UPDATED`, `RATING_DELETED`: Para recalcular `averageRating`

#### 5. services/movie-service/src/controllers/movieController.ts

Endpoints:
- `GET /movies` - Lista peliculas con paginacion
- `GET /movies/:id` - Obtiene pelicula por ID
- `POST /movies` - Crea pelicula (requiere auth admin)
- `PUT /movies/:id` - Actualiza pelicula
- `DELETE /movies/:id` - Elimina pelicula
- `POST /movies/:id/upload` - Sube video
- `POST /movies/:id/subtitles` - Agrega subtitulos

#### 6. services/movie-service/src/validators/movieValidators.ts

Esquemas Zod para:
- `createMovieSchema`: Validacion de creacion
- `updateMovieSchema`: Validacion de actualizacion
- `movieFiltersSchema`: Validacion de filtros de busqueda

### Eventos Publicados

| Evento | Payload | Consumidores |
|--------|---------|--------------|
| `movie.created` | {movieId, title} | - |
| `movie.updated` | {movieId, changes} | - |
| `movie.deleted` | {movieId} | Favorites, Rating, Comment |
| `movie.video_uploaded` | {movieId, videoUrl} | - |

---

## Favorites Service

### Descripcion

Gestiona la lista de peliculas favoritas de cada usuario.

### Diagrama de Flujo

```mermaid
flowchart LR
    subgraph Favorites Service
        API[REST API]
        SVC[FavoritesService]
        MODEL[Favorite Model]
    end

    API --> SVC
    SVC --> MODEL
    SVC --> |Publica| RMQ[RabbitMQ]
    RMQ --> |Escucha| SVC
```

### Archivos a Crear

#### 1. services/favorites-service/src/models/Favorite.ts

Campos del modelo:
- `userId`: ObjectId, requerido, indexado
- `movieId`: ObjectId, requerido, indexado
- `note`: String, opcional (nota personal del usuario)
- `createdAt`: Timestamp

Indice compuesto unico en `{userId, movieId}` para evitar duplicados.

#### 2. services/favorites-service/src/services/favoritesService.ts

Metodos principales:
- `addFavorite(userId, movieId, note?)`: Agrega favorito, publica `FAVORITE_ADDED`
- `removeFavorite(userId, movieId)`: Elimina, publica `FAVORITE_REMOVED`
- `getUserFavorites(userId, pagination)`: Lista favoritos del usuario
- `isFavorite(userId, movieId)`: Verifica si es favorito
- `clearUserFavorites(userId)`: Elimina todos (interno)
- `clearMovieFavorites(movieId)`: Elimina todos de una pelicula (interno)

Debe suscribirse a:
- `USER_DELETED`: Ejecutar `clearUserFavorites`
- `MOVIE_DELETED`: Ejecutar `clearMovieFavorites`

#### 3. services/favorites-service/src/controllers/favoritesController.ts

Endpoints:
- `GET /favorites` - Lista favoritos del usuario autenticado
- `POST /favorites/:movieId` - Agrega a favoritos
- `DELETE /favorites/:movieId` - Elimina de favoritos
- `GET /favorites/:movieId/check` - Verifica si es favorito

### Eventos

```mermaid
flowchart LR
    subgraph Publicados
        FA[favorite.added]
        FR[favorite.removed]
        FCU[favorites.cleared_for_user]
        FCM[favorites.cleared_for_movie]
    end

    subgraph Consumidos
        UD[user.deleted]
        MD[movie.deleted]
    end

    UD --> |Trigger| FCU
    MD --> |Trigger| FCM
```

---

## Rating Service

### Descripcion

Gestiona las calificaciones de peliculas por usuarios.

### Diagrama de Flujo

```mermaid
flowchart LR
    subgraph Rating Service
        API[REST API]
        SVC[RatingService]
        MODEL[Rating Model]
    end

    API --> SVC
    SVC --> MODEL
    SVC --> |Publica| RMQ[RabbitMQ]
    RMQ --> |Escucha| SVC
```

### Archivos a Crear

#### 1. services/rating-service/src/models/Rating.ts

Campos del modelo:
- `userId`: ObjectId, requerido, indexado
- `movieId`: ObjectId, requerido, indexado
- `score`: Number, requerido (1-5 o 1-10)
- `createdAt`, `updatedAt`: Timestamps

Indice compuesto unico en `{userId, movieId}`.

#### 2. services/rating-service/src/services/ratingService.ts

Metodos principales:
- `createOrUpdateRating(userId, movieId, score)`: Crea/actualiza, publica evento
- `deleteRating(userId, movieId)`: Elimina rating, publica `RATING_DELETED`
- `getUserRating(userId, movieId)`: Obtiene rating del usuario para una pelicula
- `getMovieRatings(movieId)`: Obtiene estadisticas de ratings
- `getUserRatings(userId, pagination)`: Historial de ratings del usuario
- `calculateMovieAverage(movieId)`: Calcula promedio (emite evento para Movie Service)

Debe suscribirse a:
- `USER_DELETED`: Eliminar ratings del usuario
- `MOVIE_DELETED`: Eliminar ratings de la pelicula

#### 3. services/rating-service/src/controllers/ratingController.ts

Endpoints:
- `POST /ratings/:movieId` - Califica pelicula
- `GET /ratings/:movieId` - Obtiene rating del usuario
- `DELETE /ratings/:movieId` - Elimina rating
- `GET /ratings/movie/:movieId/stats` - Estadisticas de la pelicula
- `GET /ratings/user/history` - Historial del usuario

### Eventos

| Evento | Payload | Consumidores |
|--------|---------|--------------|
| `rating.created` | {userId, movieId, score} | Movie Service |
| `rating.updated` | {userId, movieId, score, previousScore} | Movie Service |
| `rating.deleted` | {userId, movieId, score} | Movie Service |

---

## Comment Service

### Descripcion

Gestiona los comentarios en peliculas con soporte para moderacion.

### Diagrama de Flujo

```mermaid
flowchart LR
    subgraph Comment Service
        API[REST API]
        SVC[CommentService]
        MODEL[Comment Model]
    end

    API --> SVC
    SVC --> MODEL
    SVC --> |Publica| RMQ[RabbitMQ]
    RMQ --> |Escucha| SVC
```

### Archivos a Crear

#### 1. services/comment-service/src/models/Comment.ts

Campos del modelo:
- `userId`: ObjectId, requerido, indexado
- `movieId`: ObjectId, requerido, indexado
- `content`: String, requerido (max 1000 caracteres)
- `parentId`: ObjectId, opcional (para respuestas)
- `isEdited`: Boolean, default false
- `isDeleted`: Boolean, default false (soft delete)
- `moderationStatus`: Enum ['pending', 'approved', 'rejected']
- `createdAt`, `updatedAt`: Timestamps

#### 2. services/comment-service/src/services/commentService.ts

Metodos principales:
- `createComment(userId, movieId, content, parentId?)`: Crea comentario
- `updateComment(userId, commentId, content)`: Edita (solo propietario)
- `deleteComment(userId, commentId)`: Soft delete
- `getMovieComments(movieId, pagination)`: Lista con paginacion
- `getCommentReplies(commentId, pagination)`: Obtiene respuestas
- `moderateComment(commentId, status)`: Modera (admin)

Debe suscribirse a:
- `USER_DELETED`: Marcar comentarios como eliminados o anonimizar
- `MOVIE_DELETED`: Eliminar comentarios de la pelicula

#### 3. services/comment-service/src/controllers/commentController.ts

Endpoints:
- `GET /comments/movie/:movieId` - Lista comentarios de pelicula
- `POST /comments/movie/:movieId` - Crea comentario
- `PUT /comments/:commentId` - Edita comentario
- `DELETE /comments/:commentId` - Elimina comentario
- `GET /comments/:commentId/replies` - Obtiene respuestas
- `PATCH /comments/:commentId/moderate` - Modera (admin)

### Estructura de Comentarios Anidados

```mermaid
flowchart TB
    C1[Comentario Principal]
    C1 --> R1[Respuesta 1]
    C1 --> R2[Respuesta 2]
    R1 --> R1A[Respuesta a R1]
```

---

## Notification Service

### Descripcion

Servicio dedicado al envio de notificaciones por email. Es un consumidor puro de eventos, no expone API REST publica.

### Diagrama de Flujo

```mermaid
flowchart LR
    subgraph Otros Servicios
        US[User Service]
        MS[Movie Service]
    end

    subgraph RabbitMQ
        Q[notifications.queue]
    end

    subgraph Notification Service
        CONSUMER[Event Consumer]
        EMAIL[Email Service]
        TEMPLATES[Templates]
    end

    subgraph External
        SMTP[SMTP Server]
    end

    US --> |notification.send_email| Q
    MS --> |notification.send_email| Q
    Q --> CONSUMER
    CONSUMER --> EMAIL
    EMAIL --> TEMPLATES
    EMAIL --> SMTP
```

### Archivos a Crear

#### 1. services/notification-service/src/config/index.ts

Variables de entorno:
- `RABBITMQ_URL`: Para consumir eventos
- `SMTP_HOST`: Host del servidor SMTP
- `SMTP_PORT`: Puerto SMTP
- `SMTP_USER`: Usuario SMTP
- `SMTP_PASS`: Password SMTP
- `EMAIL_FROM`: Direccion de origen

#### 2. services/notification-service/src/services/emailService.ts

Metodos principales:
- `sendEmail(to, subject, template, data)`: Envia email usando plantilla
- `sendWelcomeEmail(to, username)`: Email de bienvenida
- `sendPasswordResetEmail(to, resetToken)`: Email de reset
- `sendNotification(to, subject, message)`: Notificacion generica

#### 3. services/notification-service/src/templates/

Archivos de plantillas HTML:
- `welcome.html`: Template de bienvenida
- `password-reset.html`: Template de reset de password
- `notification.html`: Template generico

#### 4. services/notification-service/src/consumers/notificationConsumer.ts

Consumidor de eventos:
- Suscribirse a `NOTIFICATION_SEND_EMAIL`
- Procesar payload y enviar email correspondiente
- Publicar `NOTIFICATION_SENT` o `NOTIFICATION_FAILED`

### Diferencias con Otros Servicios

Este servicio NO tiene:
- Modelo de MongoDB (no persiste datos)
- Controladores REST (no expone API)
- Redis cache

Solo tiene:
- Consumidor de eventos RabbitMQ
- Servicio de email
- Templates HTML

---

## Configuracion de Docker Compose

### Archivo: infrastructure/docker-compose.yml

Para cada nuevo servicio, agregar un bloque similar a:

```yaml
  {service-name}:
    build:
      context: ..
      dockerfile: services/{service-name}/Dockerfile
    container_name: streamia-{service-name}
    restart: unless-stopped
    ports:
      - "{PORT}:{PORT}"
    environment:
      NODE_ENV: development
      PORT: {PORT}
      MONGODB_URI: mongodb://streamia:streamia_secret@mongodb:27017/streamia_{db_name}?authSource=admin
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://streamia:streamia@rabbitmq:5672
      # Variables adicionales segun servicio
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    networks:
      - streamia-network
```

### Puertos y Bases de Datos

| Servicio | Puerto | Base de Datos |
|----------|--------|---------------|
| movie-service | 3002 | streamia_movies |
| favorites-service | 3003 | streamia_favorites |
| rating-service | 3004 | streamia_ratings |
| comment-service | 3005 | streamia_comments |
| notification-service | 3006 | - (sin BD) |

---

## Eventos y Comunicacion

### Mapa Completo de Eventos

```mermaid
flowchart TB
    subgraph User Service
        UE1[user.registered]
        UE2[user.deleted]
        UE3[user.updated]
    end

    subgraph Movie Service
        ME1[movie.created]
        ME2[movie.deleted]
        ME3[movie.updated]
    end

    subgraph Rating Service
        RE1[rating.created]
        RE2[rating.updated]
        RE3[rating.deleted]
    end

    subgraph Favorites Service
        FE1[favorite.added]
        FE2[favorite.removed]
    end

    subgraph Comment Service
        CE1[comment.created]
        CE2[comment.deleted]
    end

    subgraph Notification Service
        NS[Consumidor]
    end

    UE1 --> |email bienvenida| NS
    UE2 --> FE2 & RE3 & CE2
    ME2 --> FE2 & RE3 & CE2
    RE1 & RE2 & RE3 --> |recalcular promedio| ME3
```

### Archivo: shared/src/events/constants.ts

Los eventos ya estan definidos. Verificar que incluya:
- Todos los eventos de USER
- Todos los eventos de MOVIE
- Todos los eventos de FAVORITES
- Todos los eventos de RATING
- Todos los eventos de COMMENT
- Todos los eventos de NOTIFICATION

### Patron de Suscripcion

Cada servicio debe suscribirse a los eventos relevantes en su archivo `index.ts`:

```mermaid
sequenceDiagram
    participant SVC as Servicio
    participant EB as EventBus
    participant RMQ as RabbitMQ

    SVC->>EB: subscribe(EVENT_NAME, handler)
    EB->>RMQ: Crear queue y binding
    RMQ-->>EB: Confirmacion
    
    Note over RMQ: Cuando llega evento...
    
    RMQ->>EB: Mensaje recibido
    EB->>SVC: handler(event)
    SVC-->>EB: Procesado
    EB->>RMQ: ACK
```

---

## Orden de Implementacion Recomendado

```mermaid
flowchart LR
    A[1. Movie Service] --> B[2. Favorites Service]
    B --> C[3. Rating Service]
    C --> D[4. Comment Service]
    D --> E[5. Notification Service]
```

### Justificacion

1. **Movie Service**: Es la entidad central, otros servicios dependen de el
2. **Favorites Service**: Dependencia simple con User y Movie
3. **Rating Service**: Similar a Favorites pero con logica de promedios
4. **Comment Service**: Mas complejo por comentarios anidados
5. **Notification Service**: Puede implementarse en paralelo, solo consume eventos

---


## Consideraciones Adicionales

### Manejo de Errores

Cada servicio debe implementar:
- Middleware de errores global
- Logging estructurado
- Respuestas de error consistentes

### Cache Strategy

Para Movie Service:
- Cache de lista de peliculas (TTL corto)
- Cache de pelicula individual (TTL medio)
- Invalidacion en eventos de update/delete

### Idempotencia

Los handlers de eventos deben ser idempotentes:
- Verificar si la operacion ya se realizo
- Usar el `eventId` para deduplicacion

### Health Checks

Cada servicio debe exponer:
- `GET /health`: Estado general
- `GET /health/live`: Liveness probe para Kubernetes
- `GET /health/ready`: Readiness probe (verifica dependencias)
