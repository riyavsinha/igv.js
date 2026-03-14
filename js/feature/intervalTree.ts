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

    insert(start: number, end: number, value: any): void {

        var interval = new Interval(start, end, value);
        var x = new (Node as any)(interval);
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

        function logNode(node: any, indent: number): void {

            var space = "";
            for (var i = 0; i < indent; i++) space += " ";
            console.log(space + node.interval.low + " " + node.interval.high); // + " " + (node.interval.value ? node.interval.value : " null"));

            indent += 5;

            if (node.left !== NIL) logNode(node.left, indent);
            if (node.right !== NIL) logNode(node.right, indent);
        }

    }

    mapIntervals(func: (interval: Interval) => void): void {

        applyInterval(this.root);

        function applyInterval(node: any): void {

            func(node.interval);

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

function searchAll(this: IntervalTree, interval: Interval, node: any, results: Interval[]): Interval[] {

    if (node.interval.overlaps(interval)) {
        results.push(node.interval);
    }

    if (node.left !== NIL && node.left.max >= interval.low) {
        searchAll.call(this, interval, node.left, results);
    }

    if (node.right !== NIL && node.right.min <= interval.high) {
        searchAll.call(this, interval, node.right, results);
    }

    return results;
}

function leftRotate(this: IntervalTree, x: any): void {
    var y = x.right;
    x.right = y.left;
    if (y.left !== NIL) {
        y.left.parent = x;
    }
    y.parent = x.parent;
    if (x.parent === NIL) {
        this.root = y;
    } else {
        if (x.parent.left === x) {
            x.parent.left = y;
        } else {
            x.parent.right = y;
        }
    }
    y.left = x;
    x.parent = y;

    applyUpdate.call(this, x);
    // no need to apply update on y, since it'll y is an ancestor
    // of x, and will be touched by applyUpdate().
}


function rightRotate(this: IntervalTree, x: any): void {
    var y = x.left;
    x.left = y.right;
    if (y.right !== NIL) {
        y.right.parent = x;
    }
    y.parent = x.parent;
    if (x.parent === NIL) {
        this.root = y;
    } else {
        if (x.parent.right === x) {
            x.parent.right = y;
        } else {
            x.parent.left = y;
        }
    }
    y.right = x;
    x.parent = y;


    applyUpdate.call(this, x);
    // no need to apply update on y, since it'll y is an ancestor
    // of x, and will be touched by applyUpdate().
}


// Applies the statistic update on the node and its ancestors.
function applyUpdate(this: IntervalTree, node: any): void {
    while (node !== NIL) {
        var nodeMax: number = node.left.max > node.right.max ? node.left.max : node.right.max;
        var intervalHigh: number = node.interval.high;
        node.max = nodeMax > intervalHigh ? nodeMax : intervalHigh;

        var nodeMin: number = node.left.min < node.right.min ? node.left.min : node.right.min;
        var intervalLow: number = node.interval.low;
        node.min = nodeMin < intervalLow ? nodeMin : intervalLow;

        node = node.parent;
    }
}


class Interval {
    low: number;
    high: number;
    value: any;

    constructor(low: number, high: number, value: any) {
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

function Node(this: NodeLike, interval: Interval): void {
    this.parent = NIL;
    this.left = NIL;
    this.right = NIL;
    this.interval = interval;
    this.color = RED;
}


//
//
//    function minimum(node) {
//        while (node.left != NIL) {
//            node = node.left;
//        }
//        return node;
//    }
//
//
//    function maximum(node) {
//
//        while (node.right != NIL) {
//            node = node.right;
//        }
//        return node;
//    }
//
//
//    function successor(x) {
//
//        if (x.right != NIL) {
//            return minimum(x.right);
//        }
//        var y = x.parent;
//        while (y != NIL && x == y.right) {
//            x = y;
//            y = y.parent;
//        }
//        return y;
//    }
//
//
//    function predecessor(x) {
//        if (x.left != NIL) {
//            return maximum(x.left);
//        }
//        var y = x.parent;
//        while (y != NIL && x == y.left) {
//            x = y;
//            y = y.parent;
//        }
//        return y;
//    }
//
//
//
//    allRedNodesFollowConstraints = function (node) {
//        if (node == NIL)
//            return true;
//
//        if (node.color == BLACK) {
//            return (this.allRedNodesFollowConstraints(node.left) &&
//                this.allRedNodesFollowConstraints(node.right));
//        }
//
//        // At this point, we know we're on a RED node.
//        return (node.left.color == BLACK &&
//            node.right.color == BLACK &&
//            this.allRedNodesFollowConstraints(node.left) &&
//            this.allRedNodesFollowConstraints(node.right));
//    }
//
//
//    // Check that both ends are equally balanced in terms of black height.
//    isBalancedBlackHeight = function (node) {
//        if (node == NIL)
//            return true;
//        return (blackHeight(node.left) == blackHeight(node.right) &&
//            this.isBalancedBlackHeight(node.left) &&
//            this.isBalancedBlackHeight(node.right));
//    }
//
//
//    // The black height of a node should be left/right equal.
//    blackHeight = function (node) {
//        if (node == NIL)
//            return 0;
//        var leftBlackHeight = blackHeight(node.left);
//        if (node.color == BLACK) {
//            return leftBlackHeight + 1;
//        } else {
//            return leftBlackHeight;
//        }
//    }


/**
 * Test code: make sure that the tree has all the properties
 * defined by Red Black trees and interval trees
 * <p/>
 * o.  Root is black.
 * <p/>
 * o.  NIL is black.
 * <p/>
 * o.  Red nodes have black children.
 * <p/>
 * o.  Every path from root to leaves contains the same number of
 * black nodes.
 * <p/>
 * o.  getMax(node) is the maximum of any interval rooted at that node..
 * <p/>
 * This code is expensive, and only meant to be used for
 * assertions and testing.
 */
//
//    isValid = function () {
//        if (this.root.color != BLACK) {
//            logger.warn("root color is wrong");
//            return false;
//        }
//        if (NIL.color != BLACK) {
//            logger.warn("NIL color is wrong");
//            return false;
//        }
//        if (allRedNodesFollowConstraints(this.root) == false) {
//            logger.warn("red node doesn't follow constraints");
//            return false;
//        }
//        if (isBalancedBlackHeight(this.root) == false) {
//            logger.warn("black height unbalanced");
//            return false;
//        }
//
//        return hasCorrectMaxFields(this.root) &&
//            hasCorrectMinFields(this.root);
//    }
//
//
//    hasCorrectMaxFields = function (node) {
//        if (node == NIL)
//            return true;
//        return (getRealMax(node) == (node.max) &&
//            this.hasCorrectMaxFields(node.left) &&
//            this.hasCorrectMaxFields(node.right));
//    }
//
//
//    hasCorrectMinFields = function (node) {
//        if (node == NIL)
//            return true;
//        return (getRealMin(node) == (node.min) &&
//            this.hasCorrectMinFields(node.left) &&
//            this.hasCorrectMinFields(node.right));
//    }

export default IntervalTree;
