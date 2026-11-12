// 通用撤销/重做栈，保存深拷贝快照
export class History {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  reset(snapshot) {
    this.undoStack = [structuredClone(snapshot)];
    this.redoStack = [];
  }

  push(snapshot) {
    this.undoStack.push(structuredClone(snapshot));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current) {
    if (this.undoStack.length <= 1) return null;
    this.undoStack.pop();
    this.redoStack.push(structuredClone(current));
    return structuredClone(this.undoStack[this.undoStack.length - 1]);
  }

  redo(current) {
    if (!this.redoStack.length) return null;
    const next = this.redoStack.pop();
    this.undoStack.push(structuredClone(next));
    return structuredClone(next);
  }

  canUndo() {
    return this.undoStack.length > 1;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }
}
