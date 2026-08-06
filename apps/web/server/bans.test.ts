import { afterEach, describe, expect, it, vi } from "vitest";

import { isActiveBan, requireNoActiveBan } from "./bans";
import { type Doc, store } from "./store";

function ban(status?: string): Doc {
  return {
    id: "ban-123",
    status
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isActiveBan", () => {
  it("treats an active ban as active", () => {
    expect(isActiveBan(ban("active"))).toBe(true);
  });

  it("treats an older ban without status as active", () => {
    expect(isActiveBan(ban())).toBe(true);
  });

  it("treats a lifted ban as inactive", () => {
    expect(isActiveBan(ban("lifted"))).toBe(false);
  });
});

describe("requireNoActiveBan", () => {
  it("allows a user with no bans", async () => {
    vi.spyOn(store, "findByField").mockResolvedValue([]);

    await expect(requireNoActiveBan("user-123")).resolves.toBeUndefined();

    expect(store.findByField).toHaveBeenCalledWith(
      "bans",
      "user_id",
      "user-123"
    );
  });

  it("allows a user whose bans are all lifted", async () => {
    vi.spyOn(store, "findByField").mockResolvedValue([
      ban("lifted")
    ]);

    await expect(requireNoActiveBan("user-123")).resolves.toBeUndefined();
  });

  it("blocks a user with an active ban", async () => {
    vi.spyOn(store, "findByField").mockResolvedValue([
      ban("active")
    ]);

    await expect(requireNoActiveBan("user-123")).rejects.toThrow(
      "Access is suspended."
    );
  });

  it("blocks when any one of multiple bans is active", async () => {
    vi.spyOn(store, "findByField").mockResolvedValue([
      ban("lifted"),
      ban("active")
    ]);

    await expect(requireNoActiveBan("user-123")).rejects.toThrow(
      "Access is suspended."
    );
  });
});
