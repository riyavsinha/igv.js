/** An implementation of an interval tree, following the explanation.
 * from CLR.
 *
 * Public interface:
 *   Constructor  IntervalTree
 *   Insertion    insert
 *   Search       findOverlapping
 */

const BLACK: number = 1;
const RED: number = 2;

interface NILNode {
    color: number;
    parent: NILNode | NodeLike;
    left: NILNode | NodeLike;
    right: NILNode | NodeLike;
    max: number;
    min: number;
    interval: Interval;
}

var NIL = {} as NILNode
NIL.color = BLACK;
NIL.parent = NIL;
NIL.left = NIL;
NIL.right = NIL;


class IntervalTree {

    root: NodeLike | NILNode;

    constructor() {
        this.root = NIL;
    }

    insert(start: number, end: number, value: unknown): void {

        var interval = new Interval(start, end, value);
        var x = new Node(interval);
        this.treeInsert(x);
        x.color = RED;
        while (x !== this.root && (x.parent as NodeLike).color === RED) {
            if (x.parent === (x.parent as NodeLike).parent.left) {
                let y = (x.parent as NodeLike).parent.right;
                if (y.color === RED) {
                    (x.parent as NodeLike).color = BLACK;
                    y.color = BLACK;
                    (x.parent as NodeLike).parent.color = RED;
                    x = (x.parent as NodeLike).parent;
                } else {
                    if (x === (x.parent as NodeLike).right) {
                        x = x.parent as NodeLike;
                        leftRotate.call(this, x);
                    }
                    (x.parent as NodeLike).color = BLACK;
                    (x.parent as NodeLike).parent.color = RED;
                    rightRotate.call(this, (x.parent as NodeLike).parent);
                }
            } else {
                let y = (x.parent as NodeLike).parent.left;
                if (y.color === RED) {
                    (x.parent as NodeLike).color = BLACK;
                    y.color = BLACK;
                    (x.parent as NodeLike).parent.color = RED;
                    x = (x.parent as NodeLike).parent;
                } else {
                    if (x === (x.parent as NodeLike).left) {
                        x = x.parent as NodeLike;
                        rightRotate.call(this, x);
                    }
                    (x.parent as NodeLike).color = BLACK;
                    (x.parent as NodeLike).parent.color = RED;
                    leftRotate.call(this, (x.parent as NodeLike).parent);
                }
            }
        }
        this.root.color = BLACK;
    }

    /**
     *
     * @param start - query interval
     * @param end - query interval
     * @returns Array of all intervals overlapping the query region
     */
    findOverlapping(start: number, end: number): Interval[] {


        var searchInterval = new Interval(start, end, 0);

        if (this.root === NIL) return [];

        var intervals = searchAll.call(this, searchInterval, this.root, []);

        if (intervals.length > 1) {
            intervals.sort(function (i1: Interval, i2: Interval) {
                return i1.low - i2.low;
            });
        }

        return intervals;
    }

    /**
     * Dump info on intervals to console.  For debugging.
     */
    logIntervals(): void {

        logNode(this.root, 0);

        function logNode(node: NodeLike | NILNode, indent: number): void {

            var space = "";
            for (var i = 0; i < indent; i++) space += " ";
            console.log(space + (node as NodeLike).interval.low + " " + (node as NodeLike).interval.high);

            indent += 5;

            if (node.left !== NIL) logNode(node.left, indent);
            if (node.right !== NIL) logNode(node.right, indent);
        }

    }

    mapIntervals(func: (interval: Interval) => void): void {

        applyInterval(this.root);

        function applyInterval(node: NodeLike | NILNode): void {

            func((node as NodeLike).interval);

            if (node.left !== NIL) applyInterval(node.left);
            if (node.right !== NIL) applyInterval(node.right);
        }
    }


    /**
     * Note:  Does not maintain RB constraints,  this is done post insert
     *
     * @param x  a Node
     */
    treeInsert(x: NodeLike): void {
        var node: NodeLike | NILNode = this.root;
        var y: NodeLike | NILNode = NIL;
        while (node !== NIL) {
            y = node;
            if (x.interval.low <= (node as NodeLike).interval.low) {
                node = (node as NodeLike).left;
            } else {
                node = (node as NodeLike).right;
            }
        }
        x.parent = y;

        if (y === NIL) {
            this.root = x;
            x.left = x.right = NIL;
        } else {
            if (x.interval.low <= (y as NodeLike).interval.low) {
                (y as NodeLike).left = x;
            } else {
                (y as NodeLike).right = x;
            }
        }

        applyUpdate.call(this, x);
    }
}

