import {createIcon} from "./icons.js";

function attachDialogCloseHandlerWithParent(parent: HTMLElement, closeHandler: () => void): void {

    var container = document.createElement("div");
    parent.appendChild(container);
    container.appendChild(createIcon("times"));
    container.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeHandler()
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throttle<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => ReturnType<T> | undefined {
    let last = 0;
    return (...args: Parameters<T>) => {
        const now = new Date().getTime();
        if (now - last < delay) {
            return;
        }
        last = now;
        return fn(...args);
    };
}

export {attachDialogCloseHandlerWithParent, throttle}
