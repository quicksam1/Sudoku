export abstract class SudokuContainer {
  mask: number = 0;
  cells: Cell[] = [];
  constructor() {}
  /**
   * 重新计算当前容器的 mask：将已设置的数字 OR 到 mask 位图。
   */
  recomputeMask() {
    let m = 0;
    for (const cell of this.cells) {
      if (cell.value > 0) m |= bitFor(cell.value);
    }
    this.mask = m;
  }
}
export class Grid {
  cells: Cell[] = [];
  rows: Row[] = [];
  columns: Column[] = [];
  boxes: Box[] = [];
}

export class Cell {
  value: number = 0;
  candidates: number = 0;
  row: Row;
  col: Column;
  box: Box;
  constructor(col: Column, row: Row, box: Box) {
    this.row = row;
    this.col = col;
    this.box = box;
  }
  hasCandidate(n: number) {
    return (this.candidates & (1 << (n - 1))) !== 0;
  }
  addCandidate(n: number) {
    this.candidates |= 1 << (n - 1);
  }
  removeCandidate(n: number) {
    this.candidates &= ~(1 << (n - 1));
  }
  candidatesArray(): number[] {
    const arr: number[] = [];
    for (let n = 1; n <= 9; n++) {
      if ((this.candidates & (1 << (n - 1))) !== 0) arr.push(n);
      else arr.push(0);
    }
    return arr;
  }
  setAllCandidates() {
    this.candidates = ALL_CANDIDATES;
  }
  clearCandidates() {
    this.candidates = 0;
  }
  /**
   * 计算并设置当前单元格的候选位掩码，基于所属行/列/宫的 mask
   */
  computeCandidates(): number {
    const used = this.row.mask | this.col.mask | this.box.mask;
    this.candidates = ALL_CANDIDATES & ~used;
    return this.candidates;
  }
  
  setValue(v: number) {
    const old = this.value;
    // conflict check: if placing v (>0) and containers already have v (and it's not the same cell's current value), reject
    if (v > 0 && old !== v) {
      const b = bitFor(v);
      if ((this.row.mask & b) !== 0 || (this.col.mask & b) !== 0 || (this.box.mask & b) !== 0) {
        return false;
      }
    }
    this.value = v;

    // if clearing value, directly clear the bit in container masks (no scanning)
    if (v <= 0) {
      if (old > 0) {
        const bOld = bitFor(old);
        this.row.mask &= ~bOld;
        this.col.mask &= ~bOld;
        this.box.mask &= ~bOld;
      }

      return true;
    }

    // update masks: OR the bit into containers (faster than full recompute)
    if (old !== v) {
      const b = bitFor(v);
      this.row.mask |= b;
      this.col.mask |= b;
      this.box.mask |= b;
    }
    return true;
  }
}
export class Row extends SudokuContainer {}
export class Column extends SudokuContainer {}
export class Box extends SudokuContainer {}

// candidates mask utilities (位掩码，1<<0 表示数字1)
export const ALL_CANDIDATES = 0x1ff; // 9 bits set
export const bitFor = (n: number) => 1 << (n - 1);

/**
 * 创建并初始化一个空的 Grid 实例：
 * - 创建 9 个 Row/Column/Box
 * - 创建 81 个 Cell，建立 row/col/box 的引用并把 cell 放入对应容器的 cells 列表
 */
export function createGrid(): Grid {
  const grid = new Grid();
  for (let i = 0; i < 9; i++) {
    grid.rows.push(new Row());
    grid.columns.push(new Column());
    grid.boxes.push(new Box());
  }

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const boxIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const cell = new Cell(grid.columns[c]!, grid.rows[r]!, grid.boxes[boxIndex]!);
      cell.value = 0;
      cell.setAllCandidates();
      grid.cells.push(cell);
      grid.rows[r]!.cells.push(cell);
      grid.columns[c]!.cells.push(cell);
      grid.boxes[boxIndex]!.cells.push(cell);
    }
  }

  return grid;
}

/**
 * 从数值矩阵初始化 Grid（matrix 可为 9x9 的数字，0 表示空）
 */
export function gridFromMatrix(matrix: number[][]): Grid {
  const grid = createGrid();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = matrix?.[r]?.[c] ?? 0;
      const idx = r * 9 + c;
      const cell = grid.cells[idx]!;
      if (v === 0) {
        cell.value = 0;
        cell.clearCandidates();
      } else {
        // use setValue so peers' masks/counts are updated
        cell.setValue(v);
      }
    }
  }
  // after all values placed, compute candidates for empty cells from container masks
  for (const cell of grid.cells) {
    if (cell.value === 0) cell.computeCandidates();
    else cell.clearCandidates();
  }
  return grid;
}

/** 将 `Grid` 转换为数字矩阵 */
export function gridToMatrix(grid: Grid): number[][] {
  const m: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const cell = grid.cells[i]!;
    m[r]![c] = cell.value;
  }
  return m;
}

/** 将已知矩阵转换为 `Grid`（调用现有 `gridFromMatrix`）。 */
export function matrixToGrid(matrix: number[][]): Grid {
  return gridFromMatrix(matrix);
}
