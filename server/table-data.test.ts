import { describe, expect, it } from "vitest";
import { normalizeTableRows } from "./table-data.js";

type Row = { id: number; name: string };

describe("normalizeTableRows", () => {
  it("filters null slots and non-record values from Firebase arrays", () => {
    const rows: unknown[] = [
      { id: 1, name: "واحد" },
      null,
      { id: 2, name: "اثنان" },
      "invalid",
      ["not-a-record"],
    ];

    expect(normalizeTableRows<Row>(rows)).toEqual([
      { id: 1, name: "واحد" },
      { id: 2, name: "اثنان" },
    ]);
  });

  it("filters null children from numeric-key Firebase objects", () => {
    const rows = {
      "1": { id: 1, name: "واحد" },
      "2": null,
      "3": { id: 3, name: "ثلاثة" },
    };

    expect(normalizeTableRows<Row>(rows)).toEqual([
      { id: 1, name: "واحد" },
      { id: 3, name: "ثلاثة" },
    ]);
  });

  it("returns an empty list for a missing or invalid table value", () => {
    expect(normalizeTableRows<Row>(null)).toEqual([]);
    expect(normalizeTableRows<Row>(undefined)).toEqual([]);
    expect(normalizeTableRows<Row>("invalid")).toEqual([]);
  });
});
