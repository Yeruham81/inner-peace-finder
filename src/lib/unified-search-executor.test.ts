import { describe, expect, it } from "bun:test";
import {
  executeUnifiedSearch,
  matchesLocationAvailability,
  type TherapistRepo,
  type HydratedCandidate,
  type DisplayRow,
} from "./unified-search-executor";
import type { SemanticProfileEntry } from "./therapist-semantic-profile";
import type { TherapistGender, TherapistSearchPlan } from "./query-interpreter.types";
import { parseStoredProfile } from "./therapist-semantic-profile";

type FakeTherapist = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  image_url: string | null;
  displayCity: string | null;
  verified: boolean;
  bioLength: number;
  yearsExperience: number;
  is_active: boolean;
  profile_status: "draft" | "completed" | "published";
  visibility: "visible" | "hidden_by_owner" | "archived" | "hidden";
  gender: TherapistGender | null;
  professionSlugs: string[];
  modalitySlugs: string[];
  populationSlugs: string[];
  languageCodes: string[];
  /** Each row = one location; therapist has one row per (city, deliveryMode). */
  locations: {
    city: string;
    deliveryMode: "clinic" | "home_visit" | "online" | "hospital" | "other";
    /** Canonical region slug for this row, when it has one. */
    regionSlug?: string | null;
    isPrimary?: boolean;
  }[];
  /** Canonical stored form (array). */
  storedSemanticProfile: unknown;
};

function makeTherapist(over: Partial<FakeTherapist> & { id: string }): FakeTherapist {
  return {
    slug: `slug-${over.id}`,
    full_name: `Therapist ${over.id}`,
    professional_title: null,
    image_url: null,
    displayCity: null,
    verified: false,
    bioLength: 100,
    yearsExperience: 5,
    is_active: true,
    profile_status: "published",
    visibility: "visible",
    gender: null,
    professionSlugs: [],
    modalitySlugs: [],
    populationSlugs: [],
    languageCodes: [],
    locations: [],
    storedSemanticProfile: [],
    ...over,
  };
}

function isEligible(t: FakeTherapist): boolean {
  return t.is_active && t.profile_status === "published" && t.visibility === "visible";
}

