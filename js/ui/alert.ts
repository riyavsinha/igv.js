import AlertDialog from "./components/alertDialog.js"

class Alert {
    dialog: AlertDialog

    constructor(parent: HTMLElement) {
        this.dialog = new AlertDialog(parent)

    }

    present(alert: any, callback?: () => void): void {
        this.dialog.present(alert, callback)
    }
}

export default Alert
