/**
 * CSMA/CD Binary Exponential Backoff Simulation Engine
 * 
 * Exact 1:1 port of CsmaCdApi/Core/DynamicCsmaEngine.cs
 * All constants, logic flow, and rounding behavior preserved identically.
 */

const IFG_DUR = 9.6;
const SLOT = 51.2;
const COL_DUR = 51.2;
const JAM_DUR = 3.2;
const TAU = 25.6;
const BITRATE = 10.0;
const EPS = 0.001;
const MAX_ITER = 5000;

function R(v) {
    return Math.round(v * 10) / 10;
}

class SNode {
    constructor(inp) {
        this.name = inp.name;
        this.txDur = inp.frameSize * 8.0 / BITRATE;
        this.bos = inp.backoffs;
        this.bi = 0;
        this.penSlots = 0;
        this.penDur = 0;
        this.doneAt = 0;
    }

    nextPen() {
        if (this.bos.length === 0) return 0;
        if (this.bi < this.bos.length) return this.bos[this.bi];
        return this.bos[this.bos.length - 1];
    }
}

class PoolEntry {
    constructor(node, start, end) {
        this.node = node;
        this.startTime = start;
        this.endTime = end;
    }
}

function runSimulation(request) {
    let _ev = [];
    let _pool = [];
    let _waiting = [];
    let _ph = {};
    let _t = 0;
    let _iter = 0;
    let _next = null;

    // --- Helper functions (mirrors C# private methods) ---

    function endPh(n, at) {
        if (_ph[n.name] !== undefined) {
            let rec = _ph[n.name];
            delete _ph[n.name];
            if (R(at) - R(rec.t) > EPS) {
                _ev.push({
                    node: n.name,
                    eventType: rec.ty,
                    startTime: R(rec.t),
                    endTime: R(at),
                    notes: rec.no
                });
            }
        }
    }

    function ph(n, type, at, notes) {
        if (notes === undefined) notes = "";
        endPh(n, at);
        _ph[n.name] = { ty: type, t: at, no: notes };
    }

    function addEv(name, type, s, e, notes) {
        if (notes === undefined) notes = "";
        if (R(e) - R(s) > EPS) {
            _ev.push({
                node: name,
                eventType: type,
                startTime: R(s),
                endTime: R(e),
                notes: notes
            });
        }
    }

    function movePoolFinishedToWaiting(from, to) {
        let finished = _pool.filter(p => p.endTime >= from - EPS && p.endTime <= to + EPS);
        finished.forEach(p => {
            _pool.splice(_pool.indexOf(p), 1);
            endPh(p.node, R(p.endTime));
            ph(p.node, "WAITING", R(p.endTime));
            _waiting.push(p.node);
        });
    }

    function checkPoolDuringIfg(group) {
        let ifgStart = _t;
        let ifgEnd = R(_t + IFG_DUR);
        let finished = _pool.filter(p => p.endTime >= ifgStart - EPS && p.endTime <= ifgEnd + EPS);
        finished.forEach(p => {
            _pool.splice(_pool.indexOf(p), 1);
            endPh(p.node, R(p.endTime));
            if (group !== null) {
                addEv(p.node.name, "IFG", R(p.endTime), ifgEnd);
                group.push(p.node);
            } else {
                ph(p.node, "WAITING", R(p.endTime));
                _waiting.push(p.node);
            }
        });
    }

    function takeAllWaiting() {
        let list = _waiting.slice();
        _waiting = [];
        return list;
    }

    // --- Core algorithm (mirrors C# Attempt/DoTx/DoCollision/Next) ---

    function attempt(g) {
        if (++_iter > MAX_ITER) return;
        if (g.length === 1) { doTx(g[0]); return; }
        doCollision(g);
    }

    function doTx(n) {
        let txS = _t, txE = R(_t + n.txDur);
        let tauBoundary = R(txS - IFG_DUR + TAU);

        // TAU check: find pool entries finishing backoff before they can sense our TX
        let invisibleEntries = _pool.filter(p => {
            let boEnd = R(p.endTime);
            return boEnd >= txS - EPS && boEnd < tauBoundary - EPS;
        });

        // Among invisible, which ones finish IFG before sensing TX? → collision
        let collidingEntries = invisibleEntries.filter(p => {
            let boEnd = R(p.endTime);
            return R(boEnd + IFG_DUR) < tauBoundary - EPS;
        });

        if (collidingEntries.length > 0) {
            // TX becomes a collision - these nodes can't sense our TX, do IFG, then attempt
            doTxCollision(n, txS, collidingEntries, invisibleEntries);
            return;
        }

        // Handle invisible entries that detect TX during IFG → WAITING (no collision)
        invisibleEntries.forEach(p => {
            _pool.splice(_pool.indexOf(p), 1);
            endPh(p.node, R(p.endTime));
            let boEnd = R(p.endTime);
            addEv(p.node.name, "IFG", boEnd, R(boEnd + IFG_DUR));
            ph(p.node, "WAITING", R(boEnd + IFG_DUR));
            _waiting.push(p.node);
        });

        // Normal TX path (remaining pool entries can sense TX)
        movePoolFinishedToWaiting(txS, txE);

        ph(n, "TX", txS); endPh(n, txE);
        n.doneAt = txE;
        _t = txE;

        let ifgE = R(_t + IFG_DUR);

        movePoolFinishedToWaiting(txE, ifgE);

        if (_waiting.length > 0) {
            let group = takeAllWaiting();
            group.forEach(w => ph(w, "IFG", _t));
            checkPoolDuringIfg(group);
            _t = ifgE;
            group.forEach(w => endPh(w, _t));
            _next = () => attempt(group);
        } else if (_pool.length > 0) {
            checkPoolDuringIfg(null);
            _t = ifgE;

            if (_waiting.length > 0) {
                let group = takeAllWaiting();
                group.forEach(w => addEv(w.name, "IFG", R(ifgE - IFG_DUR), ifgE));
                _next = () => attempt(group);
            } else {
                _next = () => next();
            }
        } else {
            _t = ifgE;
        }
    }

    function doTxCollision(n, txS, collidingEntries, invisibleEntries) {
        let cS = txS;
        let cE = R(cS + COL_DUR);
        let jE = R(cE + JAM_DUR);

        let lateJoiners = [];

        // Colliding entries: IFG then COLLISION
        collidingEntries.forEach(p => {
            _pool.splice(_pool.indexOf(p), 1);
            endPh(p.node, R(p.endTime));
            let boEnd = R(p.endTime);
            let ifgELocal = R(boEnd + IFG_DUR);
            addEv(p.node.name, "IFG", boEnd, ifgELocal);
            if (cE - ifgELocal > EPS) {
                addEv(p.node.name, "COLLISION", ifgELocal, cE);
            }
            lateJoiners.push(p.node);
        });

        // Invisible entries that detect TX during IFG → WAITING
        let ifgWaitEntries = invisibleEntries.filter(p => !collidingEntries.includes(p));
        ifgWaitEntries.forEach(p => {
            if (_pool.indexOf(p) !== -1) {
                _pool.splice(_pool.indexOf(p), 1);
                endPh(p.node, R(p.endTime));
                let boEnd = R(p.endTime);
                addEv(p.node.name, "IFG", boEnd, R(boEnd + IFG_DUR));
                ph(p.node, "WAITING", R(boEnd + IFG_DUR));
                _waiting.push(p.node);
            }
        });

        // N gets COLLISION (TX attempt failed)
        ph(n, "COLLISION", cS); endPh(n, cE);

        // Check for further late joiners in pool during collision window
        let furtherLateJoiners = [];
        let toRemove = [];
        _pool.forEach(p => {
            let boEnd = R(p.endTime);
            if (boEnd >= cS - EPS && boEnd < cE - EPS && boEnd - cS < TAU - EPS) {
                toRemove.push(p);
                endPh(p.node, boEnd);
                let ifgELocal = R(boEnd + IFG_DUR);
                addEv(p.node.name, "IFG", boEnd, ifgELocal);
                if (cE - ifgELocal > EPS) {
                    addEv(p.node.name, "COLLISION", ifgELocal, cE);
                }
                furtherLateJoiners.push(p.node);
            }
        });
        toRemove.forEach(p => _pool.splice(_pool.indexOf(p), 1));

        // Move remaining finished pool entries to WAITING
        movePoolFinishedToWaiting(cS, jE);

        // All colliders
        let allColliders = [n, ...lateJoiners, ...furtherLateJoiners];

        // JAM
        allColliders.forEach(nd => {
            ph(nd, "JAM", cE); endPh(nd, jE);
        });

        _t = jE;

        // Backoff
        allColliders.forEach(nd => {
            nd.penSlots = nd.nextPen();
            nd.penDur = R(nd.penSlots * SLOT);
            nd.bi++;
        });

        allColliders.forEach(nd => {
            let endTime = R(jE + nd.penDur);
            if (nd.penDur <= EPS) {
                _waiting.push(nd);
            } else {
                _pool.push(new PoolEntry(nd, jE, endTime));
                ph(nd, "BACKOFF", jE, "r=" + nd.penSlots);
            }
        });

        _next = () => next();
    }

    function doCollision(g) {
        let cS = _t, cE = R(cS + COL_DUR), jE = R(cE + JAM_DUR);

        let lateJoiners = [];
        let toRemove = [];
        _pool.forEach(p => {
            let boEnd = R(p.endTime);
            if (boEnd >= cS - EPS && boEnd < cE - EPS && boEnd - cS < TAU - EPS) {
                toRemove.push(p);
                endPh(p.node, boEnd);
                let ifgELocal = R(boEnd + IFG_DUR);
                addEv(p.node.name, "IFG", boEnd, ifgELocal);
                if (cE - ifgELocal > EPS) {
                    addEv(p.node.name, "COLLISION", ifgELocal, cE);
                }
                lateJoiners.push(p.node);
            }
        });
        toRemove.forEach(p => {
            _pool.splice(_pool.indexOf(p), 1);
        });

        g.forEach(n => {
            ph(n, "COLLISION", cS); endPh(n, cE);
        });

        movePoolFinishedToWaiting(cS, jE);

        let allColliders = g.slice();
        lateJoiners.forEach(lj => allColliders.push(lj));

        allColliders.forEach(n => {
            ph(n, "JAM", cE); endPh(n, jE);
        });

        _t = jE;

        allColliders.forEach(n => {
            n.penSlots = n.nextPen();
            n.penDur = R(n.penSlots * SLOT);
            n.bi++;
        });

        allColliders.forEach(n => {
            let endTime = R(jE + n.penDur);
            if (n.penDur <= EPS) {
                _waiting.push(n);
            } else {
                _pool.push(new PoolEntry(n, jE, endTime));
                ph(n, "BACKOFF", jE, "r=" + n.penSlots);
            }
        });

        _next = () => next();
    }

    function next() {
        if (++_iter > MAX_ITER) return;

        if (_waiting.length > 0) {
            let group = takeAllWaiting();
            group.forEach(n => ph(n, "IFG", _t));
            checkPoolDuringIfg(group);
            _t = R(_t + IFG_DUR);
            group.forEach(n => endPh(n, _t));
            _next = () => attempt(group);
        } else if (_pool.length > 0) {
            let minEnd = Math.min.apply(null, _pool.map(p => p.endTime));
            let finished = _pool.filter(p => p.endTime <= minEnd + EPS);
            finished.forEach(p => {
                _pool.splice(_pool.indexOf(p), 1);
                endPh(p.node, R(minEnd));
            });
            _t = R(minEnd);

            let group = finished.map(p => p.node);
            group.forEach(n => ph(n, "IFG", _t));
            checkPoolDuringIfg(group);
            _t = R(_t + IFG_DUR);
            group.forEach(n => endPh(n, _t));
            _next = () => attempt(group);
        }
    }

    // --- Main execution ---

    let nodes = request.nodes.map(n => new SNode(n));
    if (nodes.length === 0) return { events: [], summaries: {}, totalDuration: 0 };

    nodes.forEach(n => ph(n, "IFG", 0));
    _t = R(IFG_DUR);
    nodes.forEach(n => endPh(n, _t));

    _next = () => attempt(nodes);
    while (_next !== null && _iter < MAX_ITER) {
        let act = _next;
        _next = null;
        act();
    }

    let sums = {};
    nodes.forEach(n => {
        sums[n.name] = { name: n.name, completionTime: n.doneAt };
    });

    let maxCompletion = Math.max.apply(null, Object.values(sums).map(s => s.completionTime));

    return {
        events: _ev,
        summaries: sums,
        totalDuration: maxCompletion
    };
}