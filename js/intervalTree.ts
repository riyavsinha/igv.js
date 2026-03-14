/** An implementation of an interval tree, following the explanation.
 * from CLR.
 *
 * Public interface:
 *   Constructor  IntervalTree
 *   Insertion    insert
 *   Search       findOverlapping
 */

const BLACK = 1
const RED = 2

interface TreeNode {
    color: number
    parent: TreeNode
    left: TreeNode
    right: TreeNode
    interval: Interval
    max: number
    min: number
}

const NIL = {} as TreeNode
NIL.color = BLACK
NIL.parent = NIL
NIL.left = NIL
NIL.right = NIL


class IntervalTree {
    root: TreeNode

    constructor() {
        this.root = NIL
    }

    insert(start: number, end: number, value: unknown): void {

        var interval = new Interval(start, end, value)
        var x = createNode(interval)
        this.treeInsert(x)
        x.color = RED
        while (x !== this.root && x.parent.color === RED) {
            if (x.parent === x.parent.parent.left) {
                let y = x.parent.parent.right
                if (y.color === RED) {
                    x.parent.color = BLACK
                    y.color = BLACK
                    x.parent.parent.color = RED
                    x = x.parent.parent
                } else {
                    if (x === x.parent.right) {
                        x = x.parent
                        leftRotate.call(this, x)
                    }
                    x.parent.color = BLACK
                    x.parent.parent.color = RED
                    rightRotate.call(this, x.parent.parent)
                }
            } else {
                let y = x.parent.parent.left
                if (y.color === RED) {
                    x.parent.color = BLACK
                    y.color = BLACK
                    x.parent.parent.color = RED
                    x = x.parent.parent
                } else {
                    if (x === x.parent.left) {
                        x = x.parent
                        rightRotate.call(this, x)
                    }
                    x.parent.color = BLACK
                    x.parent.parent.color = RED
                    leftRotate.call(this, x.parent.parent)
                }
            }
        }
        this.root.color = BLACK
    }

    /**
     *
     * @param start - query interval
     * @param end - query interval
     * @returns Array of all intervals overlapping the query region
     */
    findOverlapping(start: number, end: number): Interval[] {


        var searchInterval = new Interval(start, end, 0)

        if (this.root === NIL) return []

        var intervals = searchAll.call(this, searchInterval, this.root, [])

        if (intervals.length > 1) {
            intervals.sort(function (i1: Interval, i2: Interval) {
                return i1.low - i2.low
            })
        }

        return intervals
    }

    /**
     * Dump info on intervals to console.  For debugging.
     */
    logIntervals(): void {

        logNode(this.root, 0)

        function logNode(node: TreeNode, indent: number): void {

            var space = ""
            for (var i = 0; i < indent; i++) space += " "
            console.log(space + node.interval.low + " " + node.interval.high)

            indent += 5

            if (node.left !== NIL) logNode(node.left, indent)
            if (node.right !== NIL) logNode(node.right, indent)
        }

    }

    mapIntervals(func: (interval: Interval) => void): void {

        applyInterval(this.root)

        function applyInterval(node: TreeNode): void {

            func(node.interval)

            if (node.left !== NIL) applyInterval(node.left)
            if (node.right !== NIL) applyInterval(node.right)
        }
    }


    /**
     * Note:  Does not maintain RB constraints,  this is done post insert
     *
     * @param x  a Node
     */
    treeInsert(x: TreeNode): void {
        var node = this.root
        var y = NIL
        while (node !== NIL) {
            y = node
            if (x.interval.low <= node.interval.low) {
                node = node.left
            } else {
                node = node.right
            }
        }
        x.parent = y

        if (y === NIL) {
            this.root = x
            x.left = x.right = NIL
        } else {
            if (x.interval.low <= y.interval.low) {
                y.left = x
            } else {
                y.right = x
            }
        }

        applyUpdate.call(this, x)
    }
}

function searchAll(this: IntervalTree, interval: Interval, node: TreeNode, results: Interval[]): Interval[] {

    if (node.interval.overlaps(interval)) {
        results.push(node.interval)
    }

    if (node.left !== NIL && node.left.max >= interval.low) {
        searchAll.call(this, interval, node.left, results)
    }

    if (node.right !== NIL && node.right.min <= interval.high) {
        searchAll.call(this, interval, node.right, results)
    }

    return results
}

function leftRotate(this: IntervalTree, x: TreeNode): void {
    var y = x.right
    x.right = y.left
    if (y.left !== NIL) {
        y.left.parent = x
    }
    y.parent = x.parent
    if (x.parent === NIL) {
        this.root = y
    } else {
        if (x.parent.left === x) {
            x.parent.left = y
        } else {
            x.parent.right = y
        }
    }
    y.left = x
    x.parent = y

    applyUpdate.call(this, x)
}


function rightRotate(this: IntervalTree, x: TreeNode): void {
    var y = x.left
    x.left = y.right
    if (y.right !== NIL) {
        y.right.parent = x
    }
    y.parent = x.parent
    if (x.parent === NIL) {
        this.root = y
    } else {
        if (x.parent.right === x) {
            x.parent.right = y
        } else {
            x.parent.left = y
        }
    }
    y.right = x
    x.parent = y


    applyUpdate.call(this, x)
}


// Applies the statistic update on the node and its ancestors.
function applyUpdate(this: IntervalTree, node: TreeNode): void {
    while (node !== NIL) {
        var nodeMax = node.left.max > node.right.max ? node.left.max : node.right.max
        var intervalHigh = node.interval.high
        node.max = nodeMax > intervalHigh ? nodeMax : intervalHigh

        var nodeMin = node.left.min < node.right.min ? node.left.min : node.right.min
        var intervalLow = node.interval.low
        node.min = nodeMin < intervalLow ? nodeMin : intervalLow

        node = node.parent
    }
}


class Interval {
    low: number
    high: number
    value: unknown

    constructor(low: number, high: number, value: unknown) {
        this.low = low
        this.high = high
        this.value = value
    }

    equals(other: Interval | null | undefined): boolean {
        if (!other) {
            return false
        }
        if (this === other) {
            return true
        }
        return (this.low === other.low &&
            this.high === other.high)

    }

    compareTo(other: Interval): number {
        if (this.low < other.low)
            return -1
        if (this.low > other.low)
            return 1

        if (this.high < other.high)
            return -1
        if (this.high > other.high)
            return 1

        return 0
    }

    /**
     * Returns true if this interval overlaps the other.
     */
    overlaps(other: Interval): boolean {
        return (this.low <= other.high && other.low <= this.high)
    }
}

function createNode(interval: Interval): TreeNode {
    return {
        parent: NIL,
        left: NIL,
        right: NIL,
        interval: interval,
        color: RED,
        max: interval.high,
        min: interval.low
    }
}

export default IntervalTree
