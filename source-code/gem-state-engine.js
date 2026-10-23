/**
 * SECSForge Pro - SEMI E30 GEM State Machine & 300mm FOUP Wafer Carrier Engine
 * Standard: SEMI E30 (GEM), SEMI E87 (Carrier Management), SEMI E90 (Substrate Tracking)
 * Pure ES6+ Module - Zero External Runtime Dependencies
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GEMStateEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // SEMI E30 Control States
  const CONTROL_STATES = {
    EQUIPMENT_OFFLINE: 'EQUIPMENT_OFFLINE',
    ATTEMPT_ONLINE: 'ATTEMPT_ONLINE',
    HOST_OFFLINE: 'HOST_OFFLINE',
    ONLINE_LOCAL: 'ONLINE_LOCAL',
    ONLINE_REMOTE: 'ONLINE_REMOTE'
  };

  // SEMI E30 Communications States
  const COMM_STATES = {
    DISABLED: 'DISABLED',
    NOT_COMMUNICATING: 'NOT_COMMUNICATING',
    COMMUNICATING: 'COMMUNICATING'
  };

  // SEMI E87 Slot Map States
  const SLOT_STATES = {
    UNDEFINED: 0,
    EMPTY: 1,
    CORRECTLY_OCCUPIED: 2,
    DOUBLE_SLOTTED: 3,
    CROSS_SLOTTED: 4
  };

  const SLOT_STATE_NAMES = {
    0: 'Undefined',
    1: 'Empty',
    2: 'Correctly Occupied',
    3: 'Double Slotted (Error)',
    4: 'Cross Slotted (Error)'
  };

  class GEMStateEngine {
    constructor(initialConfig = {}) {
      this.commState = initialConfig.commState || COMM_STATES.NOT_COMMUNICATING;
      this.controlState = initialConfig.controlState || CONTROL_STATES.EQUIPMENT_OFFLINE;
      this.spoolingActive = false;
      this.spooledMessagesCount = 0;
      this.maxSpoolSize = initialConfig.maxSpoolSize || 5000;
      this.history = [];
      this.logTransition('INITIALIZE', this.controlState);

      // Carrier 300mm FOUP (25 slots)
      this.carrierId = initialConfig.carrierId || 'FOUP_BATCH_901';
      this.slots = new Array(25).fill(SLOT_STATES.EMPTY);
      // Populate sample wafer occupancy
      if (initialConfig.slots) {
        this.setSlotMap(initialConfig.slots);
      } else {
        // Default 15 wafers loaded, slots 1-15
        for (let i = 0; i < 15; i++) {
          this.slots[i] = SLOT_STATES.CORRECTLY_OCCUPIED;
        }
      }
    }

    logTransition(action, newState) {
      const entry = {
        timestamp: new Date().toISOString(),
        action,
        commState: this.commState,
        controlState: newState || this.controlState
      };
      this.history.unshift(entry);
      if (this.history.length > 50) this.history.pop();
    }

    /**
     * Handles Communications State Transitions
     */
    triggerCommEvent(event) {
      switch (event) {
        case 'ENABLE_COMM':
          if (this.commState === COMM_STATES.DISABLED) {
            this.commState = COMM_STATES.NOT_COMMUNICATING;
            this.logTransition('ENABLE_COMM');
            return { success: true, state: this.commState };
          }
          break;

        case 'ESTABLISH_COMM_SUCCESS': // S1F13/S1F14 exchanged
          this.commState = COMM_STATES.COMMUNICATING;
          this.logTransition('ESTABLISH_COMM_SUCCESS');
          return { success: true, state: this.commState };

        case 'COMM_FAILURE': // Timeout or link failure
          this.commState = COMM_STATES.NOT_COMMUNICATING;
          this.logTransition('COMM_FAILURE');
          return { success: true, state: this.commState };

        case 'DISABLE_COMM':
          this.commState = COMM_STATES.DISABLED;
          this.logTransition('DISABLE_COMM');
          return { success: true, state: this.commState };

        default:
          return { success: false, error: `Invalid comm event: ${event}` };
      }
      return { success: false, state: this.commState };
    }

    /**
     * Handles SEMI E30 Control State Transitions
     */
    triggerControlEvent(event) {
      const prev = this.controlState;
      let next = prev;

      switch (event) {
        case 'SWITCH_OFFLINE':
          next = CONTROL_STATES.EQUIPMENT_OFFLINE;
          break;

        case 'REQ_ONLINE':
          if (prev === CONTROL_STATES.EQUIPMENT_OFFLINE || prev === CONTROL_STATES.HOST_OFFLINE) {
            next = CONTROL_STATES.ATTEMPT_ONLINE;
          }
          break;

        case 'ONLINE_ACCEPTED': // S1F1/S1F2 or S1F17/S1F18 confirmed
          if (prev === CONTROL_STATES.ATTEMPT_ONLINE) {
            next = CONTROL_STATES.ONLINE_LOCAL;
          }
          break;

        case 'ONLINE_DENIED':
          if (prev === CONTROL_STATES.ATTEMPT_ONLINE) {
            next = CONTROL_STATES.HOST_OFFLINE;
          }
          break;

        case 'SWITCH_LOCAL':
          if (prev === CONTROL_STATES.ONLINE_REMOTE) {
            next = CONTROL_STATES.ONLINE_LOCAL;
          }
          break;

        case 'SWITCH_REMOTE':
          if (prev === CONTROL_STATES.ONLINE_LOCAL) {
            next = CONTROL_STATES.ONLINE_REMOTE;
          }
          break;

        case 'HOST_GO_OFFLINE':
          if (prev === CONTROL_STATES.ONLINE_LOCAL || prev === CONTROL_STATES.ONLINE_REMOTE) {
            next = CONTROL_STATES.HOST_OFFLINE;
          }
          break;

        default:
          return { success: false, error: `Invalid control event: ${event}` };
      }

      if (next !== prev) {
        this.controlState = next;
        this.logTransition(event, next);
        return { success: true, previousState: prev, currentState: next };
      }

      return { success: false, error: `State transition '${event}' not allowed from ${prev}` };
    }

    /**
     * 300mm FOUP Slot Map Management (SEMI E87)
     */
    setSlot(slotIndex, state) {
      if (slotIndex < 0 || slotIndex >= 25) {
        throw new Error(`Slot index must be 0..24 (Slot 1..25)`);
      }
      this.slots[slotIndex] = state;
    }

    setSlotMap(statesArray) {
      if (!Array.isArray(statesArray) || statesArray.length !== 25) {
        throw new Error('Slot map array must contain exactly 25 slot state integers');
      }
      this.slots = statesArray.map(s => Number(s));
    }

    /**
     * Audits 300mm FOUP for cross-slotting, double-slotting, or mechanical hazards
     */
    auditCarrier() {
      let waferCount = 0;
      let emptyCount = 0;
      const issues = [];

      for (let i = 0; i < 25; i++) {
        const slotNum = i + 1;
        const state = this.slots[i];
        if (state === SLOT_STATES.CORRECTLY_OCCUPIED) {
          waferCount++;
        } else if (state === SLOT_STATES.EMPTY) {
          emptyCount++;
        } else if (state === SLOT_STATES.DOUBLE_SLOTTED) {
          issues.push({
            severity: 'CRITICAL',
            slot: slotNum,
            code: 'DOUBLE_SLOT_DETECTED',
            message: `Slot ${slotNum}: Double-slotted wafer detected. Robotic transfer will shatter wafer.`
          });
        } else if (state === SLOT_STATES.CROSS_SLOTTED) {
          issues.push({
            severity: 'CRITICAL',
            slot: slotNum,
            code: 'CROSS_SLOT_DETECTED',
            message: `Slot ${slotNum}: Cross-slotted wafer detected. Wafer is tilted across slot boundaries.`
          });
        } else if (state === SLOT_STATES.UNDEFINED) {
          issues.push({
            severity: 'WARNING',
            slot: slotNum,
            code: 'UNDEFINED_SLOT_STATUS',
            message: `Slot ${slotNum}: Sensor mapping inconclusive.`
          });
        }
      }

      return {
        carrierId: this.carrierId,
        totalSlots: 25,
        waferCount,
        emptyCount,
        isSafeForRobotics: issues.filter(iss => iss.severity === 'CRITICAL').length === 0,
        issues
      };
    }

    /**
     * Formats SECS-II S3F17 / S3F18 Carrier Action / Slot Map item
     */
    toSECSItem() {
      const slotItems = this.slots.map((state, idx) => ({
        type: 'L',
        value: [
          { type: 'U1', value: idx + 1 }, // Slot number (1..25)
          { type: 'U1', value: state }     // State code
        ]
      }));

      return {
        type: 'L',
        value: [
          { type: 'A', value: this.carrierId },
          { type: 'L', value: slotItems }
        ]
      };
    }
  }

  return {
    GEMStateEngine,
    CONTROL_STATES,
    COMM_STATES,
    SLOT_STATES,
    SLOT_STATE_NAMES
  };
});
