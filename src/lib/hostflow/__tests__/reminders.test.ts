import { describe, it, expect } from "vitest";
import { reminderWindow, reminderCopy } from "../reminders";

describe("reminders", () => {
  it("targets bookings 20–28 hours ahead (hourly cron catches each once)", () => {
    const now = new Date("2026-10-27T10:00:00Z");
    const { from, to } = reminderWindow(now);
    expect(from.toISOString()).toBe("2026-10-28T06:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-28T14:00:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(8 * 3600_000);
  });
  it("writes the reminder in the guest's language", () => {
    const p = { firstName: "Ana", venue: "Mantra", date: "2026-10-28", time: "20:00", partySize: 4 };
    expect(reminderCopy("es", p).subject).toContain("mañana");
    expect(reminderCopy("en", p).subject).toBe("Your table at Mantra is tomorrow at 20:00");
    expect(reminderCopy("en", p).confirm).toBe("Yes, we're coming");
  });
});