function makeRepo(therapists: FakeTherapist[], opts: { failOn?: keyof TherapistRepo } = {}) {
  let eligibleLoadCount = 0;
  const guard = (op: keyof TherapistRepo) => {
    if (opts.failOn === op) throw new Error(`repo failure: ${op}`);
  };
  const repo: TherapistRepo = {
    async loadEligibleIds() {
      guard("loadEligibleIds");
      eligibleLoadCount++;
      return new Set(therapists.filter(isEligible).map((t) => t.id));
    },
    async idsByProfessions(slugs) {
      guard("idsByProfessions");
      return new Set(
        therapists
          .filter((t) => isEligible(t) && t.professionSlugs.some((s) => slugs.includes(s)))
          .map((t) => t.id),
      );
    },
    async idsByModalities(slugs) {
      guard("idsByModalities");
      return new Set(
        therapists
          .filter((t) => isEligible(t) && t.modalitySlugs.some((s) => slugs.includes(s)))
          .map((t) => t.id),
      );
    },
    async idsByPopulations(slugs) {
      guard("idsByPopulations");
      return new Set(
        therapists
          .filter((t) => isEligible(t) && t.populationSlugs.some((s) => slugs.includes(s)))
          .map((t) => t.id),
      );
    },
    async idsByLanguages(codes) {
      guard("idsByLanguages");
      return new Set(
        therapists
          .filter((t) => isEligible(t) && t.languageCodes.some((c) => codes.includes(c)))
          .map((t) => t.id),
      );
    },
    async idsByCities(cities) {
      guard("idsByCities");
      return new Set(
        therapists
          .filter((t) => isEligible(t) && t.locations.some((l) => cities.includes(l.city)))
          .map((t) => t.id),
      );
    },
    async idsByLocationAvailability(filter) {
      guard("idsByLocationAvailability");
      return new Set(
        therapists
          .filter(
            (t) =>
              isEligible(t) &&
              matchesLocationAvailability(
                t.locations.map((l) => ({
                  location_type: l.deliveryMode,
                  region_slug: l.regionSlug ?? null,
                })),
                filter,
              ),
          )
          .map((t) => t.id),
      );
    },
    async idsByGender(gender) {
      guard("idsByGender");
      return new Set(
        therapists.filter((t) => isEligible(t) && t.gender === gender).map((t) => t.id),
      );
    },
    async hydrate(ids): Promise<HydratedCandidate[]> {
      guard("hydrate");
      const byId = new Map(therapists.map((t) => [t.id, t]));
      return ids
        .map((id) => byId.get(id))
        .filter((t): t is FakeTherapist => !!t)
        .map((t) => ({
          id: t.id,
          gender: t.gender,
          professionSlugs: t.professionSlugs,
          modalitySlugs: t.modalitySlugs,
          populationSlugs: t.populationSlugs,
          languageCodes: t.languageCodes,
          cities: t.locations.map((l) => l.city),
          deliveryModes: t.locations.map((l) => l.deliveryMode),
          semanticProfile: parseStoredProfile(t.storedSemanticProfile),
          qualitySignals: {
            verified: t.verified,
            hasImage: !!t.image_url,
            bioLength: t.bioLength,
          },
          yearsExperience: t.yearsExperience,
        }));
    },
    async fetchDisplay(ids): Promise<Map<string, DisplayRow>> {
      guard("fetchDisplay");
      const map = new Map<string, DisplayRow>();
      // Return in reverse order — the executor MUST rebuild ranked order.
      const byId = new Map(therapists.map((t) => [t.id, t]));
      for (const id of [...ids].reverse()) {
        const t = byId.get(id);
        if (!t) continue;
        map.set(id, {
          slug: t.slug,
          full_name: t.full_name,
          professional_title: t.professional_title,
          image_url: t.image_url,
          verified: t.verified,
          short_intro: null,
          primary_clinic: t.displayCity
            ? { city: t.displayCity, region_slug: null, region_label: null }
            : null,
          additional_clinic_count: 0,
          online_available: t.locations.some((l) => l.deliveryMode === "online"),
          home_visit_regions: [],
          language_names: [],
          population_names: [],
        });
      }
      return map;
    },
  };
  return { repo, eligibleLoadCount: () => eligibleLoadCount };
}

function plan(over: Partial<TherapistSearchPlan> = {}): TherapistSearchPlan {
  return {
    interpretation: {
      raw: "",
      normalized: "",
      intent: "structured",
      unresolvedPrimary: false,
      primaryHead: null,
      hardFilters: {
        professionSlugs: [], modalitySlugs: [], populationSlugs: [],
        languageCodes: [], deliveryModes: [], cityNames: [], therapistGender: null,
      },
      softPreferences: {
        professionSlugs: [], modalitySlugs: [], populationSlugs: [],
        languageCodes: [], cities: [], deliveryModes: [], genders: [],
      },
      therapistNameIds: [],
      semanticRemainder: "",
      genderEvidence: [],
      unresolvedCodes: [],
    },
    semanticSignals: [],
    hardFilters: over.hardFilters ?? {
      professionSlugs: [], modalitySlugs: [], populationSlugs: [],
      languageCodes: [], deliveryModes: [], cityNames: [], therapistGender: null,
    },
    softPreferences: over.softPreferences ?? {
      professionSlugs: [], modalitySlugs: [], populationSlugs: [],
      languageCodes: [], cities: [], deliveryModes: [], genders: [],
    },
    therapistNameIds: over.therapistNameIds ?? [],
    emptyReason: over.emptyReason ?? null,
    ...over,
  };
}

/* ---------------- Semantic data ---------------- */