function searchAll(this: IntervalTree, interval: Interval, node: NodeLike | NILNode, results: Interval[]): Interval[] {

    if ((node as NodeLike).interval.overlaps(interval)) {
        results.push((node as NodeLike).interval);
    }

    if (node.left !== NIL && node.left.max >= interval.low) {
        searchAll.call(this, interval, node.left, results);
    }

    if (node.right !== NIL && node.right.min <= interval.high) {
        searchAll.call(this, interval, node.right, results);
    }

    return results;
}

function leftRotate(this: IntervalTree, x: NodeLike): void {
    var y = x.right as NodeLike;
    x.right = y.left;
    if (y.left !== NIL) {
        (y.left as NodeLike).parent = x;
    }
    y.parent = x.parent;
    if (x.parent === NIL) {
        this.root = y;
    } else {
        if ((x.parent as NodeLike).left === x) {
            (x.parent as NodeLike).left = y;
        } else {
            (x.parent as NodeLike).right = y;
        }
    }
    y.left = x;
    x.parent = y;

    applyUpdate.call(this, x);
    // no need to apply update on y, since it'll y is an ancestor
    // of x, and will be touched by applyUpdate().
}


function rightRotate(this: IntervalTree, x: NodeLike): void {
    var y = x.left as NodeLike;
    x.left = y.right;
    if (y.right !== NIL) {
        (y.right as NodeLike).parent = x;
    }
    y.parent = x.parent;
    if (x.parent === NIL) {
        this.root = y;
    } else {
        if ((x.parent as NodeLike).right === x) {
            (x.parent as NodeLike).right = y;
        } else {
            (x.parent as NodeLike).left = y;
        }
    }
    y.right = x;
    x.parent = y;


    applyUpdate.call(this, x);
    // no need to apply update on y, since it'll y is an ancestor
    // of x, and will be touched by applyUpdate().
}


// Applies the statistic update on the node and its ancestors.
function applyUpdate(this: IntervalTree, node: NodeLike | NILNode): void {
    while (node !== NIL) {
        const n = node as NodeLike;
        var nodeMax: number = n.left.max > n.right.max ? n.left.max : n.right.max;
        var intervalHigh: number = n.interval.high;
        n.max = nodeMax > intervalHigh ? nodeMax : intervalHigh;

        var nodeMin: number = n.left.min < n.right.min ? n.left.min : n.right.min;
        var intervalLow: number = n.interval.low;
        n.min = nodeMin < intervalLow ? nodeMin : intervalLow;

        node = n.parent;
    }
}


class Interval {
    low: number;
    high: number;
    value: unknown;

    constructor(low: number, high: number, value: unknown) {
        this.low = low;
        this.high = high;
        this.value = value;
    }

    equals(other: Interval | null | undefined): boolean {
        if (!other) {
            return false;
        }
        if (this === other) {
            return true;
        }
        return (this.low === other.low &&
            this.high === other.high);

    }

    compareTo(other: Interval): number {
        if (this.low < other.low)
            return -1;
        if (this.low > other.low)
            return 1;

        if (this.high < other.high)
            return -1;
        if (this.high > other.high)
            return 1;

        return 0;
    }

    /**
     * Returns true if this interval overlaps the other.
     */
    overlaps(other: Interval): boolean {
            return (this.low <= other.high && other.low <= this.high);
    }
}

interface NodeLike {
    parent: NodeLike | NILNode;
    left: NodeLike | NILNode;
    right: NodeLike | NILNode;
    interval: Interval;
    color: number;
    max: number;
    min: number;
}

class Node implements NodeLike {
    parent: NodeLike | NILNode = NIL;
    left: NodeLike | NILNode = NIL;
    right: NodeLike | NILNode = NIL;
    interval: Interval;
    color: number = RED;
    max: number;
    min: number;

    constructor(interval: Interval) {
        this.interval = interval;
        this.max = interval.high;
        this.min = interval.low;
    }
}

export default IntervalTree;
