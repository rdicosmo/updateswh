/**
 * @jest-environment jsdom
 */
import { onNavigation } from "../../src/content/navigation.js";

describe("onNavigation", () => {
    let unsubscribe;

    beforeEach(() => {
        jest.useFakeTimers();
        window.history.replaceState({}, "", "/start");
    });

    afterEach(() => {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        jest.useRealTimers();
    });

    test("fires callback on popstate when URL changes", () => {
        const cb = jest.fn();
        unsubscribe = onNavigation(cb);

        window.history.pushState({}, "", "/next");
        window.dispatchEvent(new PopStateEvent("popstate"));

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb.mock.calls[0][0]).toMatch(/\/next$/);
    });

    test("fires callback on turbo:load when URL changes", () => {
        const cb = jest.fn();
        unsubscribe = onNavigation(cb);

        window.history.pushState({}, "", "/turbo");
        document.dispatchEvent(new Event("turbo:load"));

        expect(cb).toHaveBeenCalledTimes(1);
    });

    test("fires callback on turbo:render when URL changes", () => {
        const cb = jest.fn();
        unsubscribe = onNavigation(cb);

        window.history.pushState({}, "", "/render");
        document.dispatchEvent(new Event("turbo:render"));

        expect(cb).toHaveBeenCalledTimes(1);
    });

    test("fires callback via 500ms polling when no event fires", () => {
        const cb = jest.fn();
        unsubscribe = onNavigation(cb);

        window.history.pushState({}, "", "/silent");
        expect(cb).not.toHaveBeenCalled();

        jest.advanceTimersByTime(500);
        expect(cb).toHaveBeenCalledTimes(1);
    });

    test("does not fire on repeated events when URL is unchanged", () => {
        const cb = jest.fn();
        unsubscribe = onNavigation(cb);

        window.dispatchEvent(new PopStateEvent("popstate"));
        document.dispatchEvent(new Event("turbo:load"));
        jest.advanceTimersByTime(2000);

        expect(cb).not.toHaveBeenCalled();
    });

    test("fires once per URL change even when multiple events arrive", () => {
        const cb = jest.fn();
        unsubscribe = onNavigation(cb);

        window.history.pushState({}, "", "/multi");
        window.dispatchEvent(new PopStateEvent("popstate"));
        document.dispatchEvent(new Event("turbo:load"));
        document.dispatchEvent(new Event("turbo:render"));
        jest.advanceTimersByTime(500);

        expect(cb).toHaveBeenCalledTimes(1);
    });

    test("unsubscribe stops listeners and poll", () => {
        const cb = jest.fn();
        const stop = onNavigation(cb);
        stop();
        unsubscribe = null;

        window.history.pushState({}, "", "/afterstop");
        window.dispatchEvent(new PopStateEvent("popstate"));
        document.dispatchEvent(new Event("turbo:load"));
        jest.advanceTimersByTime(2000);

        expect(cb).not.toHaveBeenCalled();
    });
});
