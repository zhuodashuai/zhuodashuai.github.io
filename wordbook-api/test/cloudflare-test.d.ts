declare module "cloudflare:test" {
  export const env: Env;

  export function reset(): Promise<void>;

  export function runInDurableObject<T>(
    stub: DurableObjectStub,
    callback: (instance: unknown, state: DurableObjectState) => T | Promise<T>
  ): Promise<T>;
}
