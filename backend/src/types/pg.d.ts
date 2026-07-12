declare module 'pg' {
  export interface QueryResult<Row = Record<string, unknown>> {
    rowCount: number | null;
    rows: Row[];
  }

  export class Client {
    constructor(config: { connectionString: string });
    connect(): Promise<void>;
    end(): Promise<void>;
    query<Row = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>>;
  }
}
