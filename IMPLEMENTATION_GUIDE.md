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

## Guía de Despliegue en Kubernetes

### ⚠️ Consideración Importante: Namespace "streamia"

**TODOS los servicios y despliegues DEBEN estar en el namespace `streamia`.**

Usar otros namespaces causará problemas en las URLs de comunicación entre servicios. Los servicios se resuelven internamente usando el patrón:
```
nombre-servicio.namespace.svc.cluster.local
```

Si cambias de namespace, tendrás que actualizar manualmente todas las URLs en ConfigMaps y Secrets.

**Para evitar problemas:**
- ✅ Todos los servicios en: `namespace: streamia`
- ✅ Configurar correctamente el `.env` antes de generar los YAML
- ✅ No crear servicios en otros namespaces como `default` o `streamia-infra`

### Prerrequisitos

1. **Kubernetes en funcionamiento** (Docker Desktop, Minikube, o cluster cloud)
2. **kubectl** instalado y configurado
3. **Archivo .env** con las variables de entorno necesarias

### Paso 1: Preparar las Variables de Entorno

Todas las variables de configuración y secretos deben estar en un archivo `.env` en la carpeta `infrastructure/`:

```bash
# infrastructure/.env

# MongoDB
MONGODB_ROOT_USER=streamia
MONGODB_ROOT_PASSWORD=streamia_secret

# RabbitMQ
RABBITMQ_USER=streamia
RABBITMQ_PASSWORD=streamia

# JWT
JWT_SECRET=tu-jwt-secret-aqui
JWT_REFRESH_SECRET=tu-refresh-secret-aqui

# Cloudinary
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=tu-api-key
CLOUDINARY_API_SECRET=tu-api-secret

# Email/SMTP
EMAIL_FROM=streamia@example.com
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=tu-sendgrid-key

# URLs y Puertos
PORT=3000
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=https://streamia.example.com
```

### Paso 2: Generar Archivos de Configuración de Kubernetes

Ejecuta el script que convierte el archivo `.env` en archivos YAML de ConfigMap y Secret:

**En Linux/Mac:**
```bash
cd infrastructure/scripts
chmod +x generate-k8s-secrets.sh
./generate-k8s-secrets.sh
```

**En Windows (PowerShell):**
```powershell
cd infrastructure/scripts
.\generate-k8s-secrets.ps1
```

Este script generará los archivos en `infrastructure/kubernetes/generated/`:
- `configmap-from-env.yaml` - Configuración no sensible
- `secrets-from-env.yaml` - Secretos (credenciales, API keys, etc.)

**⚠️ Importante:** Asegúrate de que los archivos generados contengan las credenciales correctas antes de desplegar.

### Paso 3: Desplegar la Infraestructura

Ejecuta el script de despliegue que gestiona las tres etapas automáticamente:

**En Linux/Mac:**
```bash
cd infrastructure/scripts
chmod +x deploy-infrastructure.sh
./deploy-infrastructure.sh
```

**En Windows (PowerShell):**
```powershell
cd infrastructure/scripts
.\deploy-infrastructure.ps1
```

#### Etapas de Despliegue Automático

El script ejecuta tres etapas en orden:

**Etapa 1: Configuración de Namespace**
- Crea el namespace `streamia`
- Aplica ConfigMaps y Secrets

**Etapa 2: Servicios de Infraestructura** ⏳
- Despliega MongoDB, Redis y RabbitMQ
- **Espera hasta que estén listos** (1/1 réplica)
- Timeout configurable (por defecto 300 segundos)

**Etapa 3: Microservicios**
- Despliega API Gateway
- Despliega todos los microservicios (User, Movie, Favorites, Rating, Comment, Notification)

### Estructura de Carpetas Kubernetes

```
infrastructure/kubernetes/
├── namespaces/              # Definición de namespaces
│   └── namespaces.yaml
├── generated/               # Generado por generate-k8s-secrets.sh
│   ├── configmap-from-env.yaml
│   └── secrets-from-env.yaml
├── global/                  # Servicios globales de infraestructura
│   ├── mongodb.yaml         # Base de datos
│   ├── redis.yaml           # Cache
│   └── rabbitmq.yaml        # Message broker
└── deployments/             # Microservicios
    ├── api-gateway.yaml
    ├── user-service.yaml
    ├── movie-service.yaml
    ├── favorites-service.yaml
    ├── rating-service.yaml
    ├── comment-service.yaml
    └── notification-service.yaml
```

