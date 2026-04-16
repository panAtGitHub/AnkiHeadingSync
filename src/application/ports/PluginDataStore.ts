export interface PluginDataStore<TData> {
  load(): Promise<TData | null>;
  save(data: TData): Promise<void>;
}