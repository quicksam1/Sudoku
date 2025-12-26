<template>
  <div class="sudoku-container">
    <v-stage ref="stageRef" :config="{ width: stageSize, height: stageSize }" :key="renderTick" @mousedown="onStageMouseDown">
      <v-layer>
        <!-- cells background and numbers (draw first so lines sit on top) -->
        <v-group>
          <template v-for="r in 9" :key="r">
            <template v-for="c in 9" :key="c">
              <v-rect
                :x="(c - 1) * cellSize + strokeOffset"
                :y="(r - 1) * cellSize + strokeOffset"
                :width="cellSize"
                :height="cellSize"
                :fill="isRowSelected(r - 1) || isColSelected(c - 1) || isBoxSelectedAt(r - 1, c - 1) ? '#f0f9ff' : (r - 1 + c - 1) % 2 === 0 ? '#ffffff' : '#fbfbfb'"
                @click="onCellClick(r - 1, c - 1, $event)"
              />
              <v-rect
                v-if="numberStrokeAt(r - 1, c - 1)"
                :x="(c - 1) * cellSize + strokeOffset + highlightInset"
                :y="(r - 1) * cellSize + strokeOffset + highlightInset"
                :width="cellSize - highlightInset * 2"
                :height="cellSize - highlightInset * 2"
                :fill="''"
                :stroke="numberStrokeAt(r - 1, c - 1)"
                :strokeWidth="3"
                listening="false"
              />
              <v-text
                v-if="cellValueAt(r - 1, c - 1) !== 0"
                :x="(c - 1) * cellSize + strokeOffset"
                :y="(r - 1) * cellSize + strokeOffset"
                :width="cellSize"
                :height="cellSize"
                :text="String(cellValueAt(r - 1, c - 1))"
                :fontSize="cellSize * 0.6"
                :fontFamily="'Arial'"
                :fill="numberFillAt(r - 1, c - 1)"
                align="center"
                verticalAlign="middle"
                @click="onCellClick(r - 1, c - 1, $event)"
              />
              <!-- candidates for empty cell: fixed 3x3 positions for 1..9 -->
              <template v-if="cellValueAt(r - 1, c - 1) === 0">
                <template v-for="(n, idx) in candidatesAt(r - 1, c - 1)" :key="idx">
                  <v-rect
                    v-if="candidateBgFillAt(r - 1, c - 1, n)"
                    :x="(c - 1) * cellSize + strokeOffset + candidateInset + (idx % 3) * candidateCell + candidatePad - (candidateBgExtra / 2)"
                    :y="(r - 1) * cellSize + strokeOffset + candidateInset + Math.floor(idx / 3) * candidateCell + candidatePad - (candidateBgExtra / 2)"
                    :width="candidateCell - candidatePad * 2 + candidateBgExtra"
                    :height="candidateCell - candidatePad * 2 + candidateBgExtra"
                    :fill="candidateBgFillAt(r - 1, c - 1, n)"
                    listening="false"
                  />
                  <v-text
                    :x="(c - 1) * cellSize + strokeOffset + candidateInset + (idx % 3) * candidateCell + candidatePad"
                    :y="(r - 1) * cellSize + strokeOffset + candidateInset + Math.floor(idx / 3) * candidateCell + candidatePad"
                    :width="candidateCell - candidatePad * 2"
                    :height="candidateCell - candidatePad * 2"
                    :text="n !== 0 ? String(n) : '·'"
                    :fontSize="cellSize * 0.25"
                    :fontFamily="'Arial'"
                    :fill="candidateFillAt(r - 1, c - 1, n)"
                    align="center"
                    verticalAlign="middle"
                    @click="onCellClick(r - 1, c - 1, $event)"
                  />
                </template>
              </template>
            </template>
          </template>
        </v-group>

        <!-- selection regions (merged outlines), drawn before grid lines so grid stays visible -->
        <v-group>
          <template v-for="(region, rIdx) in selectionRegions" :key="rIdx">
            <v-line :points="region" stroke="#3b82f6" :strokeWidth="4" :closed="true" fill="rgba(59,130,246,0.06)" listening="false" />
          </template>
        </v-group>

        <!-- grid lines (draw after cells so they are visible) -->
        <v-group>
          <template v-for="(line, idx) in lines" :key="idx">
            <v-line :points="line.points" :stroke="line.stroke" :strokeWidth="line.width" />
          </template>
        </v-group>

        <!-- outer border (inside stage with offset so stroke isn't clipped) -->
        <v-rect :x="strokeOffset" :y="strokeOffset" :width="cellSize * 9" :height="cellSize * 9" stroke="#000000" :strokeWidth="outerStroke" :cornerRadius="12" />
      </v-layer>
    </v-stage>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { generatePuzzleAsGrid, Grid, bitFor, ALL_CANDIDATES } from './sudoku';

const cellSize = 60;
const outerStroke = 3;
const strokeOffset = outerStroke / 2;
const stageSize = cellSize * 9 + outerStroke;
// padding inside each candidate cell to avoid touching borders
const candidatePad = cellSize * 0.04;
// inset for the whole 3x3 candidate grid inside a cell (keeps candidates away from cell borders)
const candidateInset = cellSize * 0.1;
const candidateGridSize = cellSize - candidateInset * 2;
const candidateCell = candidateGridSize / 3;
// extra pixels to expand candidate highlight background (centered)
const candidateBgExtra = 6;

// inset for number highlight border so it doesn't overlap grid lines (small, tight)
const highlightInset = 1;

const selectedSet = ref<Set<number>>(new Set());
const lastSelected = ref<{ r: number; c: number } | null>(null);
const stageRef = ref<any>(null);
// tick to force re-render when we mutate grid in-place
const renderTick = ref(0);

function idxOf(r: number, c: number) {
  return r * 9 + c;
}



function isRowSelected(r: number) {
  for (const i of selectedSet.value) if (Math.floor(i / 9) === r) return true;
  return false;
}

function isColSelected(c: number) {
  for (const i of selectedSet.value) if (i % 9 === c) return true;
  return false;
}

function isBoxSelectedAt(r: number, c: number) {
  const boxIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3);
  for (const i of selectedSet.value) {
    const br = Math.floor(i / 9);
    const bc = i % 9;
    if (Math.floor(br / 3) * 3 + Math.floor(bc / 3) === boxIndex) return true;
  }
  return false;
}