### Paso 4: Verificar el Despliegue

Después de ejecutar el script, verifica que todos los pods estén en ejecución:

```bash
# Ver todos los pods
kubectl get pods -n streamia

# Resultado esperado:
# NAME                                    READY   STATUS    RESTARTS   AGE
# mongodb-0                              1/1     Running   0          2m
# redis-0                                1/1     Running   0          2m
# rabbitmq-0                             1/1     Running   0          2m
# api-gateway-xxxxx-xxxxx                1/1     Running   0          1m
# user-service-xxxxx-xxxxx               1/1     Running   0          1m
# movie-service-xxxxx-xxxxx              1/1     Running   0          1m
# ... (otros servicios)
```

Ver logs de un pod específico:

```bash
kubectl logs -f <pod-name> -n streamia

# Ejemplo:
kubectl logs -f user-service-xxxxx-xxxxx -n streamia
```

### Paso 5: Probar Microservicios Localmente

Para acceder a los microservicios desde tu máquina local, usa `port-forward`:

**Redirigir puerto del User Service (3001):**
```bash
kubectl port-forward -n streamia service/user-service 3001:3001
```

Luego accede a: `http://localhost:3001`

**Redirigir puerto del Movie Service (3002):**
```bash
kubectl port-forward -n streamia service/movie-service 3002:3002
```

**Redirigir puerto del API Gateway (3000):**
```bash
kubectl port-forward -n streamia service/api-gateway 3000:3000
```

**Ejemplo: Probar Health Check del User Service**
```bash
# Terminal 1: Crear port-forward
kubectl port-forward -n streamia service/user-service 3001:3001

# Terminal 2: Probar endpoint
curl http://localhost:3001/health/live
# Respuesta esperada: {"status":"live"}

curl http://localhost:3001/health/ready
# Respuesta esperada: {"status":"ready"}
```

### Configuración de Imágenes Docker

⚠️ **Importante:** Las imágenes Docker de los microservicios deben estar publicadas en **DockerHub** antes de desplegar en Kubernetes.

Cada archivo `.yaml` de microservicio especifica la imagen a usar:

```yaml
spec:
  template:
    spec:
      containers:
        - name: user-service
          image: <tu-usuario-dockerhub>/streamia-user-service:latest
```

#### Flujo de Desarrollo Local

Si necesitas desarrollar o hacer cambios al **API Gateway** u otros **microservicios**, sigue estos pasos:

**1. Construir la imagen localmente:**

```bash
# Para API Gateway
cd gateway/express-gateway
docker build -t <tu-usuario-dockerhub>/streamia-api-gateway:latest .

# Para un microservicio (ejemplo: user-service)
cd services/user-service
docker build -t <tu-usuario-dockerhub>/streamia-user-service:latest .

# Para verificar que se construyó correctamente
docker images | grep streamia
```

**2. Probar localmente con Docker:**

```bash
# Ejecutar la imagen localmente
docker run -p 3001:3001 \
  -e MONGODB_URI_USERS="mongodb://streamia:streamia_secret@localhost:27017/streamia_users?authSource=admin" \
  -e RABBITMQ_URL="amqp://streamia:streamia@localhost:5672" \
  <tu-usuario-dockerhub>/streamia-user-service:latest

# En otra terminal, probar
curl http://localhost:3001/health/live
```

#### Flujo de Implementación Final (Producción)

Una vez que hayas validado tus cambios localmente y estén listos para producción:

**1. Publicar la imagen en Docker Hub:**

```bash
# Login en Docker Hub (solo la primera vez)
docker login

# Construir la imagen
cd services/user-service
docker build -t <tu-usuario-dockerhub>/streamia-user-service:v1.0.0 .

# Publicar en Docker Hub
docker push <tu-usuario-dockerhub>/streamia-user-service:v1.0.0
```

**2. Actualizar la referencia de imagen en el archivo YAML:**

Edita `infrastructure/kubernetes/deployments/user-service.yaml`:

```yaml
spec:
  template:
    spec:
      containers:
        - name: user-service
          image: <tu-usuario-dockerhub>/streamia-user-service:v1.0.0  # ← Actualizar versión
```

