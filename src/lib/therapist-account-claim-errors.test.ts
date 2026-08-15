import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

const accountsSource = read("lib/therapist-accounts.functions.ts");
const claimsSource = read("lib/therapist-claims.functions.ts");
const accountRouteSource = read("routes/_authenticated/account.tsx");
const claimRouteSource = read("routes/_authenticated/claim.tsx");

describe("therapist account and claim read failures", () => {
  it("does not turn therapist-account read failures into a missing account or profile", () => {
    expect(accountsSource).toContain("error: accountErr");
    expect(accountsSource).toContain("if (accountErr) throw new Error(accountErr.message)");
    expect(accountsSource).toContain("error: ownedErr");
    expect(accountsSource).toContain("if (ownedErr) throw new Error(ownedErr.message)");
  });

  it("does not turn claim account/profession read failures into empty data", () => {
    expect(claimsSource).toContain("error: readErr");
    expect(claimsSource).toContain("if (readErr) throw new Error(readErr.message)");
    expect(claimsSource).toContain("if (accountErr) throw new Error(accountErr.message)");
    expect(claimsSource).toContain('const { data, error } = await sb');
    expect(claimsSource).toContain("if (error) throw new Error(error.message)");
  });

  it("uses the idempotent ensure call as the account query and exposes retry UI", () => {
    expect(accountRouteSource).toContain("queryFn: () => ensureFn()");
    expect(accountRouteSource).not.toContain("useEffect(");
    expect(accountRouteSource).toContain("לא הצלחנו לטעון את פרטי החשבון");
    expect(accountRouteSource).toContain("accountQuery.refetch()");
  });

  it("surfaces claim search, request, ownership and profession read failures", () => {
    expect(claimRouteSource).toContain("לא הצלחנו לבצע את החיפוש");
    expect(claimRouteSource).toContain("לא הצלחנו לטעון את הבקשות");
    expect(claimRouteSource).toContain("לא הצלחנו לבדוק את מצב הפרופיל");
    expect(claimRouteSource).toContain("לא הצלחנו לטעון את רשימת המקצועות");
    expect(claimRouteSource).toContain("detail.isSuccess && detail.data && !action");
  });
});