const grid = ref<Grid | null>(null);

onMounted(() => {
  // generate a puzzle grid (40 holes by default)
  grid.value = generatePuzzleAsGrid({ holes: 40 });
  window.addEventListener('keydown', handleKey);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKey);
});

function handleKey(e: KeyboardEvent) {
  if (!grid.value) return;
  if (selectedSet.value.size === 0 && !lastSelected.value) return;
  // digits 1-9 -> apply to all selected cells
  if (/^[1-9]$/.test(e.key)) {
    const v = parseInt(e.key, 10);
    for (const idx of selectedSet.value) grid.value.cells[idx]?.setValue(v);
    // recompute candidates for empties
    for (const cell of grid.value.cells) {
      if (cell.value === 0) cell.computeCandidates();
      else cell.clearCandidates();
    }
    renderTick.value++;
    e.preventDefault();
    return;
  }
  // clear cell(s)
  if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
    for (const idx of selectedSet.value) grid.value.cells[idx]?.setValue(0);
    for (const cell of grid.value.cells) {
      if (cell.value === 0) cell.computeCandidates();
      else cell.clearCandidates();
    }
    renderTick.value++;
    e.preventDefault();
    return;
  }
  // arrow navigation: move lastSelected (primary) and focus that cell
  if (!lastSelected.value) return;
  const s = lastSelected.value;
  if (e.key === 'ArrowUp') {
    const nr = Math.max(0, s.r - 1);
    lastSelected.value = { r: nr, c: s.c };
    selectedSet.value.clear();
    selectedSet.value.add(nr * 9 + s.c);
    renderTick.value++;
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowDown') {
    const nr = Math.min(8, s.r + 1);
    lastSelected.value = { r: nr, c: s.c };
    selectedSet.value.clear();
    selectedSet.value.add(nr * 9 + s.c);
    renderTick.value++;
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowLeft') {
    const nc = Math.max(0, s.c - 1);
    lastSelected.value = { r: s.r, c: nc };
    selectedSet.value.clear();
    selectedSet.value.add(s.r * 9 + nc);
    renderTick.value++;
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowRight') {
    const nc = Math.min(8, s.c + 1);
    lastSelected.value = { r: s.r, c: nc };
    selectedSet.value.clear();
    selectedSet.value.add(s.r * 9 + nc);
    renderTick.value++;
    e.preventDefault();
    return;
  }
}

