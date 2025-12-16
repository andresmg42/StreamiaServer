import { Request, Response, NextFunction } from 'express';

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
}

const defaultOptions: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
};

// Store circuit breaker states per service
const circuitBreakers: Map<string, CircuitBreakerState> = new Map();

function getCircuitBreaker(serviceName: string): CircuitBreakerState {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(serviceName, {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED',
    });
  }
  return circuitBreakers.get(serviceName)!;
}

export function circuitBreakerMiddleware(
  serviceName: string,
  options: Partial<CircuitBreakerOptions> = {}
) {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const breaker = getCircuitBreaker(serviceName);
    const now = Date.now();

    // Check if circuit is OPEN
    if (breaker.state === 'OPEN') {
      // Check if reset timeout has passed
      if (now - breaker.lastFailure >= opts.resetTimeout) {
        breaker.state = 'HALF_OPEN';
        console.log(`[Circuit Breaker] ${serviceName}: OPEN -> HALF_OPEN`);
      } else {
        res.status(503).json({
          success: false,
          error: 'Service Unavailable',
          message: `${serviceName} is currently unavailable. Please try again later.`,
        });
        return;
      }
    }

    // Store original end function
    const originalEnd = res.end.bind(res);

    // Override end to track failures
    res.end = function (
      this: Response,
      chunk?: any,
      encodingOrCb?: BufferEncoding | (() => void),
      cb?: () => void
    ): Response {
      if (res.statusCode >= 500) {
        recordFailure(serviceName, opts);
      } else if (res.statusCode < 400) {
        recordSuccess(serviceName);
      }
      
      if (typeof encodingOrCb === 'function') {
        return originalEnd(chunk, encodingOrCb);
      }
      if (encodingOrCb !== undefined) {
        return originalEnd(chunk, encodingOrCb, cb);
      }
      return originalEnd(chunk, cb);
    } as typeof res.end;

    next();
  };
}

function recordFailure(serviceName: string, options: CircuitBreakerOptions): void {
  const breaker = getCircuitBreaker(serviceName);
  breaker.failures++;
  breaker.lastFailure = Date.now();

  if (breaker.failures >= options.failureThreshold) {
    breaker.state = 'OPEN';
    console.log(`[Circuit Breaker] ${serviceName}: CLOSED -> OPEN (failures: ${breaker.failures})`);
  }
}

function recordSuccess(serviceName: string): void {
  const breaker = getCircuitBreaker(serviceName);

  if (breaker.state === 'HALF_OPEN') {
    breaker.state = 'CLOSED';
    breaker.failures = 0;
    console.log(`[Circuit Breaker] ${serviceName}: HALF_OPEN -> CLOSED`);
  } else if (breaker.state === 'CLOSED' && breaker.failures > 0) {
    breaker.failures = 0;
  }
}

// Export for monitoring
export function getCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
  const status: Record<string, CircuitBreakerState> = {};
  circuitBreakers.forEach((state, name) => {
    status[name] = { ...state };
  });
  return status;
}