describe("executor: semantic data", () => {
  it("parses canonical array-form semantic_profile through parseStoredProfile", async () => {
    const t = makeTherapist({
      id: "a",
      storedSemanticProfile: [{ slug: "anxiety", weight: 0.9 }],
    });
    const { repo } = makeRepo([t]);
    const out = await executeUnifiedSearch(repo, plan({
      semanticSignals: [{ slug: "anxiety", confidence: 1 }],
    }));
    expect(out.results.length).toBe(1);
    expect(out.results[0].scores.semantic).toBeCloseTo(0.9, 5);
  });

  it("semantic score uses query confidence × profile weight", async () => {
    const t = makeTherapist({
      id: "a",
      storedSemanticProfile: [{ slug: "trauma", weight: 0.5 }],
    });
    const { repo } = makeRepo([t]);
    const out = await executeUnifiedSearch(repo, plan({
      semanticSignals: [{ slug: "trauma", confidence: 0.6 }],
    }));
    expect(out.results[0].scores.semantic).toBeCloseTo(0.3, 5);
  });

  it("null/malformed profile becomes empty profile without throwing", async () => {
    const t = makeTherapist({ id: "a", storedSemanticProfile: null });
    const t2 = makeTherapist({ id: "b", storedSemanticProfile: { garbage: true } });
    const t3 = makeTherapist({
      id: "c",
      storedSemanticProfile: [{ slug: "anxiety", weight: 0.7 }],
    });
    const { repo } = makeRepo([t, t2, t3]);
    const out = await executeUnifiedSearch(repo, plan({
      semanticSignals: [{ slug: "anxiety", confidence: 1 }],
    }));
    // Only t3 has overlap; semantic gate drops the rest.
    expect(out.results.map((r) => r.id)).toEqual(["c"]);
  });

  it("zero-overlap candidates are removed when signals exist", async () => {
    const a = makeTherapist({
      id: "a", storedSemanticProfile: [{ slug: "anxiety", weight: 1 }],
    });
    const b = makeTherapist({
      id: "b", storedSemanticProfile: [{ slug: "grief", weight: 1 }],
    });
    const { repo } = makeRepo([a, b]);
    const out = await executeUnifiedSearch(repo, plan({
      semanticSignals: [{ slug: "anxiety", confidence: 1 }],
    }));
    expect(out.results.map((r) => r.id)).toEqual(["a"]);
  });

  it("higher quality/experience cannot outrank higher semantic relevance", async () => {
    const strong = makeTherapist({
      id: "strong",
      storedSemanticProfile: [{ slug: "anxiety", weight: 1 }],
      verified: false, bioLength: 0, yearsExperience: 1,
    });
    const weak = makeTherapist({
      id: "weak",
      storedSemanticProfile: [{ slug: "anxiety", weight: 0.1 }],
      verified: true, image_url: "img", bioLength: 800, yearsExperience: 25,
    });
    const { repo } = makeRepo([weak, strong]);
    const out = await executeUnifiedSearch(repo, plan({
      semanticSignals: [{ slug: "anxiety", confidence: 1 }],
    }));
    expect(out.results[0].id).toBe("strong");
  });
});

/* ---------------- Structured filtering ---------------- */