function cellValueAt(r: number, c: number): number {
  if (!grid.value) return 0;
  const idx = r * 9 + c;
  const cell = grid.value.cells[idx];
  return cell ? cell.value : 0;
}

function onCellClick(r: number, c: number, ev?: any) {
  const idx = idxOf(r, c);
  const isCtrl = ev && (ev.ctrlKey || ev.metaKey);
  const isShift = ev && ev.shiftKey;
  if (isCtrl) {
    // toggle
    if (selectedSet.value.has(idx)) selectedSet.value.delete(idx);
    else selectedSet.value.add(idx);
    lastSelected.value = { r, c };
    renderTick.value++;
    return;
  }
  if (isShift && lastSelected.value) {
    // select rectangular range
    const r1 = Math.min(lastSelected.value.r, r);
    const r2 = Math.max(lastSelected.value.r, r);
    const c1 = Math.min(lastSelected.value.c, c);
    const c2 = Math.max(lastSelected.value.c, c);
    selectedSet.value.clear();
    for (let rr = r1; rr <= r2; rr++) {
      for (let cc = c1; cc <= c2; cc++) {
        selectedSet.value.add(idxOf(rr, cc));
      }
    }
    lastSelected.value = { r, c };
    renderTick.value++;
    return;
  }
  // default single select
  selectedSet.value.clear();
  selectedSet.value.add(idx);
  lastSelected.value = { r, c };
  renderTick.value++;
}

function onStageMouseDown(e: any) {
  if (!stageRef.value) return;
  try {
    const stage = stageRef.value.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const x = pos.x - strokeOffset;
    const y = pos.y - strokeOffset;
    const c = Math.floor(x / cellSize);
    const r = Math.floor(y / cellSize);
    if (r >= 0 && r < 9 && c >= 0 && c < 9) onCellClick(r, c, e?.evt || e);
  } catch (err) {
    // ignore
  }
}

function candidatesAt(r: number, c: number): number[] {
  if (!grid.value) return [];
  const idx = r * 9 + c;
  const cell = grid.value.cells[idx];
  if (!cell) return [];
  if (cell.value !== 0) return [];
  return cell.candidatesArray();
}

function candidateMaskAt(r: number, c: number): number {
  if (!grid.value) return 0;
  const idx = r * 9 + c;
  const cell = grid.value.cells[idx];
  if (!cell || cell.value !== 0) return 0;
  if (cell.candidates) return cell.candidates;
  const used = cell.row.mask | cell.col.mask | cell.box.mask;
  return ALL_CANDIDATES & ~used;
}

// When exactly one cell is selected and it has a fixed value, highlight all
// cells with the same value and highlight matching candidates in empty cells.
const matchValue = computed(() => {
  if (selectedSet.value.size !== 1) return 0;
  const idx = Array.from(selectedSet.value)[0];
  if (!grid.value) return 0;
  const cell = grid.value.cells[idx!];
  if (!cell) return 0;
  return cell.value || 0;
});

const matchingCells = computed(() => {
  const v = matchValue.value;
  const s = new Set<number>();
  if (!v || !grid.value) return s;
  for (let i = 0; i < 81; i++) {
    const cell = grid.value.cells[i];
    if (cell && cell.value === v) s.add(i);
  }
  return s;
});

function numberFillAt(r: number, c: number) {
  // text color stays default; border indicates match
  return '#111827';
}

function numberStrokeAt(r: number, c: number) {
  const idx = idxOf(r, c);
  // exclude the currently selected cell from highlight
  const selIdx = selectedSet.value.size === 1 ? Array.from(selectedSet.value)[0] : -1;
  if (idx === selIdx) return '';
  return matchingCells.value.has(idx) ? '#f59e0b' : '';
}

