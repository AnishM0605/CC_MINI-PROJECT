/**
 * LogEntry Model
 * Represents a single entry in the RAFT log
 */

class LogEntry {
  /**
   * @param {number} index - Position in the log
   * @param {number} term - Term when entry was created
   * @param {string} type - Type of entry (e.g., 'stroke', 'config')
   * @param {object} data - Entry data (stroke information, etc.)
   */
  constructor(index, term, type, data) {
    this.index = index;
    this.term = term;
    this.type = type;
    this.data = data;
    this.createdAt = new Date().toISOString();
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      index: this.index,
      term: this.term,
      type: this.type,
      data: this.data,
      createdAt: this.createdAt,
    };
  }

  /**
   * Create LogEntry from JSON
   */
  static fromJSON(json) {
    const entry = new LogEntry(json.index, json.term, json.type, json.data);
    entry.createdAt = json.createdAt;
    return entry;
  }
}

module.exports = LogEntry;
