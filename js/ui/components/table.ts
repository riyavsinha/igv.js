/**
 * Create a table with an optional row click handler
 */

interface TableConfig {
    headers: string[]
    rows: string[][]
    rowClickHandler?: (rowData: string[]) => void
}

function createTable(tableConfig: TableConfig): HTMLTableElement {

    const table = document.createElement("table")
    table.classList.add("igv-ui-table")
    table.id = "variant_table"

    const thead = document.createElement('thead')
    table.appendChild(thead)
    const headerRow = thead.insertRow(0)

    const headers = tableConfig.headers
    for (let j = 0; j < headers.length; j++) {
        const cell = document.createElement("th")
        headerRow.appendChild(cell)
        cell.innerHTML = headers[j]
    }

    const tbody = document.createElement('tbody')
    table.appendChild(tbody)
    const tableRows = tableConfig.rows
    for (let rowData of tableRows) {

        const row = document.createElement("tr")
        tbody.appendChild(row)

        for (let j = 0; j < headers.length; j++) {
            const value = rowData[j]
            const cell = document.createElement("td")
            row.appendChild(cell)
            cell.innerHTML = value
        }

        if (tableConfig.rowClickHandler) {
            row.onclick = (event) => {
                tableConfig.rowClickHandler!(rowData)
            }
        }
    }

    return table

}

export {createTable}
