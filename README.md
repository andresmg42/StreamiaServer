# 🎬 Streamia - Arquitectura de Microservicios

## Índice
1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Microservicios Identificados](#microservicios-identificados)
4. [Patrones de Diseño](#patrones-de-diseño)
5. [Comunicación entre Servicios](#comunicación-entre-servicios)
6. [Stack Tecnológico](#stack-tecnológico)
7. [Infraestructura y Orquestación](#infraestructura-y-orquestación)
8. [Testing y Observabilidad](#testing-y-observabilidad)
9. [Flujos de Datos](#flujos-de-datos)
10. [Plan de Implementación](#plan-de-implementación)

---

## Visión General

Streamia es una plataforma de streaming de películas que actualmente opera como un monolito en Node.js/Express. Este documento describe la arquitectura propuesta para transformar el sistema en una arquitectura basada en microservicios, diseñada desde cero tomando como referencia las funcionalidades del monolito existente.

### Diagrama de Contexto del Sistema

```mermaid
C4Context
    title Diagrama de Contexto - Streamia Platform

    Person(user, "Usuario", "Usuario de la plataforma de streaming")
    Person(admin, "Administrador", "Gestiona contenido y usuarios")

    System(streamia, "Streamia Platform", "Plataforma de streaming de películas basada en microservicios")

    System_Ext(cloudinary, "Cloudinary", "CDN para almacenamiento de videos y subtítulos")
    System_Ext(sendgrid, "SendGrid", "Servicio de envío de emails")
    System_Ext(mongodb, "MongoDB Atlas", "Base de datos en la nube")

    Rel(user, streamia, "Usa", "HTTPS")
    Rel(admin, streamia, "Administra", "HTTPS")
    Rel(streamia, cloudinary, "Almacena/Recupera media", "HTTPS")
    Rel(streamia, sendgrid, "Envía emails", "SMTP/API")
    Rel(streamia, mongodb, "Persiste datos", "TCP")
```

---

## Arquitectura del Sistema

### Diagrama de Arquitectura General

```mermaid
flowchart TB
    subgraph Cliente
        WEB[🌐 Web App]
        MOBILE[📱 Mobile App]
    end

    subgraph Gateway["🚪 API Gateway Layer"]
        EG[Express Gateway]
        AUTH_GW[Auth Middleware]
        RL[Rate Limiter]
    end

    subgraph Services["🔧 Microservices Layer"]
        US[👤 User Service]
        MS[🎬 Movie Service]
        FS[⭐ Favorites Service]
        RS[📊 Ratings Service]
        CS[💬 Comments Service]
        NS[📧 Notification Service]
    end

    subgraph MessageBroker["📨 Message Broker"]
        RMQ[(RabbitMQ)]
    end

    subgraph DataLayer["💾 Data Layer"]
        MONGO_US[(MongoDB Users)]
        MONGO_MS[(MongoDB Movies)]
        MONGO_FS[(MongoDB Favorites)]
        MONGO_RS[(MongoDB Ratings)]
        MONGO_CS[(MongoDB Comments)]
        REDIS[(Redis Cache)]
    end

    subgraph External["☁️ External Services"]
        CLOUD[Cloudinary CDN]
        SG[SendGrid]
    end

    WEB & MOBILE --> EG
    EG --> AUTH_GW --> RL
    
    RL --> US & MS & FS & RS & CS
    
    US & MS & FS & RS & CS <--> RMQ
    NS <--> RMQ
    
    US --> MONGO_US
    MS --> MONGO_MS & CLOUD
    FS --> MONGO_FS
    RS --> MONGO_RS
    CS --> MONGO_CS
    NS --> SG
    
    US & MS --> REDIS
```

### Diagrama de Contenedores (C4)

```mermaid
flowchart TB
    subgraph K8S["☸️ Kubernetes Cluster"]
        subgraph Ingress["Ingress Controller"]
            NGINX[NGINX Ingress]
        end
        
        subgraph GatewayPod["Gateway Pod"]
            EXG[Express Gateway Container]
        end
        
        subgraph UserPod["User Service Pod"]
            USR[User Service Container]
            USR_DB[(MongoDB Sidecar)]
        end
        
        subgraph MoviePod["Movie Service Pod"]
            MOV[Movie Service Container]
        end
        
        subgraph FavPod["Favorites Service Pod"]
            FAV[Favorites Service Container]
        end
        
        subgraph RatPod["Ratings Service Pod"]
            RAT[Ratings Service Container]
        end
        
        subgraph ComPod["Comments Service Pod"]
            COM[Comments Service Container]
        end
        
        subgraph NotifPod["Notification Service Pod"]
            NOT[Notification Worker Container]
        end
        
        subgraph MQPod["Message Queue Pod"]
            RMQ[RabbitMQ Container]
        end
        
        subgraph CachePod["Cache Pod"]
            RDS[Redis Container]
        end
    end

    NGINX --> EXG
    EXG --> USR & MOV & FAV & RAT & COM
    USR & MOV & FAV & RAT & COM --> RMQ
    NOT --> RMQ
    USR & MOV --> RDS
```

---

## Microservicios Identificados

Basándonos en el análisis del monolito actual, se identifican **6 microservicios** principales:

```mermaid
mindmap
  root((Streamia Microservices))
    User Service
      Registro
      Autenticación
      Perfil
      Reset Password
    Movie Service
      CRUD Películas
      Gestión Subtítulos
      Integración Cloudinary
      Búsqueda y Filtros
    Favorites Service
      Agregar Favoritos
      Eliminar Favoritos
      Listar Favoritos
    Ratings Service
      Crear Rating
      Actualizar Rating
      Obtener Ratings
      Promedios
    Comments Service
      CRUD Comentarios
      Moderación
    Notification Service
      Emails Bienvenida
      Reset Password
      Notificaciones
```

### Tabla de Responsabilidades

| Microservicio | Responsabilidad Principal | Base de Datos | Eventos Publicados | Eventos Consumidos |
|---------------|--------------------------|---------------|--------------------|--------------------|
| **User Service** | Gestión de usuarios y autenticación | MongoDB (users) | `user.registered`, `user.deleted`, `password.reset.requested` | - |
| **Movie Service** | Catálogo de películas y media | MongoDB (movies) | `movie.created`, `movie.deleted`, `movie.updated` | `user.deleted` |
| **Favorites Service** | Películas favoritas por usuario | MongoDB (favorites) | `favorite.added`, `favorite.removed` | `user.deleted`, `movie.deleted` |
| **Ratings Service** | Sistema de calificaciones | MongoDB (ratings) | `rating.created`, `rating.updated` | `user.deleted`, `movie.deleted` |
| **Comments Service** | Comentarios en películas | MongoDB (comments) | `comment.created`, `comment.deleted` | `user.deleted`, `movie.deleted` |
| **Notification Service** | Envío de emails y notificaciones | Redis (jobs queue) | - | `user.registered`, `password.reset.requested` |

---

## Patrones de Diseño

### 1. Saga Pattern (Requerido) ✅

El patrón Saga se utiliza para manejar transacciones distribuidas que involucran múltiples microservicios. En Streamia, el escenario principal es la **eliminación de un usuario**, que debe propagar cambios a través de múltiples servicios.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Gateway as API Gateway
    participant US as User Service
    participant RMQ as RabbitMQ
    participant FS as Favorites Service
    participant RS as Ratings Service
    participant CS as Comments Service

    Client->>Gateway: DELETE /api/users/me
    Gateway->>US: Forward Request
    US->>US: Validar Token JWT
    US->>US: Eliminar Usuario
    US->>RMQ: Publish: user.deleted {userId}
    US-->>Gateway: 200 OK
    Gateway-->>Client: Usuario eliminado

    par Saga: Cleanup paralelo
        RMQ->>FS: Consume: user.deleted
        FS->>FS: Eliminar favoritos del usuario
        FS->>RMQ: Ack
    and
        RMQ->>RS: Consume: user.deleted
        RS->>RS: Eliminar ratings del usuario
        RS->>RMQ: Ack
    and
        RMQ->>CS: Consume: user.deleted
        CS->>CS: Eliminar comentarios del usuario
        CS->>RMQ: Ack
    end
```

#### Saga: Eliminación de Película

```mermaid
sequenceDiagram
    autonumber
    participant Admin
    participant Gateway as API Gateway
    participant MS as Movie Service
    participant RMQ as RabbitMQ
    participant FS as Favorites Service
    participant RS as Ratings Service
    participant CS as Comments Service
    participant Cloud as Cloudinary

    Admin->>Gateway: DELETE /api/movies/:id
    Gateway->>MS: Forward Request
    MS->>Cloud: Eliminar video y subtítulos
    Cloud-->>MS: OK
    MS->>MS: Eliminar registro en DB
    MS->>RMQ: Publish: movie.deleted {movieId}
    MS-->>Gateway: 200 OK
    Gateway-->>Admin: Película eliminada

    par Saga: Cleanup de referencias
        RMQ->>FS: Consume: movie.deleted
        FS->>FS: Eliminar de favoritos
    and
        RMQ->>RS: Consume: movie.deleted
        RS->>RS: Eliminar ratings
    and
        RMQ->>CS: Consume: movie.deleted
        CS->>CS: Eliminar comentarios
    end
```

### 2. API Gateway Pattern ✅

Express Gateway actúa como punto de entrada único para todas las solicitudes del cliente.

```mermaid
flowchart LR
    subgraph Clients
        C1[Web App]
        C2[Mobile App]
        C3[Third Party]
    end

    subgraph Gateway["Express Gateway"]
        direction TB
        AUTH[🔐 Authentication]
        RATE[⏱️ Rate Limiting]
        ROUTE[🔀 Routing]
        LOG[📝 Logging]
        CORS[🌐 CORS]
    end

    subgraph Services
        S1[User Service :3001]
        S2[Movie Service :3002]
        S3[Favorites Service :3003]
        S4[Ratings Service :3004]
        S5[Comments Service :3005]
    end

    C1 & C2 & C3 --> Gateway
    Gateway --> S1 & S2 & S3 & S4 & S5
```

**Responsabilidades del API Gateway:**
- **Autenticación centralizada**: Validación de JWT tokens
- **Rate Limiting**: Protección contra abuso (heredado del monolito)
- **Routing**: Enrutamiento inteligente hacia microservicios
- **CORS**: Gestión de políticas cross-origin
- **Logging**: Registro centralizado de requests

### 3. Circuit Breaker Pattern ✅

Protege el sistema de fallos en cascada cuando un servicio no responde.

```mermaid
stateDiagram-v2
    [*] --> Closed: Estado inicial
    
    Closed --> Open: Umbral de fallos alcanzado
    Closed --> Closed: Request exitoso
    
    Open --> HalfOpen: Timeout expira
    Open --> Open: Rechaza requests
    
    HalfOpen --> Closed: Request de prueba exitoso
    HalfOpen --> Open: Request de prueba falla

    note right of Closed
        Requests fluyen normalmente
        Contador de fallos activo
    end note

    note right of Open
        Requests rechazados inmediatamente
        Respuesta fallback
    end note

    note right of HalfOpen
        Permite un request de prueba
        Evalúa estado del servicio
    end note
```

**Implementación con `opossum` (Node.js):**
- Timeout: 3 segundos
- Umbral de error: 50%
- Reset timeout: 30 segundos

### 4. Database per Service Pattern ✅

Cada microservicio tiene su propia base de datos, garantizando el desacoplamiento y la autonomía.

```mermaid
flowchart TB
    subgraph UserService["User Service"]
        US[Service Logic]
        US_DB[(MongoDB<br/>users collection)]
    end

    subgraph MovieService["Movie Service"]
        MS[Service Logic]
        MS_DB[(MongoDB<br/>movies collection)]
    end

    subgraph FavoritesService["Favorites Service"]
        FS[Service Logic]
        FS_DB[(MongoDB<br/>favorites collection)]
    end

    subgraph RatingsService["Ratings Service"]
        RS[Service Logic]
        RS_DB[(MongoDB<br/>ratings collection)]
    end

    subgraph CommentsService["Comments Service"]
        CS[Service Logic]
        CS_DB[(MongoDB<br/>comments collection)]
    end

    US --> US_DB
    MS --> MS_DB
    FS --> FS_DB
    RS --> RS_DB
    CS --> CS_DB

    style US_DB fill:#4db33d
    style MS_DB fill:#4db33d
    style FS_DB fill:#4db33d
    style RS_DB fill:#4db33d
    style CS_DB fill:#4db33d
```

---

## Comunicación entre Servicios

### Coreografía vs Orquestación

**Decisión: Enfoque basado en Coreografía** ✅

```mermaid
flowchart TB
    subgraph Choreography["🎭 Coreografía (Elegido)"]
        direction LR
        S1[Service A] -->|Publica evento| MQ1[(Message Queue)]
        MQ1 -->|Consume| S2[Service B]
        MQ1 -->|Consume| S3[Service C]
    end

    subgraph Orchestration["🎼 Orquestación (Descartado)"]
        direction LR
        O[Orchestrator] -->|Llama| S4[Service A]
        O -->|Llama| S5[Service B]
        O -->|Llama| S6[Service C]
    end
```

#### Justificación de la Coreografía

| Aspecto | Coreografía ✅ | Orquestación ❌ |
|---------|---------------|-----------------|
| **Acoplamiento** | Bajo - servicios independientes | Alto - dependencia del orquestador |
| **Punto único de fallo** | No existe | El orquestador es crítico |
| **Escalabilidad** | Alta - cada servicio escala independiente | Media - orquestador puede ser cuello de botella |
| **Complejidad** | Distribuida (en cada servicio) | Centralizada (en orquestador) |
| **Debugging** | Más difícil (trazas distribuidas) | Más fácil (flujo centralizado) |
| **Flexibilidad** | Alta - agregar servicios es simple | Media - requiere modificar orquestador |

**Ventajas para Streamia:**
1. **Desacoplamiento natural**: Los servicios de favoritos, ratings y comentarios no necesitan conocerse entre sí
2. **Resiliencia**: Si un servicio falla, los demás continúan funcionando
3. **Escalabilidad**: Cada servicio puede escalarse según su demanda

**Trade-offs aceptados:**
1. **Trazabilidad**: Se mitigará con distributed tracing (Jaeger)
2. **Consistencia eventual**: Aceptable para el dominio de streaming
3. **Debugging**: Se implementará logging estructurado

### Tipos de Comunicación

```mermaid
flowchart TB
    subgraph Sync["🔄 Comunicación Síncrona (REST)"]
        direction LR
        GW[Gateway] -->|HTTP/REST| US1[User Service]
        GW -->|HTTP/REST| MS1[Movie Service]
    end

    subgraph Async["⚡ Comunicación Asíncrona (RabbitMQ)"]
        direction LR
        US2[User Service] -->|Publish| EX1{Exchange}
        EX1 -->|Route| Q1[favorites.queue]
        EX1 -->|Route| Q2[ratings.queue]
        EX1 -->|Route| Q3[comments.queue]
        Q1 --> FS1[Favorites Service]
        Q2 --> RS1[Ratings Service]
        Q3 --> CS1[Comments Service]
    end
```

### Estructura de Eventos en RabbitMQ

```mermaid
flowchart TB
    subgraph RabbitMQ["RabbitMQ Broker"]
        subgraph Exchanges
            UE[user.events<br/>Topic Exchange]
            ME[movie.events<br/>Topic Exchange]
        end
        
        subgraph Queues
            Q1[favorites.user.deleted]
            Q2[ratings.user.deleted]
            Q3[comments.user.deleted]
            Q4[favorites.movie.deleted]
            Q5[ratings.movie.deleted]
            Q6[comments.movie.deleted]
            Q7[notifications.user.registered]
        end
    end

    UE -->|user.deleted| Q1 & Q2 & Q3
    UE -->|user.registered| Q7
    ME -->|movie.deleted| Q4 & Q5 & Q6
```

---

## Stack Tecnológico

### Diagrama de Tecnologías

```mermaid
flowchart TB
    subgraph Backend["🔧 Backend Services"]
        NODE[Node.js 20 LTS]
        EXPRESS[Express.js]
        TS[TypeScript]
    end

    subgraph Gateway["🚪 API Gateway"]
        EG[Express Gateway]
    end

    subgraph MessageBroker["📨 Mensajería"]
        RMQ[RabbitMQ 3.12]
        AMQP[amqplib]
    end

    subgraph Database["💾 Base de Datos"]
        MONGO[MongoDB 7.0]
        MONGOOSE[Mongoose ODM]
        REDIS[Redis 7.2]
    end

    subgraph Container["📦 Contenedores"]
        DOCKER[Docker]
        K8S[Kubernetes]
        HELM[Helm Charts]
    end

    subgraph Observability["📊 Observabilidad"]
        PROM[Prometheus]
        GRAF[Grafana]
        JAEGER[Jaeger]
        ELK[ELK Stack]
    end

    subgraph External["☁️ Servicios Externos"]
        CLOUD[Cloudinary]
        SG[SendGrid]
    end

    subgraph Testing["🧪 Testing"]
        JEST[Jest]
        SUPER[Supertest]
        K6[k6]
    end

    subgraph CI_CD["🔄 CI/CD"]
        GHA[GitHub Actions]
        ARGOCD[ArgoCD]
    end
```

### Tabla de Herramientas

| Categoría | Herramienta | Justificación |
|-----------|-------------|---------------|
| **Runtime** | Node.js 20 LTS | Continuidad con monolito, ecosistema maduro |
| **Framework** | Express.js | Ligero, conocido por el equipo |
| **Lenguaje** | TypeScript | Type safety, mejor DX |
| **API Gateway** | Express Gateway | Fácil integración con Express, plugins |
| **Message Broker** | RabbitMQ | Robusto, soporte para múltiples patrones |
| **Base de Datos** | MongoDB | Continuidad, flexibilidad de esquema |
| **Cache** | Redis | Sesiones, cache, rate limiting |
| **Contenedores** | Docker | Estándar de la industria |
| **Orquestación** | Kubernetes | Escalabilidad, self-healing |
| **Service Mesh** | Istio (opcional) | Observabilidad avanzada, mTLS |
| **Tracing** | Jaeger | Distributed tracing, integración con K8s |
| **Logging** | ELK Stack | Búsqueda y análisis de logs |
| **Metrics** | Prometheus + Grafana | Alertas, dashboards |
| **CI/CD** | GitHub Actions + ArgoCD | GitOps, despliegue continuo |

---

## Infraestructura y Orquestación

### Arquitectura en Kubernetes

```mermaid
flowchart TB
    subgraph Internet
        USER[👤 Usuarios]
    end

    subgraph CloudProvider["☁️ Cloud Provider (GCP/AWS/Azure)"]
        LB[Load Balancer]
        
        subgraph K8SCluster["☸️ Kubernetes Cluster"]
            subgraph IngressNS["Namespace: ingress-nginx"]
                ING[NGINX Ingress Controller]
            end
            
            subgraph GatewayNS["Namespace: gateway"]
                GW_DEPLOY[Express Gateway<br/>Deployment<br/>replicas: 2]
                GW_SVC[Gateway Service<br/>ClusterIP]
                GW_HPA[HPA: 2-10 pods]
            end
            
            subgraph ServicesNS["Namespace: streamia-services"]
                US_D[User Service<br/>Deployment]
                MS_D[Movie Service<br/>Deployment]
                FS_D[Favorites Service<br/>Deployment]
                RS_D[Ratings Service<br/>Deployment]
                CS_D[Comments Service<br/>Deployment]
                NS_D[Notification Service<br/>Deployment]
            end
            
            subgraph DataNS["Namespace: streamia-data"]
                RMQ_SS[RabbitMQ<br/>StatefulSet]
                REDIS_SS[Redis<br/>StatefulSet]
            end
            
            subgraph MonitoringNS["Namespace: monitoring"]
                PROM[Prometheus]
                GRAF[Grafana]
                JAEGER[Jaeger]
            end
        end
        
        subgraph ManagedDB["Managed Services"]
            MONGO_ATLAS[(MongoDB Atlas)]
        end
    end

    USER --> LB --> ING
    ING --> GW_SVC --> GW_DEPLOY
    GW_DEPLOY --> US_D & MS_D & FS_D & RS_D & CS_D
    US_D & MS_D & FS_D & RS_D & CS_D & NS_D <--> RMQ_SS
    US_D & MS_D --> REDIS_SS
    US_D & MS_D & FS_D & RS_D & CS_D --> MONGO_ATLAS
```

### Estructura de Namespaces

```mermaid
flowchart LR
    subgraph K8S["Kubernetes Namespaces"]
        direction TB
        NS1[ingress-nginx<br/>Controlador de ingreso]
        NS2[gateway<br/>API Gateway]
        NS3[streamia-services<br/>Microservicios]
        NS4[streamia-data<br/>Datos y colas]
        NS5[monitoring<br/>Observabilidad]
        NS6[logging<br/>ELK Stack]
    end
```

### Recursos de Kubernetes por Servicio

| Servicio | Deployment | Service | HPA | Recursos |
|----------|-----------|---------|-----|----------|
| Gateway | ✅ | ClusterIP | 2-10 pods | 256Mi-512Mi |
| User Service | ✅ | ClusterIP | 2-5 pods | 256Mi-512Mi |
| Movie Service | ✅ | ClusterIP | 3-10 pods | 512Mi-1Gi |
| Favorites Service | ✅ | ClusterIP | 2-5 pods | 256Mi-512Mi |
| Ratings Service | ✅ | ClusterIP | 2-5 pods | 256Mi-512Mi |
| Comments Service | ✅ | ClusterIP | 2-5 pods | 256Mi-512Mi |
| Notification Service | ✅ | - | 1-3 pods | 128Mi-256Mi |
| RabbitMQ | StatefulSet | ClusterIP | - | 512Mi-1Gi |
| Redis | StatefulSet | ClusterIP | - | 256Mi-512Mi |

---

## Testing y Observabilidad

### Estrategia de Testing

```mermaid
flowchart TB
    subgraph TestPyramid["🔺 Pirámide de Testing"]
        direction TB
        E2E[🔝 E2E Tests<br/>10%]
        INT[🔷 Integration Tests<br/>30%]
        UNIT[🔵 Unit Tests<br/>60%]
    end

    subgraph UnitTests["Unit Tests"]
        U1[Controllers]
        U2[Services]
        U3[Validators]
        U4[Helpers]
    end

    subgraph IntegrationTests["Integration Tests"]
        I1[API Endpoints]
        I2[Database Operations]
        I3[Message Queue]
        I4[External Services Mock]
    end

    subgraph E2ETests["E2E Tests"]
        E1[User Journeys]
        E2[Cross-service Flows]
        E3[Saga Transactions]
    end

    UNIT --> UnitTests
    INT --> IntegrationTests
    E2E --> E2ETests
```

### Tipos de Testing

| Tipo | Herramienta | Cobertura Objetivo | Descripción |
|------|-------------|-------------------|-------------|
| **Unit** | Jest | 80% | Lógica de negocio, validadores, helpers |
| **Integration** | Jest + Supertest | 70% | Endpoints REST, queries a DB |
| **Contract** | Pact | - | Contratos entre servicios |
| **E2E** | k6 + Playwright | Flujos críticos | Journeys completos de usuario |
| **Load** | k6 | - | Performance bajo carga |
| **Chaos** | Chaos Monkey | - | Resiliencia del sistema |

### Stack de Observabilidad

```mermaid
flowchart TB
    subgraph Services["Microservices"]
        S1[User Service]
        S2[Movie Service]
        S3[Other Services...]
    end

    subgraph Observability["📊 Observability Stack"]
        subgraph Metrics["Métricas"]
            PROM[Prometheus]
            GRAF[Grafana]
        end
        
        subgraph Logging["Logging"]
            FB[Fluentd/Fluent Bit]
            ES[Elasticsearch]
            KIB[Kibana]
        end
        
        subgraph Tracing["Distributed Tracing"]
            OT[OpenTelemetry SDK]
            JAEGER[Jaeger]
        end
    end

    subgraph Alerting["🚨 Alertas"]
        AM[AlertManager]
        PD[PagerDuty/Slack]
    end

    S1 & S2 & S3 -->|metrics /metrics| PROM
    PROM --> GRAF
    PROM --> AM --> PD
    
    S1 & S2 & S3 -->|logs stdout| FB --> ES --> KIB
    
    S1 & S2 & S3 -->|traces| OT --> JAEGER
```

### Métricas Clave (KPIs)

| Métrica | Descripción | Umbral de Alerta |
|---------|-------------|------------------|
| **Request Latency (p99)** | Tiempo de respuesta percentil 99 | > 500ms |
| **Error Rate** | % de requests con error | > 1% |
| **Throughput** | Requests por segundo | < umbral esperado |
| **Pod Restarts** | Reinicios de pods | > 3 en 5 min |
| **Queue Depth** | Mensajes pendientes en RabbitMQ | > 1000 |
| **CPU/Memory** | Uso de recursos | > 80% |

### Dashboards de Grafana

```mermaid
flowchart LR
    subgraph Dashboards["📈 Grafana Dashboards"]
        D1[🏠 Overview<br/>Estado general del sistema]
        D2[🔧 Per-Service<br/>Métricas por servicio]
        D3[📨 RabbitMQ<br/>Colas y mensajes]
        D4[💾 MongoDB<br/>Performance de DB]
        D5[🔴 Alerts<br/>Incidentes activos]
    end
```

---

## Flujos de Datos

### Flujo: Registro de Usuario

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente
    participant GW as API Gateway
    participant US as User Service
    participant DB as MongoDB
    participant RMQ as RabbitMQ
    participant NS as Notification Service
    participant SG as SendGrid

    C->>GW: POST /api/users/register
    GW->>GW: Rate Limit Check ✓
    GW->>US: Forward Request
    US->>US: Validar datos (Zod)
    US->>DB: Check email existente
    DB-->>US: No existe
    US->>US: Hash password (bcrypt)
    US->>DB: Crear usuario
    DB-->>US: Usuario creado
    US->>RMQ: Publish: user.registered
    US-->>GW: 201 Created + JWT
    GW-->>C: Respuesta
    
    RMQ->>NS: Consume: user.registered
    NS->>SG: Enviar email bienvenida
    SG-->>NS: Email enviado ✓
```

### Flujo: Ver Película y Agregar a Favoritos

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente
    participant GW as API Gateway
    participant MS as Movie Service
    participant FS as Favorites Service
    participant CACHE as Redis
    participant DB_M as MongoDB Movies
    participant DB_F as MongoDB Favorites
    participant CDN as Cloudinary

    C->>GW: GET /api/movies/:id
    GW->>GW: Validar JWT ✓
    GW->>MS: Forward Request
    MS->>CACHE: Check cache
    
    alt Cache Hit
        CACHE-->>MS: Movie data
    else Cache Miss
        MS->>DB_M: Find movie
        DB_M-->>MS: Movie document
        MS->>CACHE: Set cache (60s TTL)
    end
    
    MS-->>GW: Movie + video URL
    GW-->>C: Respuesta

    Note over C: Usuario reproduce video desde Cloudinary CDN

    C->>GW: POST /api/favorites
    GW->>GW: Validar JWT ✓
    GW->>FS: Forward Request
    FS->>DB_F: Check duplicado
    DB_F-->>FS: No existe
    FS->>DB_F: Crear favorito
    DB_F-->>FS: Favorito creado
    FS-->>GW: 201 Created
    GW-->>C: Respuesta
```

### Flujo: Sistema de Ratings con Agregación

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente
    participant GW as API Gateway
    participant RS as Ratings Service
    participant DB as MongoDB Ratings
    participant CACHE as Redis

    C->>GW: POST /api/ratings {movieId, rating: 4}
    GW->>GW: Validar JWT ✓
    GW->>RS: Forward Request
    RS->>DB: Upsert rating (userId, movieId)
    DB-->>RS: Rating guardado
    RS->>DB: Aggregate: promedio película
    DB-->>RS: {avg: 4.2, count: 150}
    RS->>CACHE: Update: movie:{id}:rating
    RS-->>GW: 200 OK + nuevo promedio
    GW-->>C: Respuesta

    Note over C,CACHE: El promedio se cachea para consultas rápidas
```

---

## Plan de Implementación

### Fases del Proyecto

```mermaid
gantt
    title Plan de Implementación - Streamia Microservices
    dateFormat  YYYY-MM-DD
    
    section Fase 1: Fundación
    Setup repositorio y CI/CD       :f1, 2025-01-06, 5d
    Infraestructura K8s base        :f2, after f1, 7d
    Express Gateway setup           :f3, after f1, 5d
    RabbitMQ + Redis deploy         :f4, after f2, 3d
    
    section Fase 2: Core Services
    User Service                    :s1, after f4, 10d
    Movie Service                   :s2, after f4, 12d
    Notification Service            :s3, after s1, 5d
    
    section Fase 3: Feature Services
    Favorites Service               :s4, after s2, 7d
    Ratings Service                 :s5, after s2, 7d
    Comments Service                :s6, after s2, 7d
    
    section Fase 4: Integración
    Sagas implementation            :i1, after s6, 7d
    Circuit breakers                :i2, after i1, 3d
    Integration testing             :i3, after i2, 5d
    
    section Fase 5: Observabilidad
    Prometheus + Grafana            :o1, after i3, 5d
    ELK Stack                       :o2, after o1, 5d
    Jaeger tracing                  :o3, after o2, 3d
    
    section Fase 6: Go Live
    Load testing                    :g1, after o3, 5d
    Security audit                  :g2, after g1, 3d
    Production deploy               :g3, after g2, 2d
```

### Estructura de Repositorios

```mermaid
flowchart TB
    subgraph MonoRepo["📁 Monorepo (Recomendado)"]
        ROOT[streamia-microservices/]
        
        subgraph Packages
            P1[packages/shared/<br/>Types, Utils, Contracts]
            P2[packages/message-schemas/<br/>Event definitions]
        end
        
        subgraph Services
            S1[services/gateway/]
            S2[services/user-service/]
            S3[services/movie-service/]
            S4[services/favorites-service/]
            S5[services/ratings-service/]
            S6[services/comments-service/]
            S7[services/notification-service/]
        end
        
        subgraph Infra
            I1[infra/kubernetes/<br/>K8s manifests]
            I2[infra/helm/<br/>Helm charts]
            I3[infra/terraform/<br/>Cloud resources]
        end
        
        subgraph CI
            C1[.github/workflows/<br/>CI/CD pipelines]
        end
    end

    ROOT --> Packages & Services & Infra & CI
```

### Checklist de Implementación

```mermaid
flowchart TB
    subgraph Phase1["✅ Fase 1: Fundación"]
        P1_1[☐ Crear monorepo con Turborepo/Nx]
        P1_2[☐ Configurar TypeScript compartido]
        P1_3[☐ Setup Docker Compose local]
        P1_4[☐ Configurar GitHub Actions]
        P1_5[☐ Deploy K8s cluster base]
    end
    
    subgraph Phase2["🔧 Fase 2: Core Services"]
        P2_1[☐ User Service + Tests]
        P2_2[☐ Movie Service + Cloudinary]
        P2_3[☐ Express Gateway config]
        P2_4[☐ RabbitMQ exchanges/queues]
        P2_5[☐ Notification worker]
    end
    
    subgraph Phase3["⭐ Fase 3: Features"]
        P3_1[☐ Favorites Service]
        P3_2[☐ Ratings Service]
        P3_3[☐ Comments Service]
        P3_4[☐ Event consumers]
    end
    
    subgraph Phase4["🔗 Fase 4: Integración"]
        P4_1[☐ Implementar Sagas]
        P4_2[☐ Circuit Breakers]
        P4_3[☐ Retry policies]
        P4_4[☐ Dead letter queues]
    end
    
    subgraph Phase5["📊 Fase 5: Observabilidad"]
        P5_1[☐ Prometheus metrics]
        P5_2[☐ Grafana dashboards]
        P5_3[☐ ELK logging]
        P5_4[☐ Jaeger tracing]
        P5_5[☐ AlertManager rules]
    end

    Phase1 --> Phase2 --> Phase3 --> Phase4 --> Phase5
```

---

## Resumen Ejecutivo

### Arquitectura Propuesta

| Aspecto | Decisión | Razón |
|---------|----------|-------|
| **Microservicios** | 6 servicios + 1 gateway | Separación por dominio de negocio |
| **Comunicación** | Coreografía con RabbitMQ | Desacoplamiento, resiliencia |
| **Patrón principal** | Saga (Choreography-based) | Transacciones distribuidas sin orquestador |
| **API Gateway** | Express Gateway | Compatibilidad con stack actual |
| **Orquestación** | Kubernetes | Escalabilidad, auto-healing |
| **Base de datos** | MongoDB (Database per Service) | Autonomía de servicios |
| **Observabilidad** | Prometheus + Grafana + Jaeger + ELK | Stack completo de monitoreo |

### Beneficios Esperados

```mermaid
flowchart LR
    subgraph Benefits["🎯 Beneficios"]
        B1[📈 Escalabilidad<br/>independiente]
        B2[🔧 Mantenibilidad<br/>mejorada]
        B3[🚀 Despliegues<br/>independientes]
        B4[💪 Resiliencia<br/>ante fallos]
        B5[👥 Equipos<br/>autónomos]
    end
```

### Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Complejidad operacional | Alta | Alto | Automatización, IaC, GitOps |
| Debugging distribuido | Media | Medio | Jaeger tracing, correlation IDs |
| Consistencia de datos | Media | Alto | Sagas, idempotencia, compensación |
| Latencia de red | Baja | Medio | Cache, circuit breakers |
| Curva de aprendizaje | Media | Medio | Documentación, capacitación |

---

## Referencias y Recursos

- [Microservices Patterns - Chris Richardson](https://microservices.io/patterns/)
- [Express Gateway Documentation](https://www.express-gateway.io/docs/)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [The Twelve-Factor App](https://12factor.net/)

---

*Documento generado el 14 de Diciembre de 2025*
*Versión: 1.0.0*
*Proyecto: Streamia Microservices Architecture*
