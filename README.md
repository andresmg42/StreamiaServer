# 🎬 Streamia: Arquitectura de Microservicios

## 📋 Índice

1. [Introducción](#introducción)
2. [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
3. [Patrones de Diseño](#patrones-de-diseño)
4. [Microservicios del Sistema](#microservicios-del-sistema)
5. [Comunicación entre Servicios](#comunicación-entre-servicios)
6. [Infraestructura y Herramientas](#infraestructura-y-herramientas)
7. [Testing y Monitoreo](#testing-y-monitoreo)
8. [Despliegue con Kubernetes](#despliegue-con-kubernetes)

---

## Introducción

Este documento describe la arquitectura de microservicios para **Streamia**, una plataforma de streaming de películas. El diseño toma como base el monolito existente y lo descompone en servicios independientes, escalables y mantenibles.

### Monolito Original vs Microservicios

```mermaid
graph LR
    subgraph "🔴 Monolito Actual"
        M[Streamia Server]
        M --> Users
        M --> Movies
        M --> Favorites
        M --> Ratings
        M --> Comments
    end
```

```mermaid
graph TB
    subgraph "🟢 Arquitectura Microservicios"
        GW[API Gateway]
        GW --> US[User Service]
        GW --> MS[Movie Service]
        GW --> FS[Favorites Service]
        GW --> RS[Rating Service]
        GW --> CS[Comment Service]
        GW --> NS[Notification Service]
    end
```

---

## Visión General de la Arquitectura

### Diagrama de Arquitectura Completa

```mermaid
flowchart TB
    subgraph "Cliente"
        WEB[🌐 Web App]
        MOB[📱 Mobile App]
    end

    subgraph "API Gateway Layer"
        EG[🚪 Express Gateway]
    end

    subgraph "Microservices"
        US[👤 User Service<br/>Puerto: 3001]
        MS[🎬 Movie Service<br/>Puerto: 3002]
        FS[⭐ Favorites Service<br/>Puerto: 3003]
        RS[📊 Rating Service<br/>Puerto: 3004]
        CS[💬 Comment Service<br/>Puerto: 3005]
        NS[📧 Notification Service<br/>Puerto: 3006]
    end

    subgraph "Message Broker"
        RMQ[🐰 RabbitMQ]
    end

    subgraph "Data Layer"
        UMDB[(MongoDB<br/>Users)]
        MMDB[(MongoDB<br/>Movies)]
        FMDB[(MongoDB<br/>Favorites)]
        RMDB[(MongoDB<br/>Ratings)]
        CMDB[(MongoDB<br/>Comments)]
        REDIS[(Redis<br/>Cache)]
    end

    subgraph "External Services"
        CLD[☁️ Cloudinary]
        SMTP[📬 SMTP Server]
    end

    WEB --> EG
    MOB --> EG
    
    EG --> US
    EG --> MS
    EG --> FS
    EG --> RS
    EG --> CS

    US --> UMDB
    MS --> MMDB
    FS --> FMDB
    RS --> RMDB
    CS --> CMDB

    US <--> RMQ
    MS <--> RMQ
    FS <--> RMQ
    RS <--> RMQ
    CS <--> RMQ
    NS <--> RMQ

    MS --> CLD
    NS --> SMTP

    US --> REDIS
    MS --> REDIS
```

---

## Patrones de Diseño

### 1. 🔄 Saga Pattern (Requerido)

El patrón Saga maneja transacciones distribuidas que involucran múltiples microservicios, garantizando la consistencia eventual del sistema.

#### Justificación
- Las operaciones en Streamia involucran múltiples servicios (ej: eliminar usuario debe eliminar sus favoritos, ratings y comentarios)
- No podemos usar transacciones ACID tradicionales entre bases de datos separadas
- Necesitamos un mecanismo de compensación ante fallos

#### Saga: Eliminación de Usuario

```mermaid
sequenceDiagram
    participant US as User Service
    participant RMQ as RabbitMQ
    participant FS as Favorites Service
    participant RS as Rating Service
    participant CS as Comment Service
    participant NS as Notification Service

    US->>RMQ: user.deleted {userId}
    
    par Ejecución Paralela
        RMQ->>FS: Eliminar favoritos
        FS-->>RMQ: favorites.deleted ✓
    and
        RMQ->>RS: Eliminar ratings
        RS-->>RMQ: ratings.deleted ✓
    and
        RMQ->>CS: Eliminar comentarios
        CS-->>RMQ: comments.deleted ✓
    end

    RMQ->>NS: Enviar email confirmación
    NS-->>RMQ: notification.sent ✓

    Note over US,NS: Si algún paso falla, se ejecutan compensaciones
```

#### Saga: Eliminación de Película

```mermaid
sequenceDiagram
    participant MS as Movie Service
    participant RMQ as RabbitMQ
    participant FS as Favorites Service
    participant RS as Rating Service
    participant CS as Comment Service
    participant CLD as Cloudinary

    MS->>CLD: Eliminar video/assets
    CLD-->>MS: Assets eliminados ✓
    
    MS->>RMQ: movie.deleted {movieId}
    
    par Limpieza de datos relacionados
        RMQ->>FS: Eliminar de favoritos
        FS-->>RMQ: ✓
    and
        RMQ->>RS: Eliminar ratings
        RS-->>RMQ: ✓
    and
        RMQ->>CS: Eliminar comentarios
        CS-->>RMQ: ✓
    end

    Note over MS,CS: Compensación: restaurar película si falla
```

### 2. 🚪 API Gateway Pattern

Express Gateway actúa como punto de entrada único para todos los clientes.

#### Justificación
- Centraliza autenticación y autorización
- Simplifica la experiencia del cliente (una sola URL)
- Permite rate limiting, logging y transformación de requests
- Facilita el versionado de APIs

```mermaid
flowchart LR
    subgraph "Clientes"
        C1[Web]
        C2[Mobile]
        C3[Third Party]
    end

    subgraph "Express Gateway"
        AUTH[🔐 Auth Plugin]
        RL[⏱️ Rate Limiter]
        LOG[📝 Logger]
        PROXY[🔀 Proxy]
    end

    subgraph "Servicios"
        S1[User Service]
        S2[Movie Service]
        S3[Otros...]
    end

    C1 --> AUTH
    C2 --> AUTH
    C3 --> AUTH
    AUTH --> RL
    RL --> LOG
    LOG --> PROXY
    PROXY --> S1
    PROXY --> S2
    PROXY --> S3
```

### 3. ⚡ Circuit Breaker Pattern

Previene fallos en cascada cuando un servicio no responde.

#### Justificación
- Evita que un servicio caído afecte a todo el sistema
- Permite recuperación gradual
- Mejora la experiencia del usuario con respuestas rápidas de error

```mermaid
stateDiagram-v2
    [*] --> Closed: Inicio
    Closed --> Open: Umbral de fallos alcanzado
    Open --> HalfOpen: Tiempo de espera cumplido
    HalfOpen --> Closed: Request exitoso
    HalfOpen --> Open: Request fallido

    note right of Closed: Requests pasan normalmente
    note right of Open: Requests rechazados inmediatamente
    note right of HalfOpen: Se permite un request de prueba
```

### 4. 📊 Database per Service Pattern

Cada microservicio tiene su propia base de datos.

#### Justificación
- Independencia total entre servicios
- Cada servicio puede elegir el tipo de BD más adecuado
- Facilita el escalado independiente
- Evita acoplamiento a nivel de datos

```mermaid
flowchart TB
    subgraph "❌ Anti-patrón: BD Compartida"
        S1[Service 1] --> DB[(MongoDB)]
        S2[Service 2] --> DB
        S3[Service 3] --> DB
    end
```

```mermaid
flowchart TB
    subgraph "✅ Patrón Correcto: BD por Servicio"
        US[User Service] --> UDB[(Users DB)]
        MS[Movie Service] --> MDB[(Movies DB)]
        FS[Favorites Service] --> FDB[(Favorites DB)]
    end
```

---

## Microservicios del Sistema

### Diagrama de Responsabilidades

```mermaid
mindmap
  root((Streamia<br/>Microservices))
    User Service
      Registro
      Login/Logout
      Perfil
      Reset Password
      JWT Tokens
    Movie Service
      CRUD Películas
      Upload Video
      Subtítulos
      Cloudinary
      Caché
    Favorites Service
      Agregar/Quitar
      Listar favoritos
      Notas personales
    Rating Service
      Calificar película
      Promedio ratings
      Historial usuario
    Comment Service
      CRUD Comentarios
      Moderación
      Paginación
    Notification Service
      Emails
      Welcome
      Password Reset
      Alertas
```

### Tabla de Microservicios

| Servicio | Puerto | Base de Datos | Responsabilidad Principal |
|----------|--------|---------------|---------------------------|
| **User Service** | 3001 | MongoDB (users) | Autenticación, gestión de usuarios, JWT |
| **Movie Service** | 3002 | MongoDB (movies) | Catálogo de películas, Cloudinary |
| **Favorites Service** | 3003 | MongoDB (favorites) | Lista de favoritos por usuario |
| **Rating Service** | 3004 | MongoDB (ratings) | Sistema de calificaciones |
| **Comment Service** | 3005 | MongoDB (comments) | Comentarios en películas |
| **Notification Service** | 3006 | - | Envío de emails y notificaciones |

### Detalle de Cada Servicio

#### 👤 User Service

```mermaid
flowchart TB
    subgraph "User Service"
        direction TB
        API[REST API]
        AUTH[Auth Module]
        PROFILE[Profile Module]
        
        API --> AUTH
        API --> PROFILE
    end

    subgraph "Endpoints"
        E1[POST /register]
        E2[POST /login]
        E3[GET /profile]
        E4[PUT /profile]
        E5[POST /forgot-password]
        E6[POST /reset-password]
    end

    subgraph "Eventos RabbitMQ"
        EV1[user.registered]
        EV2[user.deleted]
        EV3[user.updated]
    end

    API --> E1 & E2 & E3 & E4 & E5 & E6
    AUTH --> EV1 & EV2
    PROFILE --> EV3
```

#### 🎬 Movie Service

```mermaid
flowchart TB
    subgraph "Movie Service"
        direction TB
        API[REST API]
        UPLOAD[Upload Module]
        CATALOG[Catalog Module]
        SUBS[Subtitles Module]
        CACHE[Cache Layer]
    end

    subgraph "Endpoints"
        E1[GET /movies]
        E2[GET /movies/:id]
        E3[POST /movies]
        E4[PUT /movies/:id]
        E5[DELETE /movies/:id]
        E6[POST /movies/:id/subtitles]
    end

    subgraph "Integraciones"
        CLD[☁️ Cloudinary]
        REDIS[(Redis Cache)]
    end

    API --> E1 & E2 & E3 & E4 & E5 & E6
    UPLOAD --> CLD
    CATALOG --> CACHE
    CACHE --> REDIS
```

---

## Comunicación entre Servicios

### Choreography vs Orchestration

Este sistema utiliza **Choreography** (Coreografía) para la comunicación entre servicios.

#### ¿Por qué Choreography?

```mermaid
flowchart TB
    subgraph "❌ Orchestration"
        O[Orquestador Central]
        O --> S1[Service 1]
        O --> S2[Service 2]
        O --> S3[Service 3]
        
        style O fill:#ff6b6b
    end
```

```mermaid
flowchart TB
    subgraph "✅ Choreography"
        S1[Service 1] --> MB[Message Broker]
        MB --> S2[Service 2]
        MB --> S3[Service 3]
        S2 --> MB
        S3 --> MB
        
        style MB fill:#51cf66
    end
```

#### Justificación de Choreography

| Aspecto | Ventaja |
|---------|---------|
| **Desacoplamiento** | Los servicios no conocen a los demás, solo publican/consumen eventos |
| **Escalabilidad** | No hay punto central de fallo o cuello de botella |
| **Autonomía** | Cada servicio decide cómo reaccionar a los eventos |
| **Flexibilidad** | Fácil agregar nuevos consumidores sin modificar productores |
| **Resiliencia** | Si un servicio cae, los mensajes esperan en la cola |

#### Trade-offs

| Desventaja | Mitigación |
|------------|------------|
| Difícil rastrear flujos | Distributed tracing con Jaeger |
| Debugging complejo | Logging centralizado con ELK |
| Consistencia eventual | Diseño idempotente de handlers |

### Flujo de Eventos con RabbitMQ

```mermaid
flowchart LR
    subgraph "Productores"
        US[User Service]
        MS[Movie Service]
    end

    subgraph "RabbitMQ"
        EX1[user.events<br/>Exchange]
        EX2[movie.events<br/>Exchange]
        
        Q1[favorites.user.queue]
        Q2[ratings.user.queue]
        Q3[comments.user.queue]
        Q4[notifications.queue]
        Q5[favorites.movie.queue]
        Q6[ratings.movie.queue]
        Q7[comments.movie.queue]
    end

    subgraph "Consumidores"
        FS[Favorites Service]
        RS[Rating Service]
        CS[Comment Service]
        NS[Notification Service]
    end

    US --> EX1
    MS --> EX2
    
    EX1 --> Q1 & Q2 & Q3 & Q4
    EX2 --> Q5 & Q6 & Q7
    
    Q1 --> FS
    Q2 --> RS
    Q3 --> CS
    Q4 --> NS
    Q5 --> FS
    Q6 --> RS
    Q7 --> CS
```

### Tipos de Comunicación

```mermaid
flowchart TB
    subgraph "Comunicación Síncrona"
        direction LR
        C[Cliente] -->|REST/HTTP| GW[API Gateway]
        GW -->|REST/HTTP| SVC[Microservicio]
    end

    subgraph "Comunicación Asíncrona"
        direction LR
        P[Productor] -->|Publish| RMQ[RabbitMQ]
        RMQ -->|Subscribe| CON[Consumidor]
    end
```

| Tipo | Uso | Ejemplo |
|------|-----|---------|
| **Síncrono (REST)** | Operaciones que requieren respuesta inmediata | GET /movies, POST /login |
| **Asíncrono (RabbitMQ)** | Eventos, notificaciones, operaciones en background | user.deleted, movie.uploaded |

---

## Infraestructura y Herramientas

### Stack Tecnológico

```mermaid
flowchart TB
    subgraph "Desarrollo"
        TS[TypeScript]
        NODE[Node.js]
        EXP[Express.js]
    end

    subgraph "Mensajería"
        RMQ[RabbitMQ]
    end

    subgraph "Base de Datos"
        MONGO[MongoDB]
        REDIS[Redis]
    end

    subgraph "API Gateway"
        EG[Express Gateway]
    end

    subgraph "Contenedores"
        DOCKER[Docker]
        K8S[Kubernetes]
    end

    subgraph "Observabilidad"
        PROM[Prometheus]
        GRAF[Grafana]
        JAEGER[Jaeger]
        ELK[ELK Stack]
    end

    subgraph "Externos"
        CLD[Cloudinary]
        SMTP[SMTP]
    end
```

### Tabla de Herramientas

| Categoría | Herramienta | Propósito |
|-----------|-------------|-----------|
| **Backend** | Node.js + TypeScript + Express | Framework base para microservicios |
| **Message Broker** | RabbitMQ | Comunicación asíncrona entre servicios |
| **Base de Datos** | MongoDB | Almacenamiento principal de cada servicio |
| **Caché** | Redis | Caché distribuido, sesiones |
| **API Gateway** | Express Gateway | Punto de entrada, auth, rate limiting |
| **Contenedores** | Docker | Empaquetado de servicios |
| **Orquestación** | Kubernetes | Despliegue, escalado, self-healing |
| **Métricas** | Prometheus + Grafana | Monitoreo y dashboards |
| **Tracing** | Jaeger | Distributed tracing |
| **Logging** | ELK Stack | Logs centralizados |
| **Media** | Cloudinary | Almacenamiento de videos y assets |

---

## Testing y Monitoreo

### Estrategia de Testing

```mermaid
flowchart TB
    subgraph "Piramide de Testing"
        direction TB
        E2E["E2E Tests - 10%"]
        INT["Integration Tests - 30%"]
        UNIT["Unit Tests - 60%"]
        
        E2E --- INT
        INT --- UNIT
    end

    E2E --> |"Cypress/Playwright"| FULL[Flujos completos]
    INT --> |"Supertest + TestContainers"| API[APIs + BD]
    UNIT --> |"Jest/Vitest"| FUNC[Funciones aisladas]
    
    style E2E fill:#ff6b6b,color:#fff
    style INT fill:#feca57,color:#000
    style UNIT fill:#1dd1a1,color:#fff
```

#### Tipos de Tests por Servicio

| Tipo | Herramienta | Qué Testea | Ejemplo |
|------|-------------|------------|---------|
| **Unit** | Jest/Vitest | Funciones, validadores, helpers | Validar email format |
| **Integration** | Supertest + TestContainers | APIs + Base de datos | POST /register guarda en BD |
| **Contract** | Pact | Contratos entre servicios | User Service → Notification Service |
| **E2E** | Playwright | Flujos completos del sistema | Registro → Login → Agregar favorito |

### Observabilidad

#### Los Tres Pilares

```mermaid
flowchart TB
    subgraph "Observabilidad"
        LOG[📝 Logging]
        MET[📊 Metrics]
        TRA[🔍 Tracing]
    end

    subgraph "Herramientas"
        ELK[ELK Stack]
        PROM[Prometheus]
        JAEGER[Jaeger]
    end

    subgraph "Visualización"
        KIB[Kibana]
        GRAF[Grafana]
        JAEGER_UI[Jaeger UI]
    end

    LOG --> ELK --> KIB
    MET --> PROM --> GRAF
    TRA --> JAEGER --> JAEGER_UI
```

#### Flujo de Logs Centralizado

```mermaid
flowchart LR
    subgraph "Microservicios"
        US[User Service]
        MS[Movie Service]
        FS[Favorites Service]
    end

    subgraph "ELK Stack"
        FB[Filebeat]
        LS[Logstash]
        ES[(Elasticsearch)]
        KIB[Kibana]
    end

    US --> FB
    MS --> FB
    FS --> FB
    FB --> LS --> ES --> KIB
```

#### Métricas Clave

```mermaid
flowchart TB
    subgraph "Métricas por Servicio"
        REQ[Request Rate<br/>req/sec]
        LAT[Latency<br/>p50, p95, p99]
        ERR[Error Rate<br/>%]
        SAT[Saturation<br/>CPU, Memory]
    end

    subgraph "Métricas de Negocio"
        USERS[Usuarios registrados]
        MOVIES[Películas subidas]
        RATINGS[Ratings promedio]
    end
```

#### Distributed Tracing

```mermaid
sequenceDiagram
    participant C as Cliente
    participant GW as Gateway
    participant US as User Service
    participant FS as Favorites Service
    participant DB as MongoDB

    Note over C,DB: Trace ID: abc-123

    C->>GW: GET /favorites
    Note right of GW: Span 1
    GW->>US: Validate JWT
    Note right of US: Span 2
    US-->>GW: User valid
    GW->>FS: GET favorites
    Note right of FS: Span 3
    FS->>DB: Query
    Note right of DB: Span 4
    DB-->>FS: Results
    FS-->>GW: Favorites list
    GW-->>C: Response

    Note over C,DB: Jaeger muestra el trace completo
```

---

## Despliegue con Kubernetes

### Arquitectura de Despliegue

```mermaid
flowchart TB
    subgraph "Kubernetes Cluster"
        subgraph "Ingress"
            ING[Nginx Ingress]
        end

        subgraph "Services Namespace"
            subgraph "User Service Pod"
                US1[Container 1]
                US2[Container 2]
            end
            subgraph "Movie Service Pod"
                MS1[Container 1]
                MS2[Container 2]
            end
            subgraph "Otros Pods"
                OTHER[...]
            end
        end

        subgraph "Infrastructure Namespace"
            RMQ[RabbitMQ StatefulSet]
            REDIS[Redis StatefulSet]
            MONGO[MongoDB StatefulSet]
        end

        subgraph "Monitoring Namespace"
            PROM[Prometheus]
            GRAF[Grafana]
            JAEGER[Jaeger]
        end
    end

    INTERNET[🌐 Internet] --> ING
    ING --> US1 & US2 & MS1 & MS2
```

### Componentes de Kubernetes

```mermaid
flowchart LR
    subgraph "Por cada Microservicio"
        DEP[Deployment]
        SVC[Service]
        HPA[HorizontalPodAutoscaler]
        CM[ConfigMap]
        SEC[Secret]
    end

    DEP --> |"Gestiona"| POD[Pods]
    SVC --> |"Expone"| POD
    HPA --> |"Escala"| DEP
    CM --> |"Config"| POD
    SEC --> |"Secrets"| POD
```

### Estrategia de Escalado

```mermaid
flowchart TB
    subgraph "Auto Scaling"
        HPA[HPA - Horizontal Pod Autoscaler]
        
        HPA --> |"CPU > 70%"| SCALE_UP[Scale Up]
        HPA --> |"CPU < 30%"| SCALE_DOWN[Scale Down]
        
        SCALE_UP --> |"Max: 10 pods"| PODS1[Más réplicas]
        SCALE_DOWN --> |"Min: 2 pods"| PODS2[Menos réplicas]
    end
```

### Health Checks

```mermaid
flowchart LR
    subgraph "Health Probes"
        LP[Liveness Probe<br/>/health/live]
        RP[Readiness Probe<br/>/health/ready]
    end

    K8S[Kubernetes] --> LP
    K8S --> RP

    LP --> |"Falla"| RESTART[Reinicia Pod]
    RP --> |"Falla"| REMOVE[Quita del Service]
```

---

## Estructura de Carpetas del Proyecto

```
streamia-microservices/
├── services/
│   ├── user-service/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── movie-service/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── favorites-service/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── rating-service/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── comment-service/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── notification-service/
│       ├── src/
│       ├── Dockerfile
│       └── package.json
├── gateway/
│   └── express-gateway/
│       ├── config/
│       │   ├── gateway.config.yml
│       │   └── system.config.yml
│       └── Dockerfile
├── infrastructure/
│   ├── docker-compose.yml
│   └── kubernetes/
│       ├── namespaces/
│       ├── services/
│       ├── deployments/
│       ├── configmaps/
│       └── secrets/
├── shared/
│   ├── events/
│   └── types/
└── docs/
    └── arquitectura-microservicios.md
```

---

## Resumen Visual

```mermaid
flowchart TB
    subgraph "🎯 Streamia Microservices"
        direction TB
        
        subgraph "Entrada"
            CLIENT[Clientes] --> GW[Express Gateway]
        end

        subgraph "Servicios"
            GW --> US[👤 Users]
            GW --> MS[🎬 Movies]
            GW --> FS[⭐ Favorites]
            GW --> RS[📊 Ratings]
            GW --> CS[💬 Comments]
        end

        subgraph "Eventos"
            US & MS & FS & RS & CS <--> RMQ[🐰 RabbitMQ]
            RMQ --> NS[📧 Notifications]
        end

        subgraph "Datos"
            US --> DB1[(MongoDB)]
            MS --> DB2[(MongoDB)]
            FS --> DB3[(MongoDB)]
            RS --> DB4[(MongoDB)]
            CS --> DB5[(MongoDB)]
            GW --> REDIS[(Redis)]
        end

        subgraph "Observabilidad"
            ALL[Todos los servicios] --> PROM[Prometheus]
            ALL --> ELK[ELK]
            ALL --> JAEGER[Jaeger]
        end
    end

    K8S[☸️ Kubernetes] --> |"Orquesta"| ALL
```

---


