/**
 * State Machine
 * Handles state transitions: FOLLOWER <-> CANDIDATE <-> LEADER
 */

const CONSTANTS = require('../constants');

class StateMachine {
  constructor(nodeId, logger, onStateChange) {
    this.nodeId = nodeId;
    this.logger = logger;
    this.onStateChange = onStateChange;
    this.currentState = CONSTANTS.STATES.FOLLOWER;
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if node is a leader
   */
  isLeader() {
    return this.currentState === CONSTANTS.STATES.LEADER;
  }

  /**
   * Check if node is a follower
   */
  isFollower() {
    return this.currentState === CONSTANTS.STATES.FOLLOWER;
  }

  /**
   * Check if node is a candidate
   */
  isCandidate() {
    return this.currentState === CONSTANTS.STATES.CANDIDATE;
  }

  /**
   * Transition to FOLLOWER
   * (from CANDIDATE or LEADER)
   */
  becomeFollower(term) {
    const oldState = this.currentState;
    this.currentState = CONSTANTS.STATES.FOLLOWER;

    if (oldState !== CONSTANTS.STATES.FOLLOWER) {
      this.logger.stateTransition(oldState, CONSTANTS.STATES.FOLLOWER, term);
      this.onStateChange(CONSTANTS.STATES.FOLLOWER, term);
    }
  }

  /**
   * Transition to CANDIDATE
   * (from FOLLOWER during election timeout)
   */
  becomeCandidate(term) {
    const oldState = this.currentState;
    this.currentState = CONSTANTS.STATES.CANDIDATE;

    if (oldState !== CONSTANTS.STATES.CANDIDATE) {
      this.logger.stateTransition(oldState, CONSTANTS.STATES.CANDIDATE, term);
      this.onStateChange(CONSTANTS.STATES.CANDIDATE, term);
    }
  }

  /**
   * Transition to LEADER
   * (from CANDIDATE after winning election)
   */
  becomeLeader(term) {
    const oldState = this.currentState;
    this.currentState = CONSTANTS.STATES.LEADER;

    if (oldState !== CONSTANTS.STATES.LEADER) {
      this.logger.stateTransition(oldState, CONSTANTS.STATES.LEADER, term);
      this.onStateChange(CONSTANTS.STATES.LEADER, term);
    }
  }

  /**
   * Get readable state name
   */
  getStateName() {
    return this.currentState;
  }
}

module.exports = StateMachine;
