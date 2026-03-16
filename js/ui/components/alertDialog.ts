import DOMPurify from "../../../node_modules/dompurify/dist/purify.es.mjs"
import makeDraggable from "../utils/draggable.js"

const httpMessages: Record<string, string> =
    {
        "401": "Access unauthorized",
        "403": "Access forbidden",
        "404": "Not found"
    };

interface AlertProps {
    shouldFocus: boolean
    preventScroll: boolean
}

class AlertDialog {

    alertProps: AlertProps
    container: HTMLDivElement
    errorHeadline: HTMLDivElement
    body: HTMLDivElement
    ok: HTMLDivElement
    callback: ((value: string) => void) | undefined

    constructor(parent: HTMLElement, alertProps?: Partial<AlertProps>) {
        this.alertProps = Object.assign({
            shouldFocus: true,
            preventScroll: false
        }, alertProps);

        // container
        this.container = document.createElement('div');
        this.container.className = "igv-ui-alert-dialog-container";
        parent.appendChild(this.container);
        this.container.setAttribute('tabIndex', '-1');

        // header
        const header = document.createElement('div');
        this.container.appendChild(header);

        this.errorHeadline = document.createElement('div');
        header.appendChild(this.errorHeadline);
        this.errorHeadline.textContent = '';

        // body container
        let bodyContainer = document.createElement('div');
        bodyContainer.className = 'igv-ui-alert-dialog-body';
        this.container.appendChild(bodyContainer);

        // body copy
        this.body = document.createElement('div');
        this.body.className = 'igv-ui-alert-dialog-body-copy';
        bodyContainer.appendChild(this.body);

        // ok container
        let ok_container = document.createElement('div');
        this.container.appendChild(ok_container);

        // ok
        this.ok = document.createElement('div');
        ok_container.appendChild(this.ok);
        this.ok.textContent = 'OK';

        const okHandler = (): void => {

            if (typeof this.callback === 'function') {
                this.callback("OK");
                this.callback = undefined;
            }
            this.body.innerHTML = '';
            this.container.style.display = 'none'
        }

        this.ok.addEventListener('click', (event: Event) => {
            event.stopPropagation()
            okHandler()
        });

        this.container.addEventListener('keypress', (event: KeyboardEvent) => {
            event.stopPropagation()
            if ('Enter' === event.key) {
                okHandler()
            }
        });

        makeDraggable(this.container, header);

        this.container.style.display = 'none'
    }

    present(alert: Error | string, callback?: (value: string) => void): void {

        const message = alert instanceof Error ? alert.message : undefined
        this.errorHeadline.textContent = message ? 'ERROR' : ''
        let string: string = message || (alert as string)

        if (httpMessages.hasOwnProperty(string)) {
            string = httpMessages[string];
        }

        this.body.innerHTML = DOMPurify.sanitize(string)

        this.callback = callback
        this.container.style.display = 'flex'
        if (this.alertProps.shouldFocus) {
            this.container.focus({ preventScroll: this.alertProps.preventScroll })
        }
    }
}

export default AlertDialog;
