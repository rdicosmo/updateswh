/**
 * Tests for the grant-button UI added in RP-E.
 * Uses jsdom — no real browser chrome.permissions, so we stub it.
 */

/* Stub chrome before importing ui.js (it imports permissions.js which probes chrome) */
beforeEach(() => {
    globalThis.chrome = {
        permissions: {
            contains: jest.fn((_req, cb) => cb(false)),
            request:  jest.fn((_req, cb) => cb(true)),
            remove:   jest.fn((_req, cb) => cb(true)),
            getAll:   jest.fn((cb) => cb({ origins: [] })),
        },
        runtime: { sendMessage: jest.fn() },
    };
    document.body.innerHTML = "";
});

afterEach(() => {
    delete globalThis.chrome;
    document.body.innerHTML = "";
});

/* Dynamic import so the stub is in place before module-level probes */
let ui;
beforeAll(async () => {
    globalThis.chrome = {
        permissions: {
            contains: jest.fn((_req, cb) => cb(false)),
            request:  jest.fn((_req, cb) => cb(true)),
            remove:   jest.fn((_req, cb) => cb(true)),
            getAll:   jest.fn((cb) => cb({ origins: [] })),
        },
        runtime: { sendMessage: jest.fn() },
    };
    ui = await import("../../src/content/ui.js");
});

describe("grant button", () => {
    test("insertGrantButton appends a .swh-grant-button to the body", () => {
        ui.insertGrantButton("github.com");
        expect(document.querySelector(".swh-grant-button")).not.toBeNull();
    });

    test("grantButtonPresent returns true when button exists", () => {
        expect(ui.grantButtonPresent()).toBe(false);
        ui.insertGrantButton("github.com");
        expect(ui.grantButtonPresent()).toBe(true);
    });

    test("removeGrantButton removes the button", () => {
        ui.insertGrantButton("github.com");
        ui.removeGrantButton();
        expect(document.querySelector(".swh-grant-button")).toBeNull();
        expect(ui.grantButtonPresent()).toBe(false);
    });

    test("insertGrantButton is idempotent", () => {
        ui.insertGrantButton("github.com");
        ui.insertGrantButton("github.com");
        expect(document.querySelectorAll(".swh-grant-button").length).toBe(1);
    });

    test("tooltip mentions the forge domain", () => {
        ui.insertGrantButton("gitlab.com");
        const btn = document.querySelector(".swh-grant-button");
        expect(btn.getAttribute("title")).toContain("gitlab.com");
    });

    test("clicking the button opens the options page", () => {
        ui.insertGrantButton("github.com");
        const btn = document.querySelector(".swh-grant-button");
        btn.click();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
            { type: "OPEN_OPTIONS" },
        );
    });

    test("grant button does not appear if save icon already present", () => {
        // Insert a fake save icon
        const fake = document.createElement("div");
        fake.className = "swh-save-button";
        document.body.appendChild(fake);

        ui.insertGrantButton("github.com");
        expect(document.querySelector(".swh-grant-button")).toBeNull();
    });
});