describe("executor: structured filtering", () => {
  it("intersects profession + population + city (AND across categories)", async () => {
    const match = makeTherapist({
      id: "match",
      professionSlugs: ["psychologist"],
      populationSlugs: ["children"],
      locations: [{ city: "חיפה", deliveryMode: "clinic" }],
    });
    const missingCity = makeTherapist({
      id: "no-city",
      professionSlugs: ["psychologist"],
      populationSlugs: ["children"],
      locations: [{ city: "תל אביב", deliveryMode: "clinic" }],
    });
    const missingPop = makeTherapist({
      id: "no-pop",
      professionSlugs: ["psychologist"],
      populationSlugs: [],
      locations: [{ city: "חיפה", deliveryMode: "clinic" }],
    });
    const { repo } = makeRepo([match, missingCity, missingPop]);
    const out = await executeUnifiedSearch(repo, plan({
      hardFilters: {
        professionSlugs: ["psychologist"], modalitySlugs: [],
        populationSlugs: ["children"], languageCodes: [], deliveryModes: [],
        cityNames: ["חיפה"], therapistGender: null,
      },
    }));
    expect(out.results.map((r) => r.id)).toEqual(["match"]);
  });

  it("intersects language + city", async () => {
    const match = makeTherapist({
      id: "match", languageCodes: ["ru"],
      locations: [{ city: "חיפה", deliveryMode: "clinic" }],
    });
    const wrongCity = makeTherapist({
      id: "wrong", languageCodes: ["ru"],
      locations: [{ city: "תל אביב", deliveryMode: "clinic" }],
    });
    const { repo } = makeRepo([match, wrongCity]);
    const out = await executeUnifiedSearch(repo, plan({
      hardFilters: {
        professionSlugs: [], modalitySlugs: [], populationSlugs: [],
        languageCodes: ["ru"], deliveryModes: [], cityNames: ["חיפה"], therapistGender: null,
      },
    }));
    expect(out.results.map((r) => r.id)).toEqual(["match"]);
  });

  it("delivery mode is a hard filter when not preferred", async () => {
    const online = makeTherapist({
      id: "online", locations: [{ city: "תל אביב", deliveryMode: "online" }],
    });
    const clinicOnly = makeTherapist({
      id: "clinic", locations: [{ city: "תל אביב", deliveryMode: "clinic" }],
    });
    const { repo } = makeRepo([online, clinicOnly]);
    const out = await executeUnifiedSearch(repo, plan({
      hardFilters: {
        professionSlugs: [], modalitySlugs: [], populationSlugs: [],
        languageCodes: [], deliveryModes: ["online"], cityNames: [], therapistGender: null,
      },
    }));
    expect(out.results.map((r) => r.id)).toEqual(["online"]);
  });

  it("city and delivery mode may live on separate location rows for the same therapist", async () => {
    const split = makeTherapist({
      id: "split",
      locations: [
        { city: "חיפה", deliveryMode: "clinic" },
        { city: "אחר", deliveryMode: "online" },
      ],
    });
    const { repo } = makeRepo([split]);
    const out = await executeUnifiedSearch(repo, plan({
      hardFilters: {
        professionSlugs: [], modalitySlugs: [], populationSlugs: [],
        languageCodes: [], deliveryModes: ["online"], cityNames: ["חיפה"], therapistGender: null,
      },
    }));
    expect(out.results.map((r) => r.id)).toEqual(["split"]);
  });

  it("OR within a category, AND across categories (multiple professions)", async () => {
    const psy = makeTherapist({ id: "psy", professionSlugs: ["psychologist"], languageCodes: ["he"] });
    const sw = makeTherapist({ id: "sw", professionSlugs: ["social-worker"], languageCodes: ["he"] });
    const misfit = makeTherapist({ id: "misfit", professionSlugs: ["coach"], languageCodes: ["he"] });
    const wrongLang = makeTherapist({ id: "wrong-lang", professionSlugs: ["psychologist"], languageCodes: ["ru"] });
    const { repo } = makeRepo([psy, sw, misfit, wrongLang]);
    const out = await executeUnifiedSearch(repo, plan({
      hardFilters: {
        professionSlugs: ["psychologist", "social-worker"], modalitySlugs: [],
        populationSlugs: [], languageCodes: ["he"], deliveryModes: [],
        cityNames: [], therapistGender: null,
      },
    }));
    expect(out.results.map((r) => r.id).sort()).toEqual(["psy", "sw"]);
  });

  it("named seed + city intersects correctly", async () => {
    const named = makeTherapist({
      id: "yael", locations: [{ city: "חיפה", deliveryMode: "clinic" }],
    });
    const other = makeTherapist({
      id: "other", locations: [{ city: "חיפה", deliveryMode: "clinic" }],
    });
    const wrongCityNamed = makeTherapist({
      id: "yael-tlv", locations: [{ city: "תל אביב", deliveryMode: "clinic" }],
    });
    const { repo } = makeRepo([named, other, wrongCityNamed]);
    const out = await executeUnifiedSearch(repo, plan({
      therapistNameIds: ["yael", "yael-tlv"],
      hardFilters: {
        professionSlugs: [], modalitySlugs: [], populationSlugs: [],
        languageCodes: [], deliveryModes: [], cityNames: ["חיפה"], therapistGender: null,
      },
    }));
    expect(out.results.map((r) => r.id)).toEqual(["yael"]);
  });

  it("named seed + language intersects correctly", async () => {
    const namedRu = makeTherapist({ id: "n1", languageCodes: ["ru"] });
    const namedHe = makeTherapist({ id: "n2", languageCodes: ["he"] });
    const other = makeTherapist({ id: "n3", languageCodes: ["ru"] });
    const { repo } = makeRepo([namedRu, namedHe, other]);
    const out = await executeUnifiedSearch(repo, plan({
      therapistNameIds: ["n1", "n2"],
      hardFilters: {
        professionSlugs: [], modalitySlugs: [], populationSlugs: [],
        languageCodes: ["ru"], deliveryModes: [], cityNames: [], therapistGender: null,
      },
    }));
    expect(out.results.map((r) => r.id)).toEqual(["n1"]);
  });

  it("named seed + semantic query evaluates only the named seed", async () => {
    const namedAnxiety = makeTherapist({
      id: "named",
      storedSemanticProfile: [{ slug: "anxiety", weight: 1 }],
    });
    const unrelatedButAnxious = makeTherapist({
      id: "unrelated",
      storedSemanticProfile: [{ slug: "anxiety", weight: 1 }],
    });
    const { repo } = makeRepo([namedAnxiety, unrelatedButAnxious]);
    const out = await executeUnifiedSearch(repo, plan({
      therapistNameIds: ["named"],
      semanticSignals: [{ slug: "anxiety", confidence: 1 }],
    }));
    expect(out.results.map((r) => r.id)).toEqual(["named"]);
  });
});

