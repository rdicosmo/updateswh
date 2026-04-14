import { NAV_POLL_MS } from "../constants.js";

export function onNavigation(callback) {
    let lastHref = window.location.href;

    const fire = () => {
        const current = window.location.href;
        if (current !== lastHref) {
            lastHref = current;
            callback(current);
        }
    };

    window.addEventListener("popstate", fire);
    document.addEventListener("turbo:load", fire);
    document.addEventListener("turbo:render", fire);
    const intervalId = window.setInterval(fire, NAV_POLL_MS);

    return () => {
        window.removeEventListener("popstate", fire);
        document.removeEventListener("turbo:load", fire);
        document.removeEventListener("turbo:render", fire);
        window.clearInterval(intervalId);
    };
}
