
interface CreateElementOptions {
    class?: string
    id?: string
    style?: Record<string, string>
}

function createElementWithString(htmlString: string): Element | null {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    return tempDiv.firstElementChild;
}

function div(options?: CreateElementOptions): HTMLDivElement {
    return create("div", options) as HTMLDivElement;
}

function create(tag: string, options?: CreateElementOptions): HTMLElement {
    const elem = document.createElement(tag);
    if (options) {
        if (options.class) {
            elem.classList.add(options.class);
        }
        if (options.id) {
            elem.id = options.id;
        }
        if(options.style) {
            applyStyle(elem, options.style);
        }
    }
    return elem;
}

function hide(elem: HTMLElement): void {
    const cssStyle = getComputedStyle(elem);
    if(cssStyle.display !== "none") {
        (elem as any)._initialDisplay = cssStyle.display;
    }
    elem.style.display = "none";
}

function show(elem: HTMLElement): void {
    const d = (elem as any)._initialDisplay || "block";
    elem.style.display = d;
}

function empty(elem: HTMLElement): void {
    while(elem.firstChild){
        elem.removeChild(elem.firstChild);
    }
}

function offset(elem: HTMLElement): {top: number, left: number} {
    // Return zeros for disconnected and hidden (display: none) elements (gh-2310)
    if (!elem.getClientRects().length) {
        return {top: 0, left: 0};
    }

    const rect = elem.getBoundingClientRect();
    const win = elem.ownerDocument.defaultView!;
    return {
        top: rect.top + win.pageYOffset,
        left: rect.left + win.pageXOffset
    };
}

function pageCoordinates(e: MouseEvent | TouchEvent): {x: number, y: number} {

    if (e.type.startsWith("touch")) {
        const touch = (e as TouchEvent).touches[0];
        return {x: touch.pageX, y: touch.pageY};
    } else {
        return {x: (e as MouseEvent).pageX, y: (e as MouseEvent).pageY}
    }
}

const relativeDOMBBox = (parentElement: HTMLElement, childElement: HTMLElement): {x: number, y: number, width: number, height: number} => {
    const { x: x_p, y: y_p, width: width_p, height: height_p } = parentElement.getBoundingClientRect();
    const { x: x_c, y: y_c, width: width_c, height: height_c } = childElement.getBoundingClientRect();
    return { x: (x_c - x_p), y: (y_c - y_p), width: width_c, height:height_c };
};

function applyStyle(elem: HTMLElement, style: Record<string, string>): void {
    for (let key of Object.keys(style)) {
        (elem.style as any)[key] = style[key];
    }
}

function guid(): string {
    return ("0000" + (Math.random() * Math.pow(36, 4) << 0).toString(36)).slice(-4);
}

let getMouseXY = (domElement: HTMLElement, { clientX, clientY }: {clientX: number, clientY: number}) => {

    const { left, top, width, height } = domElement.getBoundingClientRect();

    const x = clientX - left;
    const y = clientY - top;
    return { x, y, xNormalized: x/width, yNormalized: y/height, width, height };

};

/**
 * Translate the mouse coordinates for the event to the coordinates for the given target element
 */
function translateMouseCoordinates(event: MouseEvent, domElement: HTMLElement) {

    const { clientX, clientY } = event;
    return getMouseXY(domElement, { clientX, clientY });

}

export { createElementWithString, create, div, hide, show, offset, empty, pageCoordinates, relativeDOMBBox,
    applyStyle, guid, translateMouseCoordinates }