/* ---------------- Eligibility ---------------- */

describe("executor: eligibility", () => {
  const anxietySignal = { semanticSignals: [{ slug: "anxiety", confidence: 1 }] };
  const profile: SemanticProfileEntry[] = [{ slug: "anxiety", weight: 1 }];

  it("excludes inactive therapist", async () => {
    const bad = makeTherapist({ id: "bad", is_active: false, storedSemanticProfile: profile });
    const good = makeTherapist({ id: "good", storedSemanticProfile: profile });
    const { repo } = makeRepo([bad, good]);
    const out = await executeUnifiedSearch(repo, plan(anxietySignal));
    expect(out.results.map((r) => r.id)).toEqual(["good"]);
  });

  it("excludes draft therapist", async () => {
    const bad = makeTherapist({ id: "bad", profile_status: "draft", storedSemanticProfile: profile });
    const good = makeTherapist({ id: "good", storedSemanticProfile: profile });
    const { repo } = makeRepo([bad, good]);
    const out = await executeUnifiedSearch(repo, plan(anxietySignal));
    expect(out.results.map((r) => r.id)).toEqual(["good"]);
  });

  it("excludes completed-but-unpublished therapist", async () => {
    const bad = makeTherapist({ id: "bad", profile_status: "completed", storedSemanticProfile: profile });
    const good = makeTherapist({ id: "good", storedSemanticProfile: profile });
    const { repo } = makeRepo([bad, good]);
    const out = await executeUnifiedSearch(repo, plan(anxietySignal));
    expect(out.results.map((r) => r.id)).toEqual(["good"]);
  });

  it("excludes hidden therapist", async () => {
    const bad = makeTherapist({ id: "bad", visibility: "hidden", storedSemanticProfile: profile });
    const good = makeTherapist({ id: "good", storedSemanticProfile: profile });
    const { repo } = makeRepo([bad, good]);
    const out = await executeUnifiedSearch(repo, plan(anxietySignal));
    expect(out.results.map((r) => r.id)).toEqual(["good"]);
  });

  it("excludes hidden_by_owner therapist", async () => {
    const bad = makeTherapist({ id: "bad", visibility: "hidden_by_owner", storedSemanticProfile: profile });
    const good = makeTherapist({ id: "good", storedSemanticProfile: profile });
    const { repo } = makeRepo([bad, good]);
    const out = await executeUnifiedSearch(repo, plan(anxietySignal));
    expect(out.results.map((r) => r.id)).toEqual(["good"]);
  });

  it("loads eligibility once per executor request", async () => {
    const t = makeTherapist({
      id: "a", professionSlugs: ["psychologist"], modalitySlugs: ["cbt"],
      populationSlugs: ["adults"], languageCodes: ["he"],
      locations: [{ city: "חיפה", deliveryMode: "clinic" }],
      storedSemanticProfile: profile, gender: "female",
    });
    const { repo, eligibleLoadCount } = makeRepo([t]);
    await executeUnifiedSearch(repo, plan({
      hardFilters: {
        professionSlugs: ["psychologist"], modalitySlugs: ["cbt"],
        populationSlugs: ["adults"], languageCodes: ["he"],
        deliveryModes: ["clinic"], cityNames: ["חיפה"], therapistGender: "female",
      },
      ...anxietySignal,
    }));
    expect(eligibleLoadCount()).toBe(1);
  });
});