**3. Redeplegar en Kubernetes:**

```bash
# Aplicar los cambios
kubectl apply -f infrastructure/kubernetes/deployments/user-service.yaml -n streamia

# Verificar que el nuevo pod se está ejecutando
kubectl get pods -n streamia -l service=user-service

# Ver logs del nuevo pod
kubectl logs -f <nuevo-pod-name> -n streamia
```

#### Actualizar el API Gateway

El mismo proceso aplica para el **API Gateway**:

```bash
# Desarrollar y probar localmente
cd gateway/express-gateway
docker build -t <tu-usuario-dockerhub>/streamia-api-gateway:v1.0.0 .
docker run -p 3000:3000 <tu-usuario-dockerhub>/streamia-api-gateway:v1.0.0

# Publicar en Docker Hub
docker push <tu-usuario-dockerhub>/streamia-api-gateway:v1.0.0

# Actualizar infrastructure/kubernetes/deployments/api-gateway.yaml
# Reemplazar imagen: <tu-usuario-dockerhub>/streamia-api-gateway:v1.0.0

# Redeplegar
kubectl apply -f infrastructure/kubernetes/deployments/api-gateway.yaml -n streamia
```

#### Buenas Prácticas

- **Versionado de Imágenes**: Usa versiones semánticas (`v1.0.0`, `v1.0.1`) en lugar de `latest` para producción
- **Tags Múltiples**: Puedes usar tanto `latest` como versiones específicas:
  ```bash
  docker tag <tu-usuario-dockerhub>/streamia-user-service:v1.0.0 <tu-usuario-dockerhub>/streamia-user-service:latest
  docker push <tu-usuario-dockerhub>/streamia-user-service:v1.0.0
  docker push <tu-usuario-dockerhub>/streamia-user-service:latest
  ```
- **Validar Localmente**: Siempre prueba la imagen localmente antes de publicar en Docker Hub
- **CI/CD**: Considera configurar GitHub Actions o similar para automatizar este proceso

### Solución de Problemas

**Pod no inicia:**
```bash
# Ver descripción detallada del pod
kubectl describe pod <pod-name> -n streamia

# Ver logs completos
kubectl logs <pod-name> -n streamia --tail=100
```

**Imagen no encontrada:**
```bash
# Verificar que la imagen esté publicada en Docker Hub
docker pull <tu-usuario-dockerhub>/streamia-user-service:v1.0.0

# Si falla, construir y publicar nuevamente
docker build -t <tu-usuario-dockerhub>/streamia-user-service:v1.0.0 .
docker push <tu-usuario-dockerhub>/streamia-user-service:v1.0.0
```

**Fallan health checks:**
- Verifica que los endpoints `/health/live` y `/health/ready` estén implementados
- Aumenta el timeout inicial con `initialDelaySeconds` en el YAML

**Servicios no se comunican:**
- Verifica que estén en el mismo namespace
- Usa los nombres de servicio como hostname (ej: `mongodb:27017`)
- Verifica las variables de entorno con `kubectl describe pod <pod-name>`

---

## Conclusión

Esta arquitectura de microservicios para Streamia ofrece:

| Beneficio | Descripción |
|-----------|-------------|
| **Escalabilidad** | Cada servicio escala independientemente según demanda |
| **Resiliencia** | Fallos aislados, sin cascadas con Circuit Breaker |
| **Mantenibilidad** | Equipos pueden trabajar en servicios independientes |
| **Flexibilidad** | Fácil agregar nuevas funcionalidades |
| **Observabilidad** | Monitoreo completo con los tres pilares |

### Patrones Implementados

- ✅ **Saga Pattern** - Transacciones distribuidas con compensación
- ✅ **API Gateway** - Punto de entrada único con Express Gateway
- ✅ **Circuit Breaker** - Prevención de fallos en cascada
- ✅ **Database per Service** - Independencia de datos
- ✅ **Choreography** - Comunicación desacoplada vía eventos

### Próximos Pasos

1. Configurar repositorio con estructura de carpetas
2. Implementar User Service como primer microservicio
3. Configurar RabbitMQ y definir eventos
4. Implementar Express Gateway
5. Configurar Docker Compose para desarrollo local
6. Implementar resto de microservicios
7. Configurar Kubernetes para producción
8. Implementar observabilidad