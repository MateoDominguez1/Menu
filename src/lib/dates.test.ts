import { describe, expect, it } from "vitest";
import { addDays, isValidISODate, mondayOf, todayISO, weekDays } from "./dates";

describe("dates", () => {
  it("calcula el lunes de cualquier dia de la semana", () => {
    expect(mondayOf("2026-10-21")).toBe("2026-10-19"); // miercoles
    expect(mondayOf("2026-10-19")).toBe("2026-10-19"); // lunes
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // domingo
  });

  it("suma dias cruzando meses", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });

  it("genera la semana completa", () => {
    expect(weekDays("2026-10-19")).toHaveLength(7);
    expect(weekDays("2026-10-19")[6]).toBe("2026-10-25");
  });

  it("valida fechas", () => {
    expect(isValidISODate("2026-10-21")).toBe(true);
    expect(isValidISODate("21/10/2026")).toBe(false);
  });

  it("usa la fecha de Roma, no la UTC, cerca de la medianoche", () => {
    expect(todayISO(new Date("2026-10-20T22:30:00Z"))).toBe("2026-10-21");
  });
});