function candidateFillAt(r: number, c: number, n: number) {
  // candidate text color remains default; background used to indicate match
  return n !== 0 ? '#6b7280' : '#e5e7eb';
}

function candidateBgFillAt(r: number, c: number, n: number) {
  const mv = matchValue.value;
  const idx = idxOf(r, c);
  // don't highlight background for the currently selected cell
  if (selectedSet.value.size === 1 && selectedSet.value.has(idx)) return '';
  return mv && n === mv ? 'rgba(34,197,94,0.26)' : '';
}

// Compute connected groups of selected cells (4-neighbor), build polygon vertices, and log them
const selectionRegions = computed(() => {
  const sel = selectedSet.value;
  const groups: number[][] = [];
  const polygons: number[][] = [];
  if (!sel || sel.size === 0) {
    console.log('selectionGroups', groups);
    console.log('selectionPolygons', polygons);
    return polygons;
  }

  // find connected components (4-neighbor)
  const visited = new Set<number>();
  for (const idx of sel) {
    if (visited.has(idx)) continue;
    const q: number[] = [idx];
    visited.add(idx);
    const group: number[] = [idx];
    while (q.length) {
      const cur = q.shift()!;
      const r = Math.floor(cur / 9);
      const c = cur % 9;
      const neigh: [number, number][] = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ];
      for (const [nr, nc] of neigh) {
        if (nr < 0 || nr > 8 || nc < 0 || nc > 8) continue;
        const nidx = nr * 9 + nc;
        if (!sel.has(nidx) || visited.has(nidx)) continue;
        visited.add(nidx);
        q.push(nidx);
        group.push(nidx);
      }
    }
    groups.push(group);
  }

  // for each group, collect exposed cell edges and chain into polygon(s)
  for (const group of groups) {
    const comp = new Set<number>(group);
    type Segment = { x1: number; y1: number; x2: number; y2: number };
    const segs: Segment[] = [];
    for (const cellIdx of comp) {
      const r = Math.floor(cellIdx / 9);
      const c = cellIdx % 9;
      const x = strokeOffset + c * cellSize;
      const y = strokeOffset + r * cellSize;
      const w = cellSize;
      const h = cellSize;
      const nTop = (r - 1) * 9 + c;
      if (r - 1 < 0 || !comp.has(nTop)) segs.push({ x1: x, y1: y, x2: x + w, y2: y });
      const nRight = r * 9 + (c + 1);
      if (c + 1 > 8 || !comp.has(nRight)) segs.push({ x1: x + w, y1: y, x2: x + w, y2: y + h });
      const nBottom = (r + 1) * 9 + c;
      if (r + 1 > 8 || !comp.has(nBottom)) segs.push({ x1: x + w, y1: y + h, x2: x, y2: y + h });
      const nLeft = r * 9 + (c - 1);
      if (c - 1 < 0 || !comp.has(nLeft)) segs.push({ x1: x, y1: y + h, x2: x, y2: y });
    }

    if (segs.length === 0) {
      polygons.push([]);
      continue;
    }

    // adjacency map
    const adj = new Map<string, string[]>();
    const addAdj = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a)!.push(b);
    };
    for (const s of segs) {
      const a = `${s.x1},${s.y1}`;
      const b = `${s.x2},${s.y2}`;
      addAdj(a, b);
    }

    const parse = (p: string) => p.split(',').map(Number) as [number, number];
    const used = new Set<string>();
    const edgeKey = (a: string, b: string) => `${a}|${b}`;
    const starts = Array.from(adj.keys()).sort((a, b) => {
      const pa = parse(a),
        pb = parse(b);
      if (pa[1] !== pb[1]) return pa[1] - pb[1];
      return pa[0] - pb[0];
    });

    for (const s of starts) {
      const outs = adj.get(s) || [];
      for (const out of outs) {
        if (used.has(edgeKey(s, out))) continue;
        let curA = s,
          curB = out;
        const pts: number[] = [];
        pts.push(...parse(curA));
        while (true) {
          used.add(edgeKey(curA, curB));
          pts.push(...parse(curB));
          const nexts = adj.get(curB) || [];
          let next: string | undefined;
          if (nexts.length === 1) next = nexts[0];
          else {
            const sorted = nexts.slice().sort((a, b) => {
              const pa = parse(a),
                pb = parse(b);
              if (pa[1] !== pb[1]) return pa[1] - pb[1];
              return pa[0] - pb[0];
            });
            for (const cand of sorted)
              if (!used.has(edgeKey(curB, cand))) {
                next = cand;
                break;
              }
          }
          if (!next) break;
          curA = curB;
          curB = next;
          if (curA === s && curB === out) break;
        }

        // simplify collinear
        const simp: number[] = [];
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i],
            y = pts[i + 1];
          // guard against unexpected undefined values (TypeScript safety)
          if (typeof x !== 'number' || typeof y !== 'number') continue;
          const n = simp.length;
          if (n >= 4) {
            const x1 = simp[n - 4]!,
              y1 = simp[n - 3]!;
            const x2 = simp[n - 2]!,
              y2 = simp[n - 1]!;
            if ((x2 - x1) * (y - y2) === (y2 - y1) * (x - x2)) {
              simp[n - 2] = x;
              simp[n - 1] = y;
              continue;
            }
          }
          simp.push(x, y);
        }
        polygons.push(simp);
      }
    }
  }

  // sanitize polygons: remove duplicates and collinear points (wrap-around aware)
  const sanitize = (pts: number[]): number[] => {
    if (!pts || pts.length < 6) return pts;
    const tmp: number[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i],
        y = pts[i + 1];
      // ensure we don't push undefined values (indexes may be out of bounds)
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      const n = tmp.length;
      if (n >= 2 && tmp[n - 2] === x && tmp[n - 1] === y) continue;
      tmp.push(x, y);
    }
    if (tmp.length >= 4) {
      if (tmp[0] === tmp[tmp.length - 2] && tmp[1] === tmp[tmp.length - 1]) tmp.splice(tmp.length - 2, 2);
    }
    let changed = true;
    while (changed && tmp.length >= 6) {
      changed = false;
      const nPoints = tmp.length / 2;
      for (let i = 0; i < nPoints; i++) {
        const iPrev = (i - 1 + nPoints) % nPoints,
          iNext = (i + 1) % nPoints;
        const x1 = tmp[iPrev * 2]!,
          y1 = tmp[iPrev * 2 + 1]!;
        const x2 = tmp[i * 2]!,
          y2 = tmp[i * 2 + 1]!;
        const x3 = tmp[iNext * 2]!,
          y3 = tmp[iNext * 2 + 1]!;
        if ((x2 - x1) * (y3 - y2) === (y2 - y1) * (x3 - x2)) {
          tmp.splice(i * 2, 2);
          changed = true;
          break;
        }
      }
    }
    return tmp;
  };

  const cleaned = polygons.map(sanitize);
  console.log('selectionGroups', groups);
  console.log('selectionPolygons', cleaned);
  return cleaned;
});

// Force computed to run when UI state changes: `renderTick` is incremented on selection
// changes so reading `selectionRegions.value` here forces computation and logging.
watch(
  renderTick,
  () => {
    void selectionRegions.value;
  },
  { immediate: true }
);

const lines = computed(() => {
  const arr: Array<{ points: number[]; stroke: string; width: number }> = [];
  // vertical lines (skip outermost to avoid overlapping outer stroke)
  for (let i = 1; i < 9; i++) {
    const x = strokeOffset + i * cellSize;
    arr.push({ points: [x, strokeOffset, x, strokeOffset + cellSize * 9], stroke: '#000000', width: i % 3 === 0 ? 3 : 1 });
  }
  // horizontal lines (skip outermost)
  for (let j = 1; j < 9; j++) {
    const y = strokeOffset + j * cellSize;
    arr.push({ points: [strokeOffset, y, strokeOffset + cellSize * 9, y], stroke: '#000000', width: j % 3 === 0 ? 3 : 1 });
  }
  return arr;
});
</script>

<style scoped>
.sudoku-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
}
</style>
