/**
 * Term Manager Service
 * Handles term-related logic in RAFT protocol
 */

class TermManager {
  constructor(initialTerm = 0) {
    this.currentTerm = initialTerm;
    this.termChangeCallbacks = [];
  }

  /**
   * Register callback for term changes
   */
  onTermChange(callback) {
    this.termChangeCallbacks.push(callback);
  }

  /**
   * Get current term
   */
  getTerm() {
    return this.currentTerm;
  }

  /**
   * Increment term (candidate initiating election)
   */
  incrementTerm() {
    this.currentTerm++;
    this._notifyTermChange();
    return this.currentTerm;
  }

  /**
   * Update term if higher term is received
   * Higher term always wins in RAFT
   */
  updateTerm(newTerm) {
    if (newTerm > this.currentTerm) {
      this.currentTerm = newTerm;
      this._notifyTermChange();
      return true; // Term was updated
    }
    return false; // Term not updated (received term is not higher)
  }

  /**
   * Check if a term is valid (not stale)
   */
  isValidTerm(term) {
    return term >= this.currentTerm;
  }

  /**
   * Notify all listeners of term change
   */
  _notifyTermChange() {
    this.termChangeCallbacks.forEach(callback => {
      try {
        callback(this.currentTerm);
      } catch (err) {
        console.error('Error in term change callback:', err);
      }
    });
  }

  /**
   * Reset term to initial value
   */
  reset(initialTerm = 0) {
    this.currentTerm = initialTerm;
  }
}

module.exports = TermManager;
