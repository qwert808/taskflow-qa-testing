declare module 'newman' {
  export interface NewmanRunFailure {
    source?: { name?: string };
    error?: { test?: string; name?: string; message?: string };
  }

  export interface NewmanExecutionAssertion {
    error?: { message?: string } | null;
  }

  export interface NewmanExecutionItem {
    item?: { name?: string };
    request?: { method?: string };
    response?: { code?: number; responseTime?: number };
    assertions?: NewmanExecutionAssertion[];
  }

  export interface NewmanRunSummary {
    run: {
      stats: {
        requests?: { total?: number; failed?: number };
        assertions?: { total?: number; failed?: number };
      };
      timings: {
        started?: number;
        completed?: number;
        responseAverage?: number;
      };
      failures?: NewmanRunFailure[];
      executions?: NewmanExecutionItem[];
    };
  }

  export interface NewmanRunOptions {
    collection: string | Record<string, unknown>;
    envVar?: Array<{ key: string; value: string }>;
    iterationData?: string;
    reporters?: string[];
    reporter?: Record<string, unknown>;
    insecure?: boolean;
    timeoutRequest?: number;
  }

  const newman: {
    run(
      options: NewmanRunOptions,
      callback: (err: Error | null, summary: NewmanRunSummary) => void
    ): void;
  };

  export default newman;
}
