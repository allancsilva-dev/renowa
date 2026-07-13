export function withGeneratedUuid<T extends object>(payload: T): T & { uuid: string } {
  return { ...payload, uuid: crypto.randomUUID() };
}
