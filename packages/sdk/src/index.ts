export type JobStatus = 'running' | 'succeeded' | 'failed' | 'unknown' | 'cancel_requested' | 'cancelled';

export interface JobReceipt {
  id: string;
  owner: string;
  jobType: string;
  title: string;
  status: JobStatus;
  result: string | null;
  progress: number | null;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

/** Public capabilities passed by the host to each mounted React view. */
export interface ViewProps<Config extends object, State extends object = Record<string, unknown>> {
  registerController(controller: ViewController): () => void;
  config: Readonly<Config>;
  updateConfig(config: Config): Promise<void>;
  state: Readonly<State>;
  updateState(state: State): Promise<void>;
  services: {
    selectFile(id: string, version: string, method: string, input: ServiceValue): Promise<ServiceValue | null>;
    watch(id: string, version: string, onInvalidated: () => void): () => void;
    call(id: string, version: string, method: string, input: string | string[]): Promise<string | string[]>;
  };
  jobs: {
    submit(type: string, key: string, input: string[]): Promise<JobReceipt>;
  };
}

/** Capabilities supplied to a trusted plugin's backend.mjs call handler. */
export interface BackendContext {
  readonly dataDirectory: string;
  readonly signal: AbortSignal;
  /** Reads the single file delegated to this invocation, at most once. */
  readSelectedFile?(): Promise<Uint8Array>;
  reportProgress(percent: number): void;
  confirmCancelled(): never;
}

export type ServiceValue = string | string[];
export type BackendHandler = (
  service: string,
  method: string,
  input: ServiceValue,
  context: BackendContext
) => ServiceValue | Promise<ServiceValue>;

export interface ViewController {
  prepareClose(reason: 'window-close' | 'workspace-switch' | 'pane-close' | 'replace-view' | 'layout-change' | 'delete-workspace'): {status:'ready'} | {status:'blocked';message:string} | {status:'dirty';message:string;canSave:boolean};
  saveDraft(): Promise<void>;
  discardDraft(): void | Promise<void>;
}

/** Called once per backend process before the host accepts service calls. */
export type BackendActivate = (context: Pick<BackendContext, 'dataDirectory'>) => void | Promise<void>;
