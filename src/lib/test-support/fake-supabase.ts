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
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "public_availability"; prefix: string; cutoff: number };

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
  or(expression: string, options?: { referencedTable?: string }): this {
    const match = expression.match(/budget_hold_until\.lte\.([^,)]+)/);
    if (!match) throw new Error(`Unsupported fake OR filter: ${expression}`);
    if (
      !expression.includes("first_contact_reserved_at.is.null") ||
      !expression.includes("do_not_republish.eq.false")
    ) {
      throw new Error(`Unsupported fake public-availability filter: ${expression}`);
    }
    this.filters.push({
      kind: "public_availability",
      prefix: options?.referencedTable ? `${options.referencedTable}.` : "",
      cutoff: new Date(match[1]).getTime(),
    });
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  ilike(): this {
    return this;
  }
  /** Mirrors PostgREST: first matching row, or null. */
  async maybeSingle(): Promise<{ data: FakeRow | null; error: unknown }> {
    const res = this.run();
    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.[0] ?? null, error: null };
  }

  private run(): { data: FakeRow[] | null; error: unknown } {
    this.onRead(this.table);
    if (this.error) return { data: null, error: this.error };
    const data = this.rows.filter((row) =>
      this.filters.every((f) => {
        if (f.kind === "eq") return getPath(row, f.column) === f.value;
        if (f.kind === "in") {
          return (f.values as unknown[]).includes(getPath(row, f.column) as never);
        }
        const budgetHold = getPath(row, `${f.prefix}budget_hold_until`);
        const budgetEligible =
          budgetHold === null || budgetHold === undefined || new Date(String(budgetHold)).getTime() <= f.cutoff;
        if (!budgetEligible || getPath(row, `${f.prefix}do_not_republish`) === true) return false;

        const origin = getPath(row, `${f.prefix}profile_origin`);
        if (origin !== "admin_public_info") return true;
        const ownerAccountId = getPath(row, `${f.prefix}owner_account_id`);
        if (ownerAccountId) return Boolean(getPath(row, `${f.prefix}owner_reviewed_at`));
        return (
          !getPath(row, `${f.prefix}first_contact_reserved_at`) && !getPath(row, `${f.prefix}first_contact_sent_at`)
        );
      }),
    );
    return { data, error: null };
  }

  then<R1 = { data: FakeRow[] | null; error: unknown }, R2 = never>(
    onfulfilled?: ((v: { data: FakeRow[] | null; error: unknown }) => R1 | PromiseLike<R1>) | null,
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

export function createFakeSupabase(tables: FakeTables, errors: Record<string, unknown> = {}): FakeSupabase {
  const reads: string[] = [];
  return {
    reads,
    from(table: string) {
      return new FakeBuilder(tables[table] ?? [], errors[table], (t) => reads.push(t), table);
    },
  };
}
