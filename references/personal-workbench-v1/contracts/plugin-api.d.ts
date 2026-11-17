/** Design contract v0.1.0. Declarations only: no runtime implementation. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Disposable { dispose(): void | Promise<void> }
export interface ResourceRef {
  providerId: string;
  kind: string;
  resourceId: string;
  version: number;
  label?: string;
}
export interface ViewSnapshot { version: number; payload: Json }
export type CloseReason = 'pane-close' | 'workspace-switch' | 'plugin-disable' | 'app-quit';
export type CloseDecision = { allow: true } | { allow: false; message: string };
export interface CallOptions {
  timeoutMs?: number;
  signal?: AbortSignal; // Local SDK only; transport converts to cancellation messages.
  idempotencyKey?: string;
}
export interface ServiceClient {
  call<T extends Json = Json>(method: string, params: Json, options?: CallOptions): Promise<T>;
  dispose(): void;
}
export interface ServicesApi {
  resolve(serviceId: string, versionRange: string, options?: { optional?: boolean }): Promise<ServiceClient | null>;
}
export interface ViewContext {
  readonly pluginId: string;
  readonly workspaceId: string;
  readonly instanceId: string;
  readonly config: Json;
  readonly restoredState: ViewSnapshot | null;
  readonly resource: ResourceRef | null;
  readonly services: ServicesApi;
  readonly jobs: JobsApi;
  readonly capabilities: CapabilityApi; // UI-safe subset enforced by the host.
  saveConfig(value: Json): Promise<void>;
  saveState(value: ViewSnapshot): Promise<void>;
  reportError(error: { code: string; message: string; traceId?: string }): void;
}
export interface ViewController extends Disposable {
  snapshot(): Promise<ViewSnapshot>;
  canClose(reason: CloseReason): Promise<CloseDecision>;
  updateConfig(config: Json): Promise<void>;
  setVisible(visible: boolean): void;
  resize(width: number, height: number): void;
}
export interface ViewFactory {
  mount(container: HTMLElement, context: ViewContext): Promise<ViewController>;
}
export interface UiRegistrationContext {
  registerView(viewType: string, factory: ViewFactory): Disposable;
}
export interface PluginUiModule {
  register(context: UiRegistrationContext): void | Disposable | Promise<void | Disposable>;
}
export type JobStatus = 'queued' | 'running' | 'cancel_requested' | 'succeeded' |
  'failed' | 'cancelled' | 'interrupted' | 'unknown';
export interface JobRecord {
  id: string;
  pluginId: string;
  jobType: string;
  status: JobStatus;
  progress: number | null; // [0, 1]; null = unknown progress.
  idempotencyKey: string;
  externalId?: string;
  resultRefs: ResourceRef[];
  error?: { code: string; message: string; retryable: boolean };
}
export interface JobsApi {
  submit(jobType: string, input: Json, options: { idempotencyKey: string }): Promise<JobRecord>;
  get(jobId: string): Promise<JobRecord>;
  cancel(jobId: string): Promise<JobRecord>;
  watch(jobId: string, listener: (record: JobRecord) => void): Disposable;
}
export interface JobExecutionContext {
  readonly jobId: string;
  readonly idempotencyKey: string;
  readonly signal: AbortSignal;
  checkpoint(value: { externalId?: string; progress?: number | null; metadata?: Json }): Promise<void>;
}
export interface JobOutcome {
  status: 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  resultRefs?: ResourceRef[];
  error?: { code: string; message: string; retryable: boolean };
}
export interface JobHandler {
  execute(input: Json, context: JobExecutionContext): Promise<JobOutcome>;
  reconcile?(record: JobRecord): Promise<JobOutcome | null>;
}
export interface ServiceCallContext {
  readonly requestId: string;
  readonly callerPluginId: string;
  readonly signal: AbortSignal;
  readonly delegatedGrantIds: readonly string[];
}
export interface ServiceRegistration {
  id: string;
  version: string;
  methods: Record<string, (params: Json, context: ServiceCallContext) => Promise<Json>>;
}
export type CapabilityStatus = 'supported' | 'unsupported' | 'needsAuthorization' | 'denied';
export interface CapabilityApi {
  status(name: string): Promise<CapabilityStatus>;
  invoke<T extends Json = Json>(name: string, input: Json): Promise<T>;
}
export interface StorageTransaction {
  get(key: string): Promise<Json | undefined>;
  set(key: string, value: Json): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface PluginStorage {
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;
  dataDirectory(): Promise<string>; // Trusted backend only. Not passed to UI.
}
export interface DataStoreLifecycle {
  readonly schemaVersion: number;
  beforeBackup(): Promise<void>;
  exportSnapshot(destinationDirectory: string): Promise<Json>;
  afterBackup(success: boolean): Promise<void>;
  migrate(fromVersion: number, toVersion: number): Promise<void>;
}
export interface PluginContext {
  readonly pluginId: string;
  readonly services: ServicesApi;
  readonly jobs: JobsApi;
  readonly capabilities: CapabilityApi;
  readonly storage: PluginStorage;
  registerCommand(id: string, handler: (params: Json) => Promise<Json>): Disposable;
  registerService(definition: ServiceRegistration): Disposable;
  registerJobType(id: string, handler: JobHandler): Disposable;
  registerResourceOpener(kind: string, handler: (ref: ResourceRef) => Promise<{ viewType: string; config: Json }>): Disposable;
}
export interface DataPreparationContext {
  readonly pluginId: string;
  readonly dataDirectory: string;
}
export interface PluginServiceModule {
  prepareData?(context: DataPreparationContext): Promise<DataStoreLifecycle>;
  activate(context: PluginContext): Promise<void | Disposable>;
}