/* ---------------- Safety ---------------- */

describe("executor: safety", () => {
  it("unknown query → unrecognized_query", async () => {
    const { repo } = makeRepo([makeTherapist({ id: "a" })]);
    const out = await executeUnifiedSearch(repo, plan());
    expect(out.emptyReason).toBe("unrecognized_query");
    expect(out.results).toEqual([]);
  });

  it("empty plan (unrecognized) short-circuits", async () => {
    const { repo } = makeRepo([makeTherapist({ id: "a" })]);
    const out = await executeUnifiedSearch(repo, plan({ emptyReason: "unrecognized_query" }));
    expect(out.emptyReason).toBe("unrecognized_query");
  });

  it("unsupported primary + city → zero therapists (unrecognized_query via plan)", async () => {
    const { repo } = makeRepo([
      makeTherapist({ id: "a", locations: [{ city: "חיפה", deliveryMode: "clinic" }] }),
    ]);
    const out = await executeUnifiedSearch(repo, plan({ emptyReason: "unrecognized_query" }));
    expect(out.results).toEqual([]);
    expect(out.emptyReason).toBe("unrecognized_query");
  });

  it("propagates repository errors (does not silently return empty)", async () => {
    const { repo } = makeRepo(
      [makeTherapist({ id: "a", professionSlugs: ["psychologist"] })],
      { failOn: "idsByProfessions" },
    );
    await expect(
      executeUnifiedSearch(repo, plan({
        hardFilters: {
          professionSlugs: ["psychologist"], modalitySlugs: [], populationSlugs: [],
          languageCodes: [], deliveryModes: [], cityNames: [], therapistGender: null,
        },
      })),
    ).rejects.toThrow("repo failure: idsByProfessions");
  });

  it("semantic-only search uses the full eligible set (no 500-cap)", async () => {
    // Build 600 eligible therapists, all with overlap.
    const many: FakeTherapist[] = [];
    for (let i = 0; i < 600; i++) {
      many.push(makeTherapist({
        id: `t${String(i).padStart(3, "0")}`,
        storedSemanticProfile: [{ slug: "anxiety", weight: 1 }],
      }));
    }
    const { repo } = makeRepo(many);
    const out = await executeUnifiedSearch(
      repo,
      plan({ semanticSignals: [{ slug: "anxiety", confidence: 1 }] }),
      50,
    );
    // Executor caps at `limit` (50) but must have RANKED over the full 600
    // seed. Deterministic tiebreak by therapistId ascending → t000..t049.
    expect(out.results.length).toBe(50);
    expect(out.results[0].id).toBe("t000");
    expect(out.results[49].id).toBe("t049");
  });
});

/* ---------------- Ranking & preferences ---------------- */

