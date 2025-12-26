import { Grid, Cell, ALL_CANDIDATES, bitFor, createGrid, gridFromMatrix, gridToMatrix } from './sudoku-core';

function shuffle<T>(arr: T[], rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

export interface GenerateOptions {
  /** 是否在挖空时保证唯一解，默认 true */
  ensureUnique?: boolean;
  /** 最终保留的给定数（clues），与 holes 二选一优先使用 clues */
  clues?: number;
  /** 指定要移除的格子数（holes），优先级低于 clues */
  holes?: number;
  /** 可选随机函数，便于测试 */
  random?: () => number;
}

function bitCount(n: number) {
  return (n.toString(2).match(/1/g) || []).length;
}

/** 基于 `Grid` 的解计数（上限 limit），返回 {count, solutionMatrix?} */
export function countSolutionsOnGrid(gridInput: Grid, limit = 2) {
  // clone grid to avoid mutating original
  const clone = gridFromMatrix(gridToMatrix(gridInput));
  const empties: Cell[] = clone.cells.filter((c) => c.value === 0);
  let count = 0;
  let firstSolution: number[][] | null = null;

  function dfs() {
    if (count >= limit) return;
    if (empties.length === 0) {
      count++;
      if (count === 1) firstSolution = gridToMatrix(clone);
      return;
    }

    // MRV: pick empty with minimal candidates
    let bestIdx = -1;
    let bestCnt = 10;
    for (let i = 0; i < empties.length; i++) {
      const cell = empties[i]!;
      const used = cell.row.mask | cell.col.mask | cell.box.mask;
      const avail = ALL_CANDIDATES & ~used;
      const cnt = bitCount(avail);
      if (cnt === 0) return; // dead end
      if (cnt < bestCnt) { bestCnt = cnt; bestIdx = i; if (cnt === 1) break; }
    }

    if (bestIdx < 0) return;
    const cell = empties.splice(bestIdx, 1)[0]!;
    const used = cell.row.mask | cell.col.mask | cell.box.mask;
    let avail = ALL_CANDIDATES & ~used;
    for (let n = 1; n <= 9; n++) {
      const b = bitFor(n);
      if ((avail & b) === 0) continue;
      if (!cell.setValue(n)) continue;
      dfs();
      cell.setValue(0);
      if (count >= limit) break;
    }

    empties.splice(bestIdx, 0, cell);
  }

  dfs();
  return { count, solution: firstSolution };
}

/** 在 `Grid` 上生成完整解（直接操作 `Cell`） */
export function generateFullGridOnGrid(random = Math.random): Grid {
  const grid = createGrid();
  const empties: Cell[] = grid.cells.slice();

  function dfs(): boolean {
    if (empties.length === 0) return true;
    // MRV
    let bestIdx = -1;
    let bestCnt = 10;
    for (let i = 0; i < empties.length; i++) {
      const cell = empties[i]!;
      const used = cell.row.mask | cell.col.mask | cell.box.mask;
      const cnt = bitCount(ALL_CANDIDATES & ~used);
      if (cnt < bestCnt) { bestCnt = cnt; bestIdx = i; if (cnt === 1) break; }
    }

    if (bestIdx < 0) return false;
    const cell = empties.splice(bestIdx, 1)[0]!;
    const used = cell.row.mask | cell.col.mask | cell.box.mask;
    const availNums: number[] = [];
    for (let n = 1; n <= 9; n++) if (((ALL_CANDIDATES & ~used) & bitFor(n)) !== 0) availNums.push(n);
    // shuffle
    shuffle(availNums, random);

    for (const n of availNums) {
      if (!cell.setValue(n)) continue;
      if (dfs()) return true;
      cell.setValue(0);
    }

    empties.splice(bestIdx, 0, cell);
    return false;
  }

  const ok = dfs();
  if (!ok) throw new Error('failed to generate full grid on Grid');
  return grid;
}

/** 在 `Grid` 上生成拼图（在原地修改 Grid 并返回），可选保证唯一解 */
export function generatePuzzleOnGrid(options: GenerateOptions = {}): Grid {
  const rnd = options.random ?? Math.random;
  const full = generateFullGridOnGrid(rnd);
  const puzzle = gridFromMatrix(gridToMatrix(full)); // copy

  let toRemove = options.holes ?? (options.clues ? (81 - options.clues) : 40);
  if (options.clues != null) toRemove = 81 - options.clues;

  const indices = Array.from({length:81}, (_,i)=>i);
  shuffle(indices, rnd);

  for (const idx of indices) {
    if (toRemove <= 0) break;
    const c = puzzle.cells[idx];
    if (!c) continue;
    const backup = c.value;
    c.setValue(0);
    if (options.ensureUnique ?? true) {
      const {count} = countSolutionsOnGrid(puzzle, 2);
      if (count !== 1) { c.setValue(backup); continue; }
    }
    toRemove--;
  }

  // finalize: compute candidates once for all empty cells
  for (const cell of puzzle.cells) {
    if (cell.value === 0) cell.computeCandidates();
    else cell.clearCandidates();
  }

  return puzzle;
}

// Compatibility wrappers (previous API)
export function generateFullGridAsGrid(random = Math.random): Grid {
  return generateFullGridOnGrid(random);
}

export function generatePuzzleAsGrid(options: GenerateOptions = {}): Grid {
  return generatePuzzleOnGrid(options);
}
