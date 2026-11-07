/** @jest-environment node */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkStoreText, manifestVersion, SUMMARY_MAX } from "../../build/check-store-text.js";

let root;

function write(rel, text) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), text);
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "updateswh-store-"));
    write("store/description.txt", "A description.\n");
    write("store/summary.txt", "A summary.\n");
    write("store/notes/1.2.3.txt", "A fix.\n");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("checkStoreText", () => {
    test("complete store text passes", () => {
        expect(checkStoreText(root, "1.2.3")).toEqual([]);
    });

    test("missing release notes fail, naming the file", () => {
        expect(checkStoreText(root, "1.2.4")).toEqual([
            expect.stringContaining("store/notes/1.2.4.txt is missing or empty"),
        ]);
    });

    test("whitespace-only release notes fail", () => {
        write("store/notes/1.2.3.txt", " \n\n");
        expect(checkStoreText(root, "1.2.3")).toEqual([expect.stringContaining("store/notes/1.2.3.txt")]);
    });

    test("a summary at the limit passes, one character over fails", () => {
        write("store/summary.txt", "x".repeat(SUMMARY_MAX) + "\n");
        expect(checkStoreText(root, "1.2.3")).toEqual([]);
        write("store/summary.txt", "x".repeat(SUMMARY_MAX + 1) + "\n");
        expect(checkStoreText(root, "1.2.3")).toEqual([
            expect.stringContaining(`has ${SUMMARY_MAX + 1} characters`),
        ]);
    });

    test("the summary limit is the Chrome Web Store one", () => {
        expect(SUMMARY_MAX).toBe(132);
    });

    test("a multi-line summary fails", () => {
        write("store/summary.txt", "one\ntwo\n");
        expect(checkStoreText(root, "1.2.3")).toEqual([expect.stringContaining("single line")]);
    });

    test("missing description and summary fail", () => {
        rmSync(join(root, "store/description.txt"));
        rmSync(join(root, "store/summary.txt"));
        expect(checkStoreText(root, "1.2.3")).toEqual([
            expect.stringContaining("store/description.txt"),
            expect.stringContaining("store/summary.txt"),
        ]);
    });

    test("a version that is not a number is refused", () => {
        expect(checkStoreText(root, "../x")).toEqual([expect.stringContaining("not a version number")]);
    });

    test("the repository carries store text for its own version", () => {
        const repo = join(__dirname, "../..");
        expect(checkStoreText(repo, manifestVersion(repo))).toEqual([]);
    });
});