describe("executor: ranking & preferences", () => {
  it("a soft preference never filters a candidate", async () => {
    const noMatch = makeTherapist({
      id: "a",
      professionSlugs: ["psychologist"], modalitySlugs: [],
      storedSemanticProfile: [{ slug: "anxiety", weight: 1 }],
    });
    const { repo } = makeRepo([noMatch]);
    const out = await executeUnifiedSearch(repo, plan({
      softPreferences: {
        professionSlugs: [], modalitySlugs: ["cbt"],
        populationSlugs: [], languageCodes: [], cities: [],
        deliveryModes: [], genders: [],
      },
      semanticSignals: [{ slug: "anxiety", confidence: 1 }],
    }));
    expect(out.results.map((r) => r.id)).toEqual(["a"]);
  });

  it("multiple matches in one preference category contribute one bucket", async () => {
    const t = makeTherapist({
      id: "a", professionSlugs: ["psychologist", "social-worker"],
      storedSemanticProfile: [{ slug: "anxiety", weight: 1 }],
    });
    const { repo } = makeRepo([t]);
    const out = await executeUnifiedSearch(repo, plan({
      softPreferences: {
        professionSlugs: ["psychologist", "social-worker"], modalitySlugs: [],
        populationSlugs: [], languageCodes: [], cities: [],
        deliveryModes: [], genders: [],
      },
      semanticSignals: [{ slug: "anxiety", confidence: 1 }],
    }));
    // One category → exactly one point, never two.
    expect(out.results[0].scores.preference).toBe(1);
  });

  it("a full seven-category preference match scores 7", async () => {
    const t = makeTherapist({
      id: "a",
      professionSlugs: ["psychologist"], modalitySlugs: ["cbt"],
      populationSlugs: ["adults"], languageCodes: ["he"],
      locations: [{ city: "חיפה", deliveryMode: "online" }],
      gender: "female",
      storedSemanticProfile: [{ slug: "anxiety", weight: 1 }],
    });
    const { repo } = makeRepo([t]);
    const out = await executeUnifiedSearch(repo, plan({
      softPreferences: {
        professionSlugs: ["psychologist"], modalitySlugs: ["cbt"],
        populationSlugs: ["adults"], languageCodes: ["he"],
        cities: ["חיפה"], deliveryModes: ["online"], genders: ["female"],
      },
      semanticSignals: [{ slug: "anxiety", confidence: 1 }],
    }));
    // Seven categories × 1 point = 7, the maximum possible score.
    expect(out.results[0].scores.preference).toBe(7);
  });

  it("equal scores sort by therapistId ascending", async () => {
    const a = makeTherapist({ id: "zzz", storedSemanticProfile: [{ slug: "x", weight: 1 }] });
    const b = makeTherapist({ id: "aaa", storedSemanticProfile: [{ slug: "x", weight: 1 }] });
    const { repo } = makeRepo([a, b]);
    const out = await executeUnifiedSearch(repo, plan({
      semanticSignals: [{ slug: "x", confidence: 1 }],
    }));
    expect(out.results.map((r) => r.id)).toEqual(["aaa", "zzz"]);
  });

  it("display rows returned in a different order are reconstructed in ranked order", async () => {
    const strong = makeTherapist({
      id: "aaa", storedSemanticProfile: [{ slug: "x", weight: 1 }],
    });
    const weak = makeTherapist({
      id: "bbb", storedSemanticProfile: [{ slug: "x", weight: 0.1 }],
    });
    // makeRepo.fetchDisplay reverses; ranked order is strong then weak.
    const { repo } = makeRepo([strong, weak]);
    const out = await executeUnifiedSearch(repo, plan({
      semanticSignals: [{ slug: "x", confidence: 1 }],
    }));
    expect(out.results.map((r) => r.id)).toEqual(["aaa", "bbb"]);
  });

  it("experience does not affect qualityScore; only the experience tier", async () => {
    // Two candidates tie on semantic + preference + qualityScore, and
    // differ only on yearsExperience. The experience-only difference
    // must dictate order.
    const short = makeTherapist({
      id: "short",
      storedSemanticProfile: [{ slug: "x", weight: 1 }],
      yearsExperience: 1,
      verified: false, bioLength: 0,
    });
    const long = makeTherapist({
      id: "long",
      storedSemanticProfile: [{ slug: "x", weight: 1 }],
      yearsExperience: 25,
      verified: false, bioLength: 0,
    });
    const { repo } = makeRepo([short, long]);
    const out = await executeUnifiedSearch(repo, plan({
      semanticSignals: [{ slug: "x", confidence: 1 }],
    }));
    expect(out.results[0].id).toBe("long");
    // Also assert equal qualityScore — proving experience does not leak
    // into qualityScore.
    expect(out.results[0].scores.quality).toBe(out.results[1].scores.quality);
  });
});