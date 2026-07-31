/**
 * Test-only in-memory stand-in for the supabase-js query builder.
 *
 * It is deliberately dumb: it stores plain rows per table (already shaped
 * the way PostgREST returns embedded resources, e.g.
 * `{ therapist_id, professions: { slug } }`) and supports the exact subset
 * of the builder that the production code uses: `.select()`, `.eq()`,
 * `.in()` and awaiting the builder.
 *
 * This lets the regression suite drive the REAL production functions
 * (`loadSearchCatalog`, `interpretQuery`, `SemanticEngine.classify`,
 * `executeUnifiedSearch`) end to end without a database and without a
 * second, parallel implementation of the search pipeline.
 */

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;

function getPath(row: FakeRow, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, row);
}

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] };

class FakeBuilder implements PromiseLike<{ data: FakeRow[] | null; error: unknown }> {
  private filters: Filter[] = [];

  constructor(
    private readonly rows: FakeRow[],
    private readonly error: unknown,
    private readonly onRead: (table: string) => void,
    private readonly table: string,
  ) {}

  select(_columns?: string): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push({ kind: "in", column, values });
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }

  private run(): { data: FakeRow[] | null; error: unknown } {
    this.onRead(this.table);
    if (this.error) return { data: null, error: this.error };
    const data = this.rows.filter((row) =>
      this.filters.every((f) => {
        const actual = getPath(row, f.column);
        return f.kind === "eq"
          ? actual === f.value
          : (f.values as unknown[]).includes(actual as never);
      }),
    );
    return { data, error: null };
  }

  then<R1 = { data: FakeRow[] | null; error: unknown }, R2 = never>(
    onfulfilled?:
      | ((v: { data: FakeRow[] | null; error: unknown }) => R1 | PromiseLike<R1>)
      | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export type FakeSupabase = {
  from(table: string): FakeBuilder;
  /** Tables read during the run, in order. */
  reads: string[];
};

export function createFakeSupabase(
  tables: FakeTables,
  errors: Record<string, unknown> = {},
): FakeSupabase {
  const reads: string[] = [];
  return {
    reads,
    from(table: string) {
      return new FakeBuilder(
        tables[table] ?? [],
        errors[table],
        (t) => reads.push(t),
        table,
      );
    },
  };
}